import { ensureSchema, getSql } from "./db";
import { BENCHMARK, env, isSetupIncomplete } from "./config";
import { fetchDailyBars } from "./data/market";
import type {
  Account,
  BacktestResult,
  Caps,
  EngineRun,
  EquityPoint,
  HealthStatus,
  JournalEntry,
  Position,
  Trade,
} from "./types";

/**
 * Read layer used by server components. Returns real data from the database.
 * When no database is connected, returns empty results (no sample data) —
 * market-data widgets remain live regardless.
 */

export async function getAccounts(): Promise<Account[]> {
  if (isSetupIncomplete()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT a.*, u.name AS owner_name FROM accounts a
    JOIN users u ON u.id = a.owner_user_id ORDER BY a.created_at`) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
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
    ownerName: String(r.owner_name),
  }));
}

export async function getPositions(): Promise<Position[]> {
  if (isSetupIncomplete()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT * FROM positions ORDER BY opened_at DESC`) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    id: String(r.id),
    accountId: String(r.account_id),
    leg: String(r.leg) as Position["leg"],
    symbol: String(r.symbol),
    qty: Number(r.qty),
    avgPrice: Number(r.avg_price),
    openedAt: String(r.opened_at),
    updatedAt: String(r.updated_at),
  }));
}

export async function getJournal(limit = 100): Promise<JournalEntry[]> {
  if (isSetupIncomplete()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT j.*, a.label AS account_label FROM journal j
    LEFT JOIN accounts a ON a.id = j.account_id
    ORDER BY j.ts DESC LIMIT ${limit}`) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    accountId: r.account_id ? String(r.account_id) : null,
    ts: String(r.ts),
    kind: String(r.kind) as JournalEntry["kind"],
    symbol: r.symbol ? String(r.symbol) : null,
    title: String(r.title),
    what: String(r.what),
    why: String(r.why),
    data: (r.data as Record<string, unknown>) ?? null,
    accountLabel: r.account_label ? String(r.account_label) : undefined,
  }));
}

export async function getEquitySeries(accountId: string): Promise<EquityPoint[]> {
  if (isSetupIncomplete()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT ts, equity, cash FROM equity_snapshots
    WHERE account_id = ${accountId} ORDER BY ts ASC`) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    ts: String(r.ts),
    equity: Number(r.equity),
    cash: Number(r.cash),
  }));
}

function mapTradeRow(r: Record<string, unknown>): Trade {
  return {
    id: String(r.id),
    accountId: String(r.account_id),
    leg: String(r.leg) as Trade["leg"],
    symbol: String(r.symbol),
    side: String(r.side) as Trade["side"],
    qty: Number(r.qty),
    price: Number(r.price),
    notional: Number(r.notional),
    broker: String(r.broker) as Trade["broker"],
    status: String(r.status),
    orderRef: r.order_ref ? String(r.order_ref) : null,
    strategy: r.strategy ? String(r.strategy) : null,
    realizedPnl: r.realized_pnl === null ? null : Number(r.realized_pnl),
    createdAt: String(r.created_at),
  };
}

export async function getTrades(limit = 50): Promise<Trade[]> {
  if (isSetupIncomplete()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT * FROM trades ORDER BY created_at DESC LIMIT ${limit}`) as Array<
    Record<string, unknown>
  >;
  return rows.map(mapTradeRow);
}

export async function getTradesByAccount(accountId: string, limit = 200): Promise<Trade[]> {
  if (isSetupIncomplete()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT * FROM trades WHERE account_id = ${accountId}
    ORDER BY created_at DESC LIMIT ${limit}`) as Array<Record<string, unknown>>;
  return rows.map(mapTradeRow);
}

export async function getEngineRuns(limit = 20): Promise<EngineRun[]> {
  if (isSetupIncomplete()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT * FROM engine_runs ORDER BY ts DESC LIMIT ${limit}`) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    id: String(r.id),
    ts: String(r.ts),
    trigger: String(r.trigger_source),
    status: String(r.status),
    durationMs: Number(r.duration_ms),
    summary: String(r.summary),
    errors: Number(r.errors),
  }));
}

export async function getBacktests(): Promise<BacktestResult[]> {
  if (isSetupIncomplete()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT DISTINCT ON (strategy) * FROM backtests
    ORDER BY strategy, ts DESC`) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    ts: String(r.ts),
    strategy: String(r.strategy),
    market: String(r.market),
    years: Number(r.years),
    params: r.params as Record<string, unknown>,
    result: r.result as BacktestResult["result"],
    passed: Boolean(r.passed),
  }));
}

export async function getErrorsInWindow(days: number): Promise<number> {
  if (isSetupIncomplete()) return 0;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT COALESCE(SUM(errors), 0)::int AS n FROM engine_runs
    WHERE ts >= now() - make_interval(days => ${days})`) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

export async function getHealth(): Promise<HealthStatus> {
  const demo = isSetupIncomplete();
  let db = false;
  let lastRun: string | null = null;
  if (!demo) {
    try {
      await ensureSchema();
      const sql = getSql();
      const rows = (await sql`SELECT ts FROM engine_runs ORDER BY ts DESC LIMIT 1`) as Array<{
        ts: string;
      }>;
      db = true;
      lastRun = rows.length ? String(rows[0].ts) : null;
    } catch {
      db = false;
    }
  }
  // Tests the whole chain (Stooq, then the Yahoo fallback) rather than one host,
  // so a rate-limited Stooq doesn't report a feed outage the engine isn't having.
  let dataFeed = false;
  try {
    const bars = await fetchDailyBars(BENCHMARK, "STOCK", 40);
    dataFeed = bars.length > 0;
  } catch {
    dataFeed = false;
  }
  return {
    db,
    demoMode: demo,
    dataFeed,
    discordWebhook: Boolean(env.discordWebhook()),
    discordInteractions: Boolean(env.discordPublicKey()),
    aiVet: Boolean(env.anthropicKey()),
    alpacaKeys: Boolean(env.alpacaKeyId() && env.alpacaSecret()),
    oandaKeys: Boolean(env.oandaToken()),
    lastEngineRun: lastRun,
  };
}
