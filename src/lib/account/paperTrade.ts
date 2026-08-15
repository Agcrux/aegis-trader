import { ensureSchema, getSql, newId } from "../db";
import { paperFillPrice } from "../paper/sandbox";
import { bestPrice, getLiveQuote } from "../data/live";
import { legForSymbol, MIN_ORDER_NOTIONAL } from "../config";
import { writeJournal } from "../journal";
import type { SessionUser } from "../types";

/**
 * Manual paper trading for an OWNER's own database account. This is the
 * hands-on counterpart to the automated engine: same paper-fill math (real
 * quote minus a slippage/spread haircut), but the owner picks the trade.
 *
 * It writes to the same positions/trades tables the engine uses and journals
 * every fill tagged strategy="manual" so hand trades are always distinguishable
 * from automated ones. No broker is contacted and no real money exists — this
 * build has no live execution path at all.
 */

export interface OwnerAccountRow {
  id: string;
  label: string;
  sim_cash: string;
  owner_user_id: string;
  frozen: boolean;
}

export interface HoldingView {
  symbol: string;
  leg: "STOCK" | "FX";
  qty: number;
  avgPrice: number;
  lastPrice: number;
  marketValue: number;
  potentialEarnings: number;
  potentialPct: number;
}

export interface AccountTradeState {
  accountId: string;
  label: string;
  cash: number;
  holding: HoldingView | null;
}

/** The single account a user owns (each owner has exactly one). */
export async function loadOwnAccount(user: SessionUser): Promise<OwnerAccountRow | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT id, label, sim_cash, owner_user_id, frozen
    FROM accounts WHERE owner_user_id = ${user.id} ORDER BY created_at LIMIT 1`) as OwnerAccountRow[];
  return rows[0] ?? null;
}

async function holdingFor(
  accountId: string,
  symbol: string,
  leg: "STOCK" | "FX"
): Promise<HoldingView | null> {
  const sql = getSql();
  const rows = (await sql`SELECT qty, avg_price FROM positions
    WHERE account_id = ${accountId} AND symbol = ${symbol} AND leg = ${leg}`) as Array<{
    qty: string;
    avg_price: string;
  }>;
  if (!rows.length) return null;
  const qty = Number(rows[0].qty);
  const avgPrice = Number(rows[0].avg_price);
  const live = (await getLiveQuote(symbol, leg))?.price ?? avgPrice;
  const marketValue = qty * live;
  const cost = qty * avgPrice;
  return {
    symbol,
    leg,
    qty,
    avgPrice,
    lastPrice: live,
    marketValue: round2(marketValue),
    potentialEarnings: round2(marketValue - cost),
    potentialPct: cost > 0 ? round2(((marketValue - cost) / cost) * 100) : 0,
  };
}

export async function getAccountTradeState(
  user: SessionUser,
  symbol: string
): Promise<AccountTradeState | null> {
  const account = await loadOwnAccount(user);
  if (!account) return null;
  const leg = legForSymbol(symbol);
  const holding = leg ? await holdingFor(account.id, symbol, leg) : null;
  return {
    accountId: account.id,
    label: account.label,
    cash: Number(account.sim_cash),
    holding,
  };
}

export interface ManualOrderInput {
  symbol: string;
  side: "BUY" | "SELL";
  qty?: number;
  notional?: number;
  all?: boolean;
}

export type ManualOrderResult =
  | { ok: true; note: string; state: AccountTradeState }
  | { ok: false; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Records an equity point so the chart / performance page reflect a manual
 * funding or trade immediately, instead of waiting for the next engine run.
 * Uses cost basis for holdings (cheap, no extra quote fetches); the dashboard
 * headline still marks holdings to live prices.
 */
async function writeAccountSnapshot(accountId: string, cash: number): Promise<void> {
  const sql = getSql();
  const rows = (await sql`SELECT qty, avg_price FROM positions WHERE account_id = ${accountId}`) as Array<{
    qty: string;
    avg_price: string;
  }>;
  const invested = rows.reduce((s, r) => s + Number(r.qty) * Number(r.avg_price), 0);
  const equity = round2(cash + invested);
  await sql`INSERT INTO equity_snapshots (id, account_id, equity, cash)
    VALUES (${newId("eq")}, ${accountId}, ${equity}, ${cash})`;
}

/** Places one manual paper order against the owner's own account. */
export async function placeManualOrder(
  user: SessionUser,
  input: ManualOrderInput
): Promise<ManualOrderResult> {
  const symbol = input.symbol.trim().toUpperCase();
  const leg = legForSymbol(symbol);
  if (!leg) return { ok: false, error: `${symbol} isn't on the tradable watchlist.` };
  if (input.side !== "BUY" && input.side !== "SELL") {
    return { ok: false, error: "Side must be BUY or SELL." };
  }

  const account = await loadOwnAccount(user);
  if (!account) return { ok: false, error: "You don't have an owner account yet." };

  const refPrice = (await getLiveQuote(symbol, leg))?.price ?? (await bestPrice(symbol, leg)) ?? 0;
  if (!(refPrice > 0)) {
    return { ok: false, error: `No live price for ${symbol} right now — try again in a moment.` };
  }
  const price = paperFillPrice(refPrice, input.side, leg);

  const sql = getSql();
  const posRows = (await sql`SELECT id, qty, avg_price FROM positions
    WHERE account_id = ${account.id} AND symbol = ${symbol} AND leg = ${leg}`) as Array<{
    id: string;
    qty: string;
    avg_price: string;
  }>;
  const existing = posRows[0]
    ? { id: posRows[0].id, qty: Number(posRows[0].qty), avgPrice: Number(posRows[0].avg_price) }
    : null;
  const cash = Number(account.sim_cash);

  // Resolve quantity from shares / dollars / "all".
  let qty: number;
  if (input.side === "SELL" && input.all) qty = existing?.qty ?? 0;
  else if (typeof input.notional === "number") qty = input.notional / price;
  else qty = input.qty ?? 0;
  qty = round6(qty);
  if (!(qty > 0)) return { ok: false, error: "Enter a quantity above zero." };

  if (input.side === "BUY") {
    const notional = round2(qty * price);
    if (notional < MIN_ORDER_NOTIONAL) {
      return { ok: false, error: `Orders under $${MIN_ORDER_NOTIONAL} aren't worth simulating.` };
    }
    if (notional > cash + 0.005) {
      return {
        ok: false,
        error: `That costs $${notional.toFixed(2)} but the account only has $${cash.toFixed(2)} in paper cash.`,
      };
    }
    const newCash = round2(cash - notional);
    if (existing) {
      const totalQty = round6(existing.qty + qty);
      const newAvg = round6((existing.avgPrice * existing.qty + price * qty) / totalQty);
      await sql`UPDATE positions SET qty = ${totalQty}, avg_price = ${newAvg}, updated_at = now()
        WHERE id = ${existing.id}`;
    } else {
      await sql`INSERT INTO positions (id, account_id, leg, symbol, qty, avg_price)
        VALUES (${newId("ps")}, ${account.id}, ${leg}, ${symbol}, ${qty}, ${price})`;
    }
    await sql`INSERT INTO trades (id, account_id, leg, symbol, side, qty, price, notional, broker, status, strategy)
      VALUES (${newId("tr")}, ${account.id}, ${leg}, ${symbol}, 'BUY', ${qty}, ${price}, ${notional}, 'SIM', 'FILLED', 'manual')`;
    await sql`UPDATE accounts SET sim_cash = ${newCash} WHERE id = ${account.id}`;
    await writeJournal({
      accountId: account.id,
      kind: "TRADE",
      symbol,
      title: `Manual BUY ${symbol} — ${account.label}`,
      what: `Hand-placed paper buy: ${qty} ${symbol} at $${price.toFixed(leg === "FX" ? 4 : 2)} for $${notional.toFixed(2)}.`,
      why: `Placed manually by ${user.name} from the trading panel (paper money). Not an engine decision.`,
      data: { source: "manual", price, notional, cashAfter: newCash },
      accountLabel: account.label,
    });
    await writeAccountSnapshot(account.id, newCash);
    return { ok: true, note: `Bought ${qty} ${symbol} at $${price.toFixed(leg === "FX" ? 4 : 2)} on paper.`, state: (await getAccountTradeState(user, symbol))! };
  }

  // SELL
  if (!existing) return { ok: false, error: `You hold no ${symbol} to sell.` };
  if (qty > existing.qty + 1e-6) {
    return { ok: false, error: `You hold ${existing.qty} ${symbol}, so you can't sell ${qty}.` };
  }
  const sellQty = round6(Math.min(qty, existing.qty));
  const proceeds = round2(sellQty * price);
  const realized = round2((price - existing.avgPrice) * sellQty);
  const remaining = round6(existing.qty - sellQty);
  if (remaining > 1e-6) {
    await sql`UPDATE positions SET qty = ${remaining}, updated_at = now() WHERE id = ${existing.id}`;
  } else {
    await sql`DELETE FROM positions WHERE id = ${existing.id}`;
  }
  const newCash = round2(cash + proceeds);
  await sql`INSERT INTO trades (id, account_id, leg, symbol, side, qty, price, notional, broker, status, strategy, realized_pnl)
    VALUES (${newId("tr")}, ${account.id}, ${leg}, ${symbol}, 'SELL', ${sellQty}, ${price}, ${proceeds}, 'SIM', 'FILLED', 'manual', ${realized})`;
  await sql`UPDATE accounts SET sim_cash = ${newCash} WHERE id = ${account.id}`;
  await writeJournal({
    accountId: account.id,
    kind: "TRADE",
    symbol,
    title: `Manual SELL ${symbol} — ${account.label}`,
    what: `Hand-placed paper sell: ${sellQty} ${symbol} at $${price.toFixed(leg === "FX" ? 4 : 2)}, realizing $${realized.toFixed(2)}.`,
    why: `Placed manually by ${user.name} from the trading panel (paper money). Not an engine decision.`,
    data: { source: "manual", price, proceeds, realized, cashAfter: newCash },
    accountLabel: account.label,
  });
  await writeAccountSnapshot(account.id, newCash);
  return { ok: true, note: `Sold ${sellQty} ${symbol} at $${price.toFixed(leg === "FX" ? 4 : 2)} — realized $${realized.toFixed(2)}.`, state: (await getAccountTradeState(user, symbol))! };
}

/** Sets the owner's paper cash balance and rebaselines its return math. */
export async function setPaperBalance(
  user: SessionUser,
  balance: number
): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  if (!isFinite(balance) || balance < 0) return { ok: false, error: "Enter a balance of 0 or more." };
  const clamped = Math.min(10_000_000, Math.round(balance * 100) / 100);
  const account = await loadOwnAccount(user);
  if (!account) return { ok: false, error: "You don't have an owner account yet." };
  const sql = getSql();
  await sql`UPDATE accounts SET sim_cash = ${clamped}, starting_equity = ${clamped}, peak_equity = ${clamped}
    WHERE id = ${account.id}`;
  await writeJournal({
    accountId: account.id,
    kind: "SYSTEM",
    title: `Paper balance set — ${account.label}`,
    what: `${user.name} set the paper cash balance to $${clamped.toLocaleString("en-US")}.`,
    why: "Manual paper-balance adjustment (play money for testing). Real money is never involved in this build.",
    data: { balance: clamped },
    accountLabel: account.label,
  });
  await writeAccountSnapshot(account.id, clamped);
  return { ok: true, balance: clamped };
}
