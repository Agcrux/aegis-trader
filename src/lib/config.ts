import type { Caps } from "./types";

/**
 * Central configuration — every guardrail number agreed in the project vision
 * lives here so it is auditable in one place. See VISION.md.
 */

export const APP_NAME = "Aegis Trader";

/** Equity a single account must reach before the options-income leg unlocks. */
export const OPTIONS_UNLOCK_EQUITY = 2000;
/** Equity a single account must reach before the futures leg unlocks. */
export const FUTURES_UNLOCK_EQUITY = 5000;

/** Days of clean paper trading required before LIVE can be enabled. */
export const PAPER_GATE_DAYS = 30;

/** Max owner users allowed to register (you + one family member/friend). */
export const MAX_OWNERS = 2;

/** Default per-account caps. Owners can tighten (or loosen up to the vision's ceilings) their own. */
export const DEFAULT_CAPS: Caps = {
  maxPositionPct: 20, // one position may hold at most 20% of equity
  maxPositions: 5,
  dailyLossPct: 5, // stop trading for the day at -5%
  freezeDrawdownPct: 30, // master circuit breaker agreed in the vision (default ceiling)
  maxTradesPerDay: 6,
};

/** Hard ceilings — server rejects caps looser than these regardless of UI input. */
export const CAP_CEILINGS: Caps = {
  maxPositionPct: 50,
  maxPositions: 10,
  dailyLossPct: 10,
  freezeDrawdownPct: 30,
  maxTradesPerDay: 12,
};

/** Liquid, fractional-friendly stock/ETF watchlist scanned by the engine. */
export const STOCK_WATCHLIST = [
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "XLK",
  "XLE",
  "XLF",
  "XLV",
  "GLD",
  "TLT",
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
] as const;

/** Mean-reversion is restricted to broad ETFs (calmer instruments). */
export const MEANREV_UNIVERSE = ["SPY", "QQQ", "IWM", "DIA", "XLK", "XLV"] as const;

/** FX pairs scanned by the trend strategy (majors only, per the vision). */
export const FX_WATCHLIST = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD"] as const;

/** Benchmark symbol for the "would doing nothing have beaten us?" comparison. */
export const BENCHMARK = "SPY";

/** Assumed round-trip slippage in basis points applied in backtests and sim fills. */
export const SLIPPAGE_BPS = 5;
/** Assumed FX spread cost in basis points (spread-only broker model). */
export const FX_SPREAD_BPS = 1.5;

/** Minimum notional for any order (below this, fees/spreads dominate). */
export const MIN_ORDER_NOTIONAL = 1;

export const env = {
  databaseUrl: () => process.env.DATABASE_URL || "",
  authSecret: () => process.env.AUTH_SECRET || "",
  inviteCode: () => process.env.INVITE_CODE || "",
  cronSecret: () => process.env.CRON_SECRET || "",
  anthropicKey: () => process.env.ANTHROPIC_API_KEY || "",
  discordWebhook: () => process.env.DISCORD_WEBHOOK_URL || "",
  discordPublicKey: () => process.env.DISCORD_PUBLIC_KEY || "",
  alpacaKeyId: () => process.env.APCA_API_KEY_ID || "",
  alpacaSecret: () => process.env.APCA_API_SECRET_KEY || "",
  oandaToken: () => process.env.OANDA_TOKEN || "",
};

/** True when no database is configured — the app serves read-only sample data. */
export function isDemoMode(): boolean {
  return !env.databaseUrl();
}
