import { neon } from "@neondatabase/serverless";
import { env } from "./config";

/**
 * Thin database layer over Neon's serverless HTTP driver.
 * Schema is bootstrapped lazily (CREATE TABLE IF NOT EXISTS) so a fresh
 * database works with zero migration tooling — right-sized for two accounts.
 */

type Sql = ReturnType<typeof neon>;

let _sql: Sql | null = null;
let _ensured: Promise<void> | null = null;

export function getSql(): Sql {
  const url = env.databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not configured (demo mode)");
  if (!_sql) _sql = neon(url);
  return _sql;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id),
    label TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'PAPER',
    frozen BOOLEAN NOT NULL DEFAULT false,
    frozen_reason TEXT,
    paper_started_at TIMESTAMPTZ,
    live_approved_at TIMESTAMPTZ,
    caps JSONB NOT NULL,
    sim_cash NUMERIC NOT NULL DEFAULT 25,
    starting_equity NUMERIC NOT NULL DEFAULT 25,
    peak_equity NUMERIC NOT NULL DEFAULT 25,
    discord_user_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    leg TEXT NOT NULL,
    symbol TEXT NOT NULL,
    qty NUMERIC NOT NULL,
    avg_price NUMERIC NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_id, leg, symbol)
  )`,
  `CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    leg TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    qty NUMERIC NOT NULL,
    price NUMERIC NOT NULL,
    notional NUMERIC NOT NULL,
    broker TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'FILLED',
    order_ref TEXT,
    strategy TEXT,
    realized_pnl NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS journal (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id),
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind TEXT NOT NULL,
    symbol TEXT,
    title TEXT NOT NULL,
    what TEXT NOT NULL,
    why TEXT NOT NULL,
    data JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS equity_snapshots (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    equity NUMERIC NOT NULL,
    cash NUMERIC NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS engine_runs (
    id TEXT PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    trigger_source TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    errors INTEGER NOT NULL DEFAULT 0,
    detail JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS backtests (
    id TEXT PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    strategy TEXT NOT NULL,
    market TEXT NOT NULL,
    years NUMERIC NOT NULL,
    params JSONB NOT NULL,
    result JSONB NOT NULL,
    passed BOOLEAN NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS journal_ts_idx ON journal (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS equity_account_ts_idx ON equity_snapshots (account_id, ts)`,
  `CREATE INDEX IF NOT EXISTS trades_account_ts_idx ON trades (account_id, created_at DESC)`,
];

export async function ensureSchema(): Promise<void> {
  if (!_ensured) {
    _ensured = (async () => {
      const sql = getSql();
      for (const stmt of SCHEMA_STATEMENTS) {
        await sql.query(stmt, []);
      }
    })().catch((err) => {
      _ensured = null; // allow retry on next request
      throw err;
    });
  }
  return _ensured;
}

export function newId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
  return `${prefix}_${rand}`;
}

export async function getState<T>(key: string): Promise<T | null> {
  const sql = getSql();
  const rows = (await sql`SELECT value FROM app_state WHERE key = ${key}`) as Array<{ value: T }>;
  return rows.length ? rows[0].value : null;
}

export async function setState(key: string, value: unknown): Promise<void> {
  const sql = getSql();
  await sql`INSERT INTO app_state (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(value)}::jsonb, updated_at = now()`;
}
