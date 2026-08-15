import { SYMBOL_NAMES } from "../config";
import type { Leg } from "../types";

/**
 * Deterministic, keyless helpers that enrich every trade explanation with:
 *  - a list of news outlets to check for the traded symbol, and
 *  - related / alternative tickers worth watching.
 *
 * No API keys or network calls — just well-formed deep links and a curated
 * peer map. This means the "why + where to read more + what else" context is
 * always attached to a purchase, even when the AI layer or a data feed is down.
 */

export interface NewsOutlet {
  name: string;
  url: string;
}

export interface RelatedSymbol {
  symbol: string;
  name: string;
}

function fxPair(symbol: string): { base: string; quote: string; slug: string } {
  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3);
  return { base, quote, slug: `${base}-${quote}`.toLowerCase() };
}

/** News outlets deep-linked to the specific symbol. */
export function newsOutlets(symbol: string, leg: Leg): NewsOutlet[] {
  const s = symbol.toUpperCase();
  if (leg === "FX") {
    const { base, quote, slug } = fxPair(s);
    const q = encodeURIComponent(`${base}/${quote} forex`);
    return [
      { name: "Yahoo Finance", url: `https://finance.yahoo.com/quote/${base}${quote}=X` },
      { name: "Investing.com", url: `https://www.investing.com/currencies/${slug}-news` },
      { name: "DailyFX", url: `https://www.dailyfx.com/${slug}` },
      { name: "Google News", url: `https://news.google.com/search?q=${q}` },
      { name: "ForexFactory", url: `https://www.forexfactory.com/news` },
    ];
  }
  const q = encodeURIComponent(`${s} stock`);
  return [
    { name: "Yahoo Finance", url: `https://finance.yahoo.com/quote/${s}/news` },
    { name: "Google News", url: `https://news.google.com/search?q=${q}` },
    { name: "Finviz", url: `https://finviz.com/quote.ashx?t=${s}` },
    { name: "MarketWatch", url: `https://www.marketwatch.com/investing/stock/${s.toLowerCase()}` },
    { name: "Seeking Alpha", url: `https://seekingalpha.com/symbol/${s}/news` },
    { name: "SEC filings", url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${s}&type=&dateb=&owner=include&count=40` },
  ];
}

/**
 * Curated peer groups. Each traded symbol maps to a handful of related tickers
 * an owner might reasonably look at next (same sector, same theme, or the
 * broad index it belongs to).
 */
const PEER_GROUPS: Record<string, string[]> = {
  // Broad-market ETFs
  SPY: ["QQQ", "DIA", "IWM"],
  QQQ: ["SPY", "XLK", "NVDA", "MSFT"],
  DIA: ["SPY", "XLF", "AAPL"],
  IWM: ["SPY", "QQQ", "DIA"],
  // Sector ETFs
  XLK: ["QQQ", "AAPL", "MSFT", "NVDA"],
  XLE: ["SPY", "XLF"],
  XLF: ["DIA", "SPY"],
  XLV: ["SPY", "QQQ"],
  GLD: ["TLT", "SPY"],
  TLT: ["GLD", "SPY"],
  // Mega-cap tech
  AAPL: ["MSFT", "QQQ", "XLK"],
  MSFT: ["AAPL", "NVDA", "QQQ"],
  NVDA: ["MSFT", "XLK", "QQQ"],
  AMZN: ["GOOGL", "META", "QQQ"],
  GOOGL: ["META", "AMZN", "QQQ"],
  META: ["GOOGL", "AMZN", "QQQ"],
  // FX majors
  EURUSD: ["GBPUSD", "USDJPY", "AUDUSD"],
  GBPUSD: ["EURUSD", "USDJPY", "AUDUSD"],
  USDJPY: ["EURUSD", "GBPUSD", "AUDUSD"],
  AUDUSD: ["EURUSD", "GBPUSD", "USDJPY"],
};

function displayName(symbol: string): string {
  return SYMBOL_NAMES[symbol] ?? symbol;
}

/** Related/alternative tickers to watch alongside the traded one. */
export function relatedSymbols(symbol: string, _leg: Leg): RelatedSymbol[] {
  const peers = PEER_GROUPS[symbol.toUpperCase()] ?? [];
  return peers.slice(0, 4).map((p) => ({ symbol: p, name: displayName(p) }));
}

/** Compact one-line summary of where to read more, for the journal "why". */
export function newsOutletsLine(symbol: string, leg: Leg): string {
  return newsOutlets(symbol, leg)
    .map((o) => o.name)
    .join(", ");
}
