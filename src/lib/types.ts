// Core domain types for Aegis Trader.

export type AccountMode = "OFF" | "PAPER" | "LIVE";
export type Leg = "STOCK" | "FX" | "OPTIONS" | "FUTURES";
export type Side = "BUY" | "SELL";
export type BrokerKind = "SIM" | "ALPACA" | "OANDA";
export type JournalKind = "TRADE" | "SKIP" | "VETO" | "RISK" | "INFO" | "SYSTEM";

export interface Caps {
  /** Max % of equity in a single position (0-100). */
  maxPositionPct: number;
  /** Max simultaneous open positions. */
  maxPositions: number;
  /** Pause trading for the day beyond this % daily loss (0-100). */
  dailyLossPct: number;
  /** Freeze the account entirely beyond this % drawdown from peak (0-100). */
  freezeDrawdownPct: number;
  /** Max new trades per day. */
  maxTradesPerDay: number;
}

export interface Account {
  id: string;
  ownerUserId: string;
  label: string;
  mode: AccountMode;
  frozen: boolean;
  frozenReason: string | null;
  paperStartedAt: string | null;
  liveApprovedAt: string | null;
  caps: Caps;
  simCash: number;
  startingEquity: number;
  peakEquity: number;
  discordUserId: string | null;
  createdAt: string;
  ownerName?: string;
}

export interface Position {
  id: string;
  accountId: string;
  leg: Leg;
  symbol: string;
  qty: number;
  avgPrice: number;
  openedAt: string;
  updatedAt: string;
  /** Enriched at read time. */
  lastPrice?: number;
  marketValue?: number;
  unrealizedPnl?: number;
}

export interface Trade {
  id: string;
  accountId: string;
  leg: Leg;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  notional: number;
  broker: BrokerKind;
  status: string;
  orderRef: string | null;
  strategy: string | null;
  realizedPnl: number | null;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  accountId: string | null;
  ts: string;
  kind: JournalKind;
  symbol: string | null;
  title: string;
  what: string;
  why: string;
  data: Record<string, unknown> | null;
  accountLabel?: string;
}

export interface EquityPoint {
  ts: string;
  equity: number;
  cash: number;
}

export interface EngineRun {
  id: string;
  ts: string;
  trigger: string;
  status: string;
  durationMs: number;
  summary: string;
  errors: number;
}

export interface BacktestResult {
  id: string;
  ts: string;
  strategy: string;
  market: string;
  years: number;
  params: Record<string, unknown>;
  result: {
    totalReturnPct: number;
    cagrPct: number;
    maxDrawdownPct: number;
    winRatePct: number;
    trades: number;
    benchmarkReturnPct: number;
    benchmarkCagrPct: number;
    feesPaid: number;
    equityCurve?: Array<{ t: string; v: number; b: number }>;
  };
  passed: boolean;
}

export interface Bar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalCandidate {
  strategy: string;
  leg: Leg;
  symbol: string;
  action: "ENTER" | "EXIT";
  side: Side;
  strength: number;
  reason: string;
  indicators: Record<string, number | string>;
}

/** OWNER controls a real account; TESTER only gets a browser-local paper sandbox. */
export type SessionRole = "OWNER" | "TESTER";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: SessionRole;
}

export interface HealthStatus {
  db: boolean;
  demoMode: boolean;
  dataFeed: boolean;
  discordWebhook: boolean;
  discordInteractions: boolean;
  aiVet: boolean;
  alpacaKeys: boolean;
  oandaKeys: boolean;
  lastEngineRun: string | null;
}
