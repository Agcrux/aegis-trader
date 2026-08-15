import { ensureSchema, getSql, newId, getState, setState } from "../db";
import { fetchMany } from "../data/market";
import { allSignals } from "../strategy/strategies";
import { evaluateEntry, evaluateExit, drawdownCheck, type RiskContext } from "../risk";
import { vetCandidate } from "../ai/vet";
import { placeOrder } from "../brokers";
import { writeJournal } from "../journal";
import { notifyDiscord, COLORS } from "../discord";
import { STOCK_WATCHLIST, FX_WATCHLIST } from "../config";
import type { Account, Caps, Position } from "../types";

/**
 * One full engine cycle. Designed to finish well inside a 60s serverless
 * budget: one data fetch shared across accounts, then per-account
 * mark-to-market → circuit breakers → exits → entries (risk → AI vet → fill),
 * journaling every decision including the decision to do nothing.
 */

interface TickReport {
  ok: boolean;
  ranAccounts: number;
  trades: number;
  vetoes: number;
  skips: number;
  errors: string[];
  summary: string;
}

function rowToAccount(r: Record<string, unknown>): Account {
  return {
    id: String(r.id),
    ownerUserId: String(r.owner_user_id),
    label: String(r.label),
    mode: String(r.mode) as Account["mode"],
    frozen: Boolean(r.frozen),
    frozenReason: (r.frozen_reason as string) ?? null,
    paperStartedAt: r.paper_started_at ? String(r.paper_started_at) : null,
    liveApprovedAt: r.live_approved_at ? String(r.live_approved_at) : null,
    caps: r.caps as Caps,
    simCash: Number(r.sim_cash),
    startingEquity: Number(r.starting_equity),
    peakEquity: Number(r.peak_equity),
    discordUserId: (r.discord_user_id as string) ?? null,
    createdAt: String(r.created_at),
  };
}

function rowToPosition(r: Record<string, unknown>): Position {
  return {
    id: String(r.id),
    accountId: String(r.account_id),
    leg: String(r.leg) as Position["leg"],
    symbol: String(r.symbol),
    qty: Number(r.qty),
    avgPrice: Number(r.avg_price),
    openedAt: String(r.opened_at),
    updatedAt: String(r.updated_at),
  };
}

export async function runEngineTick(trigger: string): Promise<TickReport> {
  const started = Date.now();
  await ensureSchema();
  const sql = getSql();

  // Simple overlap lock: skip if another run started in the last 2 minutes.
  const lock = await getState<{ at: number }>("engine_lock");
  if (lock && Date.now() - lock.at < 120000) {
    return {
      ok: true,
      ranAccounts: 0,
      trades: 0,
      vetoes: 0,
      skips: 0,
      errors: [],
      summary: "Skipped — another engine run started less than 2 minutes ago.",
    };
  }
  await setState("engine_lock", { at: Date.now() });

  const report: TickReport = {
    ok: true,
    ranAccounts: 0,
    trades: 0,
    vetoes: 0,
    skips: 0,
    errors: [],
    summary: "",
  };

  try {
    const accountRows = (await sql`SELECT * FROM accounts ORDER BY created_at`) as Array<
      Record<string, unknown>
    >;
    const accounts = accountRows.map(rowToAccount).filter((a) => a.mode !== "OFF" && !a.frozen);

    const [stocks, fx] = await Promise.all([
      fetchMany(STOCK_WATCHLIST, "STOCK", 320),
      fetchMany(FX_WATCHLIST, "FX", 320),
    ]);
    report.errors.push(...stocks.failures, ...fx.failures);

    const priceOf = (leg: string, symbol: string): number | null => {
      const bars = leg === "FX" ? fx.bars.get(symbol) : stocks.bars.get(symbol);
      return bars ? bars[bars.length - 1].close : null;
    };

    for (const account of accounts) {
      report.ranAccounts++;
      const posRows = (await sql`SELECT * FROM positions WHERE account_id = ${account.id}`) as Array<
        Record<string, unknown>
      >;
      const positions = posRows.map(rowToPosition);

      // Mark to market.
      let equity = account.simCash;
      for (const p of positions) {
        const price = priceOf(p.leg, p.symbol) ?? p.avgPrice;
        equity += p.qty * price;
      }
      equity = Math.round(equity * 100) / 100;

      // Day P&L vs first snapshot of today (UTC).
      const todayRows = (await sql`SELECT equity FROM equity_snapshots
        WHERE account_id = ${account.id} AND ts >= date_trunc('day', now())
        ORDER BY ts ASC LIMIT 1`) as Array<{ equity: string }>;
      const dayStart = todayRows.length ? Number(todayRows[0].equity) : equity;
      const dayPnlPct = dayStart > 0 ? ((equity - dayStart) / dayStart) * 100 : 0;

      await sql`INSERT INTO equity_snapshots (id, account_id, equity, cash)
        VALUES (${newId("eq")}, ${account.id}, ${equity}, ${account.simCash})`;

      // Master circuit breaker.
      const freeze = drawdownCheck(account, equity);
      if (freeze.shouldFreeze) {
        await sql`UPDATE accounts SET frozen = true, frozen_reason = ${freeze.reason} WHERE id = ${account.id}`;
        await writeJournal({
          accountId: account.id,
          kind: "RISK",
          title: `Circuit breaker: ${account.label} frozen`,
          what: `All trading on ${account.label} is frozen. Open positions remain (exits stay possible manually); no new trades will be placed.`,
          why: freeze.reason,
          discord: true,
          accountLabel: account.label,
        });
        continue;
      }
      if (equity > account.peakEquity) {
        await sql`UPDATE accounts SET peak_equity = ${equity} WHERE id = ${account.id}`;
      }

      const tradesTodayRows = (await sql`SELECT count(*)::int AS n FROM trades
        WHERE account_id = ${account.id} AND created_at >= date_trunc('day', now())`) as Array<{
        n: number;
      }>;
      let tradesToday = tradesTodayRows[0]?.n ?? 0;

      const signals = allSignals(stocks.bars, fx.bars, positions);
      const exits = signals.filter((s) => s.action === "EXIT");
      const entries = signals.filter((s) => s.action === "ENTER");

      let cash = account.simCash;
      const ctx = (): RiskContext => ({
        account,
        equity,
        cash,
        openPositions: positions,
        tradesToday,
        dayPnlPct,
        price: 0,
      });

      // Exits first — freeing capital and honoring strategy stop rules.
      for (const s of exits) {
        const price = priceOf(s.leg, s.symbol);
        if (price === null) continue;
        const verdict = evaluateExit({ ...ctx(), price }, s);
        if (!verdict.allowed) continue;
        const pos = positions.find((p) => p.leg === s.leg && p.symbol === s.symbol)!;
        const fill = await placeOrder({
          account,
          leg: s.leg,
          symbol: s.symbol,
          side: "SELL",
          qty: verdict.qty,
          refPrice: price,
        });
        if (fill.status === "REJECTED") {
          report.errors.push(`Exit ${s.symbol} rejected: ${fill.note}`);
          continue;
        }
        const proceeds = verdict.qty * fill.fillPrice;
        const realized = (fill.fillPrice - pos.avgPrice) * verdict.qty;
        cash += proceeds;
        tradesToday++;
        report.trades++;
        await sql.transaction((txn) => [
          txn`DELETE FROM positions WHERE id = ${pos.id}`,
          txn`INSERT INTO trades (id, account_id, leg, symbol, side, qty, price, notional, broker, status, order_ref, strategy, realized_pnl)
            VALUES (${newId("tr")}, ${account.id}, ${s.leg}, ${s.symbol}, 'SELL', ${verdict.qty}, ${fill.fillPrice}, ${proceeds}, ${fill.broker}, ${fill.status}, ${fill.orderRef}, ${s.strategy}, ${realized})`,
          txn`UPDATE accounts SET sim_cash = ${cash} WHERE id = ${account.id}`,
        ]);
        positions.splice(positions.indexOf(pos), 1);
        await writeJournal({
          accountId: account.id,
          kind: "TRADE",
          symbol: s.symbol,
          title: `SOLD ${s.symbol} — ${account.label}`,
          what: `Sold ${verdict.qty.toFixed(4)} ${s.symbol} at $${fill.fillPrice.toFixed(4)} (${
            fill.broker
          }), realizing $${realized.toFixed(2)}.`,
          why: s.reason,
          data: { ...s.indicators, strategy: s.strategy, broker: fill.broker, note: fill.note },
          discord: true,
          accountLabel: account.label,
        });
      }

      // Entries: risk chokepoint → optional AI vet → fill.
      for (const s of entries) {
        const price = priceOf(s.leg, s.symbol);
        if (price === null) continue;
        const verdict = evaluateEntry({ ...ctx(), price }, s);
        if (!verdict.allowed) {
          report.skips++;
          await writeJournal({
            accountId: account.id,
            kind: "SKIP",
            symbol: s.symbol,
            title: `Skipped ${s.symbol} entry — ${account.label}`,
            what: `The ${s.strategy} strategy wanted to buy ${s.symbol}, but risk checks blocked it.`,
            why: verdict.blocks.join(" "),
            data: { ...s.indicators, strategy: s.strategy },
          });
          continue;
        }

        const vet = await vetCandidate(s, {
          equity,
          accountLabel: account.label,
          openPositions: positions.length,
        });
        if (vet.verdict === "VETO") {
          report.vetoes++;
          await writeJournal({
            accountId: account.id,
            kind: "VETO",
            symbol: s.symbol,
            title: `AI vetoed ${s.symbol} entry — ${account.label}`,
            what: `The ${s.strategy} strategy wanted to buy ${s.symbol}; the AI judgment layer vetoed it.`,
            why: vet.rationale,
            data: { ...s.indicators, confidence: vet.confidence },
            discord: true,
            accountLabel: account.label,
          });
          continue;
        }

        const fill = await placeOrder({
          account,
          leg: s.leg,
          symbol: s.symbol,
          side: "BUY",
          qty: verdict.qty,
          refPrice: price,
        });
        if (fill.status === "REJECTED") {
          report.errors.push(`Entry ${s.symbol} rejected: ${fill.note}`);
          continue;
        }
        const cost = verdict.qty * fill.fillPrice;
        cash -= cost;
        tradesToday++;
        report.trades++;
        const posId = newId("ps");
        await sql.transaction((txn) => [
          txn`INSERT INTO positions (id, account_id, leg, symbol, qty, avg_price)
            VALUES (${posId}, ${account.id}, ${s.leg}, ${s.symbol}, ${verdict.qty}, ${fill.fillPrice})
            ON CONFLICT (account_id, leg, symbol) DO UPDATE
              SET qty = positions.qty + ${verdict.qty}, updated_at = now()`,
          txn`INSERT INTO trades (id, account_id, leg, symbol, side, qty, price, notional, broker, status, order_ref, strategy)
            VALUES (${newId("tr")}, ${account.id}, ${s.leg}, ${s.symbol}, 'BUY', ${verdict.qty}, ${fill.fillPrice}, ${cost}, ${fill.broker}, ${fill.status}, ${fill.orderRef}, ${s.strategy})`,
          txn`UPDATE accounts SET sim_cash = ${cash} WHERE id = ${account.id}`,
        ]);
        positions.push({
          id: posId,
          accountId: account.id,
          leg: s.leg,
          symbol: s.symbol,
          qty: verdict.qty,
          avgPrice: fill.fillPrice,
          openedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        const aiLine =
          vet.verdict === "APPROVE"
            ? ` AI vet approved (confidence ${(vet.confidence * 100).toFixed(0)}%): ${vet.rationale}`
            : ` ${vet.rationale}`;
        await writeJournal({
          accountId: account.id,
          kind: "TRADE",
          symbol: s.symbol,
          title: `BOUGHT ${s.symbol} — ${account.label}`,
          what: `Bought ${verdict.qty.toFixed(4)} ${s.symbol} at $${fill.fillPrice.toFixed(4)} for $${cost.toFixed(2)} (${fill.broker}).`,
          why: `${s.reason}${aiLine}`,
          data: {
            ...s.indicators,
            strategy: s.strategy,
            broker: fill.broker,
            sizedPct: Math.round((cost / Math.max(equity, 0.01)) * 100),
            note: fill.note,
          },
          discord: true,
          accountLabel: account.label,
        });
      }
    }

    report.summary = `${trigger}: ${report.ranAccounts} account(s), ${report.trades} trade(s), ${report.vetoes} veto(es), ${report.skips} skip(s), ${report.errors.length} error(s).`;
  } catch (err) {
    report.ok = false;
    report.errors.push((err as Error).message);
    report.summary = `Engine error: ${(err as Error).message}`;
  } finally {
    await setState("engine_lock", { at: 0 }).catch(() => {});
  }

  try {
    await sql`INSERT INTO engine_runs (id, trigger_source, status, duration_ms, summary, errors)
      VALUES (${newId("er")}, ${trigger}, ${report.ok ? "OK" : "ERROR"}, ${Date.now() - started}, ${report.summary}, ${report.errors.length})`;
    if (!report.ok) {
      await notifyDiscord({
        title: "Engine run FAILED",
        description: report.summary,
        color: COLORS.red,
      });
    }
  } catch {
    // Never let bookkeeping failures mask the trading result.
  }

  return report;
}
