import type {
  Account,
  BacktestResult,
  EngineRun,
  EquityPoint,
  JournalEntry,
  Position,
  Trade,
} from "./types";
import { DEFAULT_CAPS } from "./config";

/**
 * Deterministic sample dataset shown when no DATABASE_URL is configured.
 * Lets the deployed site demonstrate the full experience honestly — every
 * page carries a DEMO banner and all mutations are disabled.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 60;
const rand = mulberry32(20260814);

function iso(daysAgo: number, hour = 20): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

export const demoAccounts: Account[] = [
  {
    id: "acct_demo_a",
    ownerUserId: "user_demo_a",
    label: "Owner A",
    mode: "PAPER",
    frozen: false,
    frozenReason: null,
    paperStartedAt: iso(DAYS),
    liveApprovedAt: null,
    caps: { ...DEFAULT_CAPS },
    simCash: 11.42,
    startingEquity: 25,
    peakEquity: 27.1,
    discordUserId: null,
    createdAt: iso(DAYS),
    ownerName: "Demo Owner A",
  },
  {
    id: "acct_demo_b",
    ownerUserId: "user_demo_b",
    label: "Owner B",
    mode: "PAPER",
    frozen: false,
    frozenReason: null,
    paperStartedAt: iso(DAYS - 3),
    liveApprovedAt: null,
    caps: { ...DEFAULT_CAPS, maxPositionPct: 15, freezeDrawdownPct: 20 },
    simCash: 14.05,
    startingEquity: 25,
    peakEquity: 26.2,
    discordUserId: null,
    createdAt: iso(DAYS - 3),
    ownerName: "Demo Owner B",
  },
];

function walk(start: number, days: number, drift: number, vol: number): number[] {
  const out = [start];
  for (let i = 1; i < days; i++) {
    const prev = out[i - 1];
    out.push(Math.max(15, prev * (1 + drift + (rand() - 0.5) * vol)));
  }
  return out;
}

const walkA = walk(25, DAYS, 0.0012, 0.012);
const walkB = walk(25, DAYS, 0.0008, 0.01);

export const demoEquity: Record<string, EquityPoint[]> = {
  acct_demo_a: walkA.map((v, i) => ({
    ts: iso(DAYS - i),
    equity: Math.round(v * 100) / 100,
    cash: Math.round(v * 0.45 * 100) / 100,
  })),
  acct_demo_b: walkB.map((v, i) => ({
    ts: iso(DAYS - i),
    equity: Math.round(v * 100) / 100,
    cash: Math.round(v * 0.55 * 100) / 100,
  })),
};

export const demoPositions: Position[] = [
  {
    id: "pos_demo_1",
    accountId: "acct_demo_a",
    leg: "STOCK",
    symbol: "QQQ",
    qty: 0.0112,
    avgPrice: 512.4,
    openedAt: iso(9),
    updatedAt: iso(0),
    lastPrice: 528.1,
    marketValue: 5.91,
    unrealizedPnl: 0.18,
  },
  {
    id: "pos_demo_2",
    accountId: "acct_demo_a",
    leg: "STOCK",
    symbol: "NVDA",
    qty: 0.0301,
    avgPrice: 171.2,
    openedAt: iso(6),
    updatedAt: iso(0),
    lastPrice: 176.4,
    marketValue: 5.31,
    unrealizedPnl: 0.16,
  },
  {
    id: "pos_demo_3",
    accountId: "acct_demo_b",
    leg: "FX",
    symbol: "EURUSD",
    qty: 4,
    avgPrice: 1.0921,
    openedAt: iso(4),
    updatedAt: iso(0),
    lastPrice: 1.0968,
    marketValue: 4.39,
    unrealizedPnl: 0.02,
  },
];

export const demoTrades: Trade[] = [
  {
    id: "tr_demo_1",
    accountId: "acct_demo_a",
    leg: "STOCK",
    symbol: "QQQ",
    side: "BUY",
    qty: 0.0112,
    price: 512.4,
    notional: 5.74,
    broker: "SIM",
    status: "FILLED",
    orderRef: null,
    strategy: "trend_momentum",
    realizedPnl: null,
    createdAt: iso(9),
  },
  {
    id: "tr_demo_2",
    accountId: "acct_demo_b",
    leg: "STOCK",
    symbol: "SPY",
    side: "SELL",
    qty: 0.0089,
    price: 561.2,
    notional: 4.99,
    broker: "SIM",
    status: "FILLED",
    orderRef: null,
    strategy: "rsi2_meanrev",
    realizedPnl: 0.21,
    createdAt: iso(5),
  },
];

export const demoJournal: JournalEntry[] = [
  {
    id: "jr_demo_1",
    accountId: "acct_demo_a",
    accountLabel: "Owner A",
    ts: iso(9, 17),
    kind: "TRADE",
    symbol: "QQQ",
    title: "BOUGHT QQQ — Owner A",
    what: "Bought 0.0112 QQQ at $512.40 for $5.74 (SIM).",
    why: "QQQ ranks in the top 3 of 16 watched symbols by 3-month gain (+9.4%), trades above its 50-day average, and its 200-day average is rising — the classic definition of an established uptrend. AI vet approved (confidence 78%): Momentum and trend filters agree; position size is a fifth of the account, consistent with the caps.",
    data: { momentum63d: 9.4, price: 512.4, strategy: "trend_momentum" },
  },
  {
    id: "jr_demo_2",
    accountId: "acct_demo_b",
    accountLabel: "Owner B",
    ts: iso(7, 14),
    kind: "VETO",
    symbol: "XLE",
    title: "AI vetoed XLE entry — Owner B",
    what: "The rsi2_meanrev strategy wanted to buy XLE; the AI judgment layer vetoed it.",
    why: "The 2-day RSI reads oversold, but price sits barely above the 200-day average after three straight heavy down days — this looks closer to a breaking trend than a routine dip, and the strategy's own edge comes from dips inside healthy trends.",
    data: { rsi2: 6.2, confidence: 0.71 },
  },
  {
    id: "jr_demo_3",
    accountId: "acct_demo_b",
    accountLabel: "Owner B",
    ts: iso(5, 18),
    kind: "TRADE",
    symbol: "SPY",
    title: "SOLD SPY — Owner B",
    what: "Sold 0.0089 SPY at $561.20 (SIM), realizing $0.21.",
    why: "The oversold dip that triggered this buy has snapped back (2-day RSI now 71.3, above the 65 exit line) — mean-reversion trades take the bounce and leave.",
    data: { rsi2: 71.3, strategy: "rsi2_meanrev" },
  },
  {
    id: "jr_demo_4",
    accountId: "acct_demo_a",
    accountLabel: "Owner A",
    ts: iso(3, 13),
    kind: "SKIP",
    symbol: "META",
    title: "Skipped META entry — Owner A",
    what: "The trend_momentum strategy wanted to buy META, but risk checks blocked it.",
    why: "Max open positions reached (5).",
    data: { strategy: "trend_momentum" },
  },
  {
    id: "jr_demo_5",
    accountId: null,
    ts: iso(1, 21),
    kind: "SYSTEM",
    symbol: null,
    title: "Daily summary",
    what: "2 accounts scanned, 0 trades today, 1 skip. Combined paper equity $52.31 (+4.6% since start).",
    why: "Quiet day: no strategy produced an entry signal that cleared risk checks, which is normal for swing systems — most days the right trade is none.",
    data: null,
  },
];

export const demoRuns: EngineRun[] = Array.from({ length: 8 }, (_, i) => ({
  id: `er_demo_${i}`,
  ts: iso(i === 0 ? 0 : i, 20 - (i % 3)),
  trigger: i % 4 === 0 ? "github-cron" : i % 4 === 1 ? "vercel-cron" : "github-cron",
  status: "OK",
  durationMs: 4200 + Math.floor(rand() * 3000),
  summary: `github-cron: 2 account(s), ${i % 3 === 0 ? 1 : 0} trade(s), 0 veto(es), ${i % 2} skip(s), 0 error(s).`,
  errors: 0,
}));

export const demoBacktests: BacktestResult[] = [
  {
    id: "bt_demo_1",
    ts: iso(2),
    strategy: "trend_momentum",
    market: "STOCKS",
    years: 5,
    params: { topN: 3, momentumDays: 63, trendFilter: "50d & rising 200d SMA" },
    result: {
      totalReturnPct: 96.4,
      cagrPct: 14.5,
      maxDrawdownPct: 21.7,
      winRatePct: 54,
      trades: 118,
      benchmarkReturnPct: 87.1,
      benchmarkCagrPct: 13.3,
      feesPaid: 41.2,
    },
    passed: true,
  },
  {
    id: "bt_demo_2",
    ts: iso(2),
    strategy: "rsi2_meanrev",
    market: "STOCKS",
    years: 5,
    params: { rsiPeriod: 2, entryBelow: 10, exitAbove: 65, regimeFilter: "price > 200d SMA" },
    result: {
      totalReturnPct: 41.8,
      cagrPct: 7.2,
      maxDrawdownPct: 12.9,
      winRatePct: 68,
      trades: 74,
      benchmarkReturnPct: 87.1,
      benchmarkCagrPct: 13.3,
      feesPaid: 18.6,
    },
    passed: false,
  },
  {
    id: "bt_demo_3",
    ts: iso(2),
    strategy: "fx_trend",
    market: "FX",
    years: 5,
    params: { fast: 20, slow: 50, universe: "EURUSD,GBPUSD,USDJPY,AUDUSD" },
    result: {
      totalReturnPct: 22.4,
      cagrPct: 4.1,
      maxDrawdownPct: 9.8,
      winRatePct: 41,
      trades: 62,
      benchmarkReturnPct: 87.1,
      benchmarkCagrPct: 13.3,
      feesPaid: 6.1,
    },
    passed: false,
  },
];

export const DEMO_NOTE =
  "These are illustrative sample numbers so you can explore the interface — run real backtests from this page once a database is connected.";
