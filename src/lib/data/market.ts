import type { Bar } from "../types";

/**
 * Free, keyless daily bars for swing strategies and multi-year backtests.
 * Stooq CSV is the primary source; Yahoo's chart API is the fallback, because
 * Stooq applies a daily hit limit and answers HTTP 200 with a short error body
 * once it is reached — which would otherwise starve the engine of history.
 * Symbols: US stocks/ETFs use "spy.us"; FX pairs use "eurusd".
 * A per-invocation cache keeps each engine tick to one fetch per symbol.
 */

const cache = new Map<string, Bar[]>();
const MIN_BARS = 30;

function stooqSymbol(symbol: string, leg: "STOCK" | "FX"): string {
  return leg === "STOCK" ? `${symbol.toLowerCase()}.us` : symbol.toLowerCase();
}

export async function fetchDailyBars(
  symbol: string,
  leg: "STOCK" | "FX",
  maxBars = 1600
): Promise<Bar[]> {
  const key = `${leg}:${symbol}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const problems: string[] = [];
  const sources: Array<() => Promise<Bar[]>> = [
    () => fetchStooqBars(symbol, leg),
    () => fetchYahooBars(symbol, leg, maxBars),
  ];
  for (const source of sources) {
    try {
      const bars = await source();
      if (bars.length < MIN_BARS) {
        throw new Error(`only ${bars.length} usable bars returned`);
      }
      const sliced = bars.slice(-maxBars);
      cache.set(key, sliced);
      return sliced;
    } catch (err) {
      problems.push((err as Error).message);
    }
  }
  throw new Error(`Data feed error for ${symbol}: ${problems.join("; ")}`);
}

async function fetchStooqBars(symbol: string, leg: "STOCK" | "FX"): Promise<Bar[]> {
  const url = `https://stooq.com/q/d/l/?s=${stooqSymbol(symbol, leg)}&i=d`;
  const res = await fetch(url, {
    headers: { "user-agent": "aegis-trader/1.0 (personal research)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
  return parseStooqCsv(await res.text());
}

function parseStooqCsv(text: string): Bar[] {
  const lines = text.trim().split(/\r?\n/);
  const bars: Bar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    const [date, open, high, low, close, volume] = parts;
    const o = Number(open);
    const h = Number(high);
    const l = Number(low);
    const c = Number(close);
    if (!date || !isFinite(o) || !isFinite(c) || c <= 0) continue;
    bars.push({
      date,
      open: o,
      high: isFinite(h) ? h : Math.max(o, c),
      low: isFinite(l) ? l : Math.min(o, c),
      close: c,
      volume: Number(volume) || 0,
    });
  }
  return bars;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
}

async function fetchYahooBars(
  symbol: string,
  leg: "STOCK" | "FX",
  maxBars: number
): Promise<Bar[]> {
  // Roughly 252 trading days a year, rounded up to Yahoo's supported ranges.
  const range = maxBars <= 400 ? "2y" : maxBars <= 1300 ? "5y" : "10y";
  const ySymbol = leg === "FX" ? `${symbol.toUpperCase()}=X` : symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ySymbol
  )}?range=${range}&interval=1d`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (aegis-trader; personal research)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const body = (await res.json()) as YahooChartResponse;
  const r = body.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r?.timestamp?.length || !q?.close) throw new Error("Yahoo returned no daily series");

  const bars: Bar[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = q.close[i];
    if (typeof c !== "number" || !isFinite(c) || c <= 0) continue;
    const o = typeof q.open?.[i] === "number" ? (q.open[i] as number) : c;
    const h = typeof q.high?.[i] === "number" ? (q.high[i] as number) : Math.max(o, c);
    const l = typeof q.low?.[i] === "number" ? (q.low[i] as number) : Math.min(o, c);
    bars.push({
      date: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: typeof q.volume?.[i] === "number" ? (q.volume[i] as number) : 0,
    });
  }
  return bars;
}

export async function lastPrice(symbol: string, leg: "STOCK" | "FX"): Promise<number> {
  const bars = await fetchDailyBars(symbol, leg, 10);
  return bars[bars.length - 1].close;
}

/** Batch helper — resolves to a symbol->bars map, skipping symbols that fail. */
export async function fetchMany(
  symbols: ReadonlyArray<string>,
  leg: "STOCK" | "FX",
  maxBars = 400
): Promise<{ bars: Map<string, Bar[]>; failures: string[] }> {
  const bars = new Map<string, Bar[]>();
  const failures: string[] = [];
  const results = await Promise.allSettled(
    symbols.map(async (s) => ({ s, b: await fetchDailyBars(s, leg, maxBars) }))
  );
  for (const r of results) {
    if (r.status === "fulfilled") bars.set(r.value.s, r.value.b);
    else failures.push(String(r.reason?.message ?? r.reason));
  }
  return { bars, failures };
}

/** Clears the per-invocation cache (used by long-lived dev server). */
export function clearMarketCache(): void {
  cache.clear();
}
