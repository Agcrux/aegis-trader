import type { Bar } from "../types";

/**
 * Free, keyless market data via Stooq daily CSV endpoints.
 * Good enough for swing strategies and multi-year backtests at $0/month.
 * Symbols: US stocks/ETFs use "spy.us"; FX pairs use "eurusd".
 * A per-invocation cache keeps each engine tick to one fetch per symbol.
 */

const cache = new Map<string, Bar[]>();

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

  const url = `https://stooq.com/q/d/l/?s=${stooqSymbol(symbol, leg)}&i=d`;
  const res = await fetch(url, {
    headers: { "user-agent": "aegis-trader/1.0 (personal research)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Data feed error for ${symbol}: HTTP ${res.status}`);
  const text = await res.text();
  const bars = parseStooqCsv(text);
  if (bars.length < 30) throw new Error(`Data feed returned too little history for ${symbol}`);
  const sliced = bars.slice(-maxBars);
  cache.set(key, sliced);
  return sliced;
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
