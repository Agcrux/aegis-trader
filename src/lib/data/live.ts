import type { Bar } from "../types";
import { fetchDailyBars } from "./market";

/**
 * Live/real-time market data via Yahoo Finance's public chart API (keyless).
 * US equity quotes are real-time or near-real-time; FX quotes are live.
 * Server-side fetches use Next's data cache (30s revalidate) so heavy pages
 * and polling clients share one upstream request per symbol per window.
 * Stooq daily bars remain the source for indicators and backtests.
 */

export interface LiveQuote {
  symbol: string;
  price: number;
  prevClose: number;
  changePct: number;
  volume: number | null;
  /** Recent intraday closes for sparklines (thinned). */
  spark: number[];
  ts: number;
}

export function yahooSymbol(symbol: string, leg: "STOCK" | "FX"): string {
  return leg === "FX" ? `${symbol.toUpperCase()}=X` : symbol.toUpperCase();
}

interface ChartResult {
  meta?: {
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
    regularMarketVolume?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }>;
  };
}

interface YahooChart {
  chart?: { result?: ChartResult[] };
}

async function fetchChart(
  ySymbol: string,
  range: string,
  interval: string,
  revalidate: number
): Promise<ChartResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ySymbol
  )}?range=${range}&interval=${interval}&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (aegis-trader; personal research)" },
    next: { revalidate },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status} for ${ySymbol}`);
  const body = (await res.json()) as YahooChart;
  return body.chart?.result?.[0] ?? null;
}

/** Live quote with sparkline. Returns null on failure — callers must fall back. */
export async function getLiveQuote(symbol: string, leg: "STOCK" | "FX"): Promise<LiveQuote | null> {
  try {
    const r = await fetchChart(yahooSymbol(symbol, leg), "1d", "5m", 30);
    if (!r?.meta?.regularMarketPrice) return null;
    const price = r.meta.regularMarketPrice;
    const prevClose = r.meta.chartPreviousClose ?? r.meta.previousClose ?? price;
    const closes = (r.indicators?.quote?.[0]?.close ?? []).filter(
      (c): c is number => typeof c === "number" && isFinite(c)
    );
    const volumes = (r.indicators?.quote?.[0]?.volume ?? []).filter(
      (v): v is number => typeof v === "number" && isFinite(v)
    );
    const step = Math.max(1, Math.floor(closes.length / 40));
    const spark = closes.filter((_, i) => i % step === 0 || i === closes.length - 1);
    return {
      symbol,
      price,
      prevClose,
      changePct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
      volume:
        r.meta.regularMarketVolume ??
        (volumes.length ? volumes.reduce((a, b) => a + b, 0) : null),
      spark,
      ts: Date.now(),
    };
  } catch {
    return null;
  }
}

/** Batch live quotes; failures are simply absent from the map. */
export async function getLiveQuotes(
  entries: Array<{ symbol: string; leg: "STOCK" | "FX" }>
): Promise<Map<string, LiveQuote>> {
  const out = new Map<string, LiveQuote>();
  const results = await Promise.allSettled(
    entries.map(async (e) => ({ key: e.symbol, quote: await getLiveQuote(e.symbol, e.leg) }))
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.quote) out.set(r.value.key, r.value.quote);
  }
  return out;
}

/** Best-effort current price: live quote, else last daily close. */
export async function bestPrice(symbol: string, leg: "STOCK" | "FX"): Promise<number | null> {
  const live = await getLiveQuote(symbol, leg);
  if (live) return live.price;
  try {
    const bars = await fetchDailyBars(symbol, leg, 5);
    return bars[bars.length - 1].close;
  } catch {
    return null;
  }
}

export interface HistoryPoint {
  t: number;
  c: number;
  v: number;
}

export interface HistoryResult {
  symbol: string;
  range: string;
  points: HistoryPoint[];
  price: number | null;
  changePct: number;
  rsi14: number | null;
}

const RANGES: Record<string, { range: string; interval: string; revalidate: number }> = {
  "1D": { range: "1d", interval: "5m", revalidate: 30 },
  "1W": { range: "5d", interval: "30m", revalidate: 120 },
  "1M": { range: "1mo", interval: "1d", revalidate: 600 },
  YTD: { range: "ytd", interval: "1d", revalidate: 600 },
};

/** Chart history for the live chart component. */
export async function getHistory(
  symbol: string,
  leg: "STOCK" | "FX",
  rangeKey: string
): Promise<HistoryResult | null> {
  const cfg = RANGES[rangeKey] ?? RANGES["1D"];
  try {
    const r = await fetchChart(yahooSymbol(symbol, leg), cfg.range, cfg.interval, cfg.revalidate);
    if (!r?.timestamp?.length) return null;
    const closes = r.indicators?.quote?.[0]?.close ?? [];
    const volumes = r.indicators?.quote?.[0]?.volume ?? [];
    const points: HistoryPoint[] = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      const c = closes[i];
      if (typeof c !== "number" || !isFinite(c)) continue;
      points.push({ t: r.timestamp[i] * 1000, c, v: typeof volumes[i] === "number" ? (volumes[i] as number) : 0 });
    }
    if (points.length < 2) return null;
    const first = points[0].c;
    const last = r.meta?.regularMarketPrice ?? points[points.length - 1].c;
    return {
      symbol,
      range: rangeKey,
      points,
      price: r.meta?.regularMarketPrice ?? null,
      changePct: first > 0 ? ((last - first) / first) * 100 : 0,
      rsi14: rsiFromCloses(points.map((p) => p.c), 14),
    };
  } catch {
    return null;
  }
}

function rsiFromCloses(closes: number[], period: number): number | null {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (gains + losses === 0) return 50;
  const rs = losses === 0 ? Infinity : gains / period / (losses / period);
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

/** Utility shared with pages: yesterday-vs-today daily bar map to Bar shape. */
export type { Bar };
