import { bestPrice, getLiveQuotes } from "../data/live";
import { legForSymbol } from "../config";
import type { PaperSandbox } from "./sandbox";

/**
 * Real marks for sandbox valuation. Play money, live prices: quotes come from
 * the same feed the rest of the app uses, with a daily-close fallback so a
 * flaky upstream degrades instead of inventing numbers.
 */
export async function priceMap(symbols: string[]): Promise<Map<string, number>> {
  const wanted = [...new Set(symbols.map((s) => s.trim().toUpperCase()))]
    .map((symbol) => ({ symbol, leg: legForSymbol(symbol) }))
    .filter((e): e is { symbol: string; leg: "STOCK" | "FX" } => e.leg !== null);
  if (wanted.length === 0) return new Map();

  const out = new Map<string, number>();
  const quotes = await getLiveQuotes(wanted);
  for (const [symbol, quote] of quotes) out.set(symbol, quote.price);

  const missing = wanted.filter((e) => !out.has(e.symbol));
  const fallbacks = await Promise.all(
    missing.map(async (e) => ({ symbol: e.symbol, price: await bestPrice(e.symbol, e.leg) }))
  );
  for (const f of fallbacks) if (f.price) out.set(f.symbol, f.price);
  return out;
}

/** Marks for everything the sandbox holds, plus any extra symbol a page needs. */
export function sandboxSymbols(sb: PaperSandbox, extra: string[] = []): string[] {
  return [...sb.positions.map((p) => p.symbol), ...extra];
}
