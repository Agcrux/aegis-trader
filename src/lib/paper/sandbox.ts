import {
  DEFAULT_CAPS,
  FX_SPREAD_BPS,
  MIN_ORDER_NOTIONAL,
  SLIPPAGE_BPS,
  TESTER_START_CASH,
  legForSymbol,
} from "../config";
import type { Account, Leg, Position, Side } from "../types";

/**
 * The tester paper sandbox: play money, real prices, zero real dollars.
 *
 * State lives in one cookie so it survives refreshes and restarts without a
 * database, which means it must stay under the ~4KB cookie limit — hence the
 * tuple encoding and the history caps below. Everything here is pure so the
 * same reducers serve the manual order route, the sandbox engine, and tests.
 */

/** Positions are capped for cookie size, not for risk — this is play money. */
export const MAX_SANDBOX_POSITIONS = 12;
const MAX_TRADES = 30;
const MAX_MARKS = 60;
/** Leaves room for the other cookies a request carries. */
const MAX_COOKIE_CHARS = 3400;

export type PaperSource = "MANUAL" | "ENGINE";

export interface PaperPosition {
  leg: Leg;
  symbol: string;
  qty: number;
  avgPrice: number;
  openedAt: number;
}

export interface PaperTrade {
  side: Side;
  leg: Leg;
  symbol: string;
  qty: number;
  price: number;
  ts: number;
  source: PaperSource;
  /** Set on sells only: what the round trip would have earned in real USD. */
  realized: number | null;
}

export interface PaperSandbox {
  startedAt: number;
  startingCash: number;
  cash: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
  /** Equity marks [timestamp, equity] for the sandbox curve. */
  marks: Array<[number, number]>;
}

export interface PaperHolding extends PaperPosition {
  lastPrice: number;
  costBasis: number;
  marketValue: number;
  /** What this open position would be up or down in real USD. */
  potentialEarnings: number;
  potentialPct: number;
}

export interface PaperValuation {
  startedAt: number;
  startingCash: number;
  cash: number;
  invested: number;
  equity: number;
  /** Banked on paper: sum of realized P&L on closed round trips. */
  realized: number;
  /** Still open: mark-to-market P&L on current holdings. */
  open: number;
  /** The headline number: equity - starting cash = realized + open. */
  potentialEarnings: number;
  returnPct: number;
  holdings: PaperHolding[];
  tradesToday: number;
  dayPnlPct: number;
}

export function newSandbox(now: number = Date.now()): PaperSandbox {
  return {
    startedAt: now,
    startingCash: TESTER_START_CASH,
    cash: TESTER_START_CASH,
    positions: [],
    trades: [],
    marks: [[now, TESTER_START_CASH]],
  };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * The fill a tester actually gets: the real quote plus the same slippage and
 * spread haircut the internal simulator applies, so the sandbox never flatters
 * itself with perfect mid-price fills.
 */
export function paperFillPrice(refPrice: number, side: Side, leg: Leg): number {
  const bps = leg === "FX" ? FX_SPREAD_BPS : SLIPPAGE_BPS;
  const drag = 1 + (side === "BUY" ? bps : -bps) / 10000;
  return round(refPrice * drag, leg === "FX" ? 6 : 4);
}

export function findPosition(sb: PaperSandbox, symbol: string): PaperPosition | undefined {
  return sb.positions.find((p) => p.symbol === symbol);
}

export interface OrderInput {
  symbol: string;
  side: Side;
  /** Shares (fractional allowed). Ignored when `notional` is given. */
  qty?: number;
  /** Dollar amount to trade instead of a share count. */
  notional?: number;
  /** Sell the whole position. */
  all?: boolean;
  refPrice: number;
  source: PaperSource;
  now?: number;
}

export type OrderOutcome =
  | { ok: true; sandbox: PaperSandbox; trade: PaperTrade }
  | { ok: false; error: string };

/** Applies one paper order, returning a new sandbox (never mutates the input). */
export function applyOrder(sb: PaperSandbox, order: OrderInput): OrderOutcome {
  const symbol = order.symbol.trim().toUpperCase();
  const leg = legForSymbol(symbol);
  if (!leg) return { ok: false, error: `${symbol} isn't on the tradable watchlist.` };
  if (!(order.refPrice > 0)) {
    return { ok: false, error: `No live price for ${symbol} right now — try again in a moment.` };
  }

  const now = order.now ?? Date.now();
  const price = paperFillPrice(order.refPrice, order.side, leg);
  const existing = findPosition(sb, symbol);

  let qty: number;
  if (order.side === "SELL" && order.all) {
    qty = existing?.qty ?? 0;
  } else if (order.notional !== undefined) {
    qty = order.notional / price;
  } else {
    qty = order.qty ?? 0;
  }
  qty = round(qty, 6);
  if (!(qty > 0)) return { ok: false, error: "Enter a quantity above zero." };

  const positions = sb.positions.map((p) => ({ ...p }));
  const notional = round(qty * price, 2);

  if (order.side === "BUY") {
    if (notional < MIN_ORDER_NOTIONAL) {
      return { ok: false, error: `Orders under $${MIN_ORDER_NOTIONAL} aren't worth simulating.` };
    }
    if (notional > sb.cash + 0.005) {
      return {
        ok: false,
        error: `That costs $${notional.toFixed(2)} but the sandbox only has $${sb.cash.toFixed(2)} in cash.`,
      };
    }
    if (!existing && positions.length >= MAX_SANDBOX_POSITIONS) {
      return {
        ok: false,
        error: `The sandbox holds at most ${MAX_SANDBOX_POSITIONS} symbols at once — close one first.`,
      };
    }
    if (existing) {
      const target = positions.find((p) => p.symbol === symbol)!;
      const totalQty = target.qty + qty;
      target.avgPrice = round((target.avgPrice * target.qty + price * qty) / totalQty, 6);
      target.qty = round(totalQty, 6);
    } else {
      positions.push({ leg, symbol, qty, avgPrice: price, openedAt: now });
    }
    const trade: PaperTrade = {
      side: "BUY",
      leg,
      symbol,
      qty,
      price,
      ts: now,
      source: order.source,
      realized: null,
    };
    return {
      ok: true,
      sandbox: withHistory({ ...sb, cash: round(sb.cash - notional, 2), positions }, trade),
      trade,
    };
  }

  if (!existing) return { ok: false, error: `The sandbox holds no ${symbol} to sell.` };
  if (qty > existing.qty + 1e-6) {
    return {
      ok: false,
      error: `The sandbox holds ${existing.qty} ${symbol}, so it can't sell ${qty}.`,
    };
  }
  const sellQty = Math.min(qty, existing.qty);
  const realized = round((price - existing.avgPrice) * sellQty, 2);
  const remaining = round(existing.qty - sellQty, 6);
  const nextPositions =
    remaining > 1e-6
      ? positions.map((p) => (p.symbol === symbol ? { ...p, qty: remaining } : p))
      : positions.filter((p) => p.symbol !== symbol);
  const trade: PaperTrade = {
    side: "SELL",
    leg,
    symbol,
    qty: sellQty,
    price,
    ts: now,
    source: order.source,
    realized,
  };
  return {
    ok: true,
    sandbox: withHistory(
      { ...sb, cash: round(sb.cash + round(sellQty * price, 2), 2), positions: nextPositions },
      trade
    ),
    trade,
  };
}

function withHistory(sb: PaperSandbox, trade: PaperTrade): PaperSandbox {
  return { ...sb, trades: [...sb.trades, trade].slice(-MAX_TRADES) };
}

/**
 * Records an equity point on the sandbox curve, thinned to one per hour. The
 * opening mark is never overwritten so the curve keeps its origin.
 */
export function markEquity(sb: PaperSandbox, equity: number, now: number = Date.now()): PaperSandbox {
  const point: [number, number] = [now, round(equity, 2)];
  const last = sb.marks[sb.marks.length - 1];
  const replaceLast = sb.marks.length > 1 && last && now - last[0] < 3600_000;
  const marks = replaceLast ? [...sb.marks.slice(0, -1), point] : [...sb.marks, point];
  return { ...sb, marks: marks.slice(-MAX_MARKS) };
}

/**
 * Values the sandbox against real prices. `prices` maps symbol -> last price;
 * a missing symbol falls back to its own average cost, which reports zero P&L
 * rather than inventing a number.
 */
export function valueSandbox(sb: PaperSandbox, prices: Map<string, number>): PaperValuation {
  const holdings: PaperHolding[] = sb.positions.map((p) => {
    const lastPrice = prices.get(p.symbol) ?? p.avgPrice;
    const costBasis = p.qty * p.avgPrice;
    const marketValue = p.qty * lastPrice;
    return {
      ...p,
      lastPrice,
      costBasis: round(costBasis, 2),
      marketValue: round(marketValue, 2),
      potentialEarnings: round(marketValue - costBasis, 2),
      potentialPct: costBasis > 0 ? round(((marketValue - costBasis) / costBasis) * 100, 2) : 0,
    };
  });

  const invested = round(
    holdings.reduce((s, h) => s + h.marketValue, 0),
    2
  );
  const equity = round(sb.cash + invested, 2);
  const realized = round(
    sb.trades.reduce((s, t) => s + (t.realized ?? 0), 0),
    2
  );
  const open = round(
    holdings.reduce((s, h) => s + h.potentialEarnings, 0),
    2
  );
  const dayStart = firstEquityToday(sb, equity);

  return {
    startedAt: sb.startedAt,
    startingCash: sb.startingCash,
    cash: sb.cash,
    invested,
    equity,
    realized,
    open,
    potentialEarnings: round(equity - sb.startingCash, 2),
    returnPct: sb.startingCash > 0 ? round(((equity - sb.startingCash) / sb.startingCash) * 100, 2) : 0,
    holdings,
    tradesToday: sb.trades.filter((t) => isSameUtcDay(t.ts, Date.now())).length,
    dayPnlPct: dayStart > 0 ? round(((equity - dayStart) / dayStart) * 100, 2) : 0,
  };
}

function isSameUtcDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

function firstEquityToday(sb: PaperSandbox, fallback: number): number {
  const today = sb.marks.find((m) => isSameUtcDay(m[0], Date.now()));
  return today ? today[1] : fallback;
}

/**
 * Shapes the sandbox as an Account/Position pair so sandbox engine runs pass
 * through the very same risk chokepoint that guards real accounts.
 */
export function toAccount(sb: PaperSandbox, equity: number, ownerUserId: string): Account {
  const iso = new Date(sb.startedAt).toISOString();
  const peak = Math.max(equity, ...sb.marks.map((m) => m[1]), sb.startingCash);
  return {
    id: "sandbox",
    ownerUserId,
    label: "Tester sandbox",
    mode: "PAPER",
    frozen: false,
    frozenReason: null,
    paperStartedAt: iso,
    liveApprovedAt: null,
    caps: DEFAULT_CAPS,
    simCash: sb.cash,
    startingEquity: sb.startingCash,
    peakEquity: peak,
    discordUserId: null,
    createdAt: iso,
  };
}

export function toPositions(sb: PaperSandbox): Position[] {
  const iso = (ms: number) => new Date(ms).toISOString();
  return sb.positions.map((p) => ({
    id: `sandbox_${p.symbol}`,
    accountId: "sandbox",
    leg: p.leg,
    symbol: p.symbol,
    qty: p.qty,
    avgPrice: p.avgPrice,
    openedAt: iso(p.openedAt),
    updatedAt: iso(p.openedAt),
  }));
}

/* ---------------------------------------------------------------------------
 * Cookie codec. Tuples with single-letter codes keep a full sandbox inside the
 * 4KB cookie budget; `serialize` drops the oldest history if it still overflows.
 * ------------------------------------------------------------------------- */

type EncodedPosition = [string, string, number, number, number];
type EncodedTrade = [string, string, string, number, number, number, string, number | null];
type Encoded = [1, number, number, number, EncodedPosition[], EncodedTrade[], Array<[number, number]>];

const legCode = (leg: Leg): string => (leg === "FX" ? "F" : "S");
const legFromCode = (code: string): Leg => (code === "F" ? "FX" : "STOCK");
const sec = (ms: number): number => Math.round(ms / 1000);
const ms = (s: number): number => s * 1000;

function encode(sb: PaperSandbox): Encoded {
  return [
    1,
    sec(sb.startedAt),
    sb.startingCash,
    sb.cash,
    sb.positions.map((p) => [legCode(p.leg), p.symbol, p.qty, p.avgPrice, sec(p.openedAt)]),
    sb.trades.map((t) => [
      t.side === "BUY" ? "B" : "S",
      legCode(t.leg),
      t.symbol,
      t.qty,
      t.price,
      sec(t.ts),
      t.source === "ENGINE" ? "E" : "M",
      t.realized,
    ]),
    sb.marks.map((m) => [sec(m[0]), m[1]] as [number, number]),
  ];
}

export function serializeSandbox(sb: PaperSandbox): string {
  let candidate = sb;
  let out = JSON.stringify(encode(candidate));
  while (out.length > MAX_COOKIE_CHARS && (candidate.trades.length > 4 || candidate.marks.length > 4)) {
    candidate = {
      ...candidate,
      trades: candidate.trades.length > 4 ? candidate.trades.slice(1) : candidate.trades,
      marks: candidate.marks.length > 4 ? candidate.marks.slice(1) : candidate.marks,
    };
    out = JSON.stringify(encode(candidate));
  }
  return out;
}

/** Returns null for anything unreadable, so a corrupt cookie just starts over. */
export function deserializeSandbox(raw: string): PaperSandbox | null {
  try {
    const data = JSON.parse(raw) as Encoded;
    if (!Array.isArray(data) || data[0] !== 1) return null;
    const [, startedAt, startingCash, cash, positions, trades, marks] = data;
    if (!isFinite(startedAt) || !isFinite(cash)) return null;
    return {
      startedAt: ms(startedAt),
      startingCash: Number(startingCash) || TESTER_START_CASH,
      cash: Number(cash),
      positions: (positions ?? [])
        .filter((p) => legForSymbol(p[1]) !== null && Number(p[2]) > 0)
        .map((p) => ({
          leg: legFromCode(p[0]),
          symbol: p[1],
          qty: Number(p[2]),
          avgPrice: Number(p[3]),
          openedAt: ms(Number(p[4])),
        })),
      trades: (trades ?? []).map((t) => ({
        side: t[0] === "S" ? "SELL" : "BUY",
        leg: legFromCode(t[1]),
        symbol: t[2],
        qty: Number(t[3]),
        price: Number(t[4]),
        ts: ms(Number(t[5])),
        source: t[6] === "E" ? "ENGINE" : "MANUAL",
        realized: t[7] === null ? null : Number(t[7]),
      })),
      marks: (marks ?? []).map((m) => [ms(Number(m[0])), Number(m[1])] as [number, number]),
    };
  } catch {
    return null;
  }
}
