import type { Bar, Position, SignalCandidate } from "../types";
import { MEANREV_UNIVERSE, STOCK_WATCHLIST, FX_WATCHLIST } from "../config";
import { atr, momentum, round2, round4, rsi, sma, smaRising } from "./indicators";

/**
 * The three v1 strategies from VISION.md. All are deterministic, daily-bar,
 * long-or-flat swing strategies — every signal carries the indicator values
 * that produced it so the journal can explain the decision in plain English.
 *
 * NOT FINANCIAL ADVICE: these are widely known systematic patterns implemented
 * as software; the backtest gate decides whether they may trade at all.
 */

const TOP_N = 3;

/** Strategy 1 — trend/momentum rotation on the stock watchlist. */
export function trendMomentumSignals(
  bars: Map<string, Bar[]>,
  held: Position[]
): SignalCandidate[] {
  const out: SignalCandidate[] = [];
  const ranked: Array<{ symbol: string; mom: number; aboveSma50: boolean; sma200Up: boolean }> = [];

  for (const symbol of STOCK_WATCHLIST) {
    const b = bars.get(symbol);
    if (!b || b.length < 260) continue;
    const mom63 = momentum(b, 63);
    const s50 = sma(b, 50);
    const s200up = smaRising(b, 200, 21);
    if (mom63 === null || s50 === null || s200up === null) continue;
    ranked.push({
      symbol,
      mom: mom63,
      aboveSma50: b[b.length - 1].close > s50,
      sma200Up: s200up,
    });
  }
  ranked.sort((a, b) => b.mom - a.mom);
  const topSymbols = ranked.slice(0, TOP_N).filter((r) => r.aboveSma50 && r.sma200Up);
  const topHalf = new Set(ranked.slice(0, Math.ceil(ranked.length / 2)).map((r) => r.symbol));

  const heldTrend = held.filter((p) => p.leg === "STOCK");
  for (const p of heldTrend) {
    const b = bars.get(p.symbol);
    if (!b) continue;
    const s50 = sma(b, 50);
    const price = b[b.length - 1].close;
    if (s50 !== null && (price < s50 || !topHalf.has(p.symbol))) {
      out.push({
        strategy: "trend_momentum",
        leg: "STOCK",
        symbol: p.symbol,
        action: "EXIT",
        side: "SELL",
        strength: 1,
        reason:
          price < s50
            ? `Price ${round2(price)} closed below its 50-day average ${round2(s50)} — the uptrend that justified holding is broken.`
            : `${p.symbol} fell out of the top half of the momentum ranking — rotation rules say give the slot to a stronger name.`,
        indicators: { price: round2(price), sma50: s50 ? round2(s50) : "n/a" },
      });
    }
  }

  const heldSymbols = new Set(heldTrend.map((p) => p.symbol));
  for (const r of topSymbols) {
    if (heldSymbols.has(r.symbol)) continue;
    const b = bars.get(r.symbol)!;
    const price = b[b.length - 1].close;
    out.push({
      strategy: "trend_momentum",
      leg: "STOCK",
      symbol: r.symbol,
      action: "ENTER",
      side: "BUY",
      strength: Math.min(1, Math.max(0.2, r.mom / 30)),
      reason: `${r.symbol} ranks in the top ${TOP_N} of ${ranked.length} watched symbols by 3-month gain (+${round2(r.mom)}%), trades above its 50-day average, and its 200-day average is rising — the classic definition of an established uptrend.`,
      indicators: { price: round2(price), momentum63d: round2(r.mom) },
    });
  }
  return out;
}

/** Strategy 2 — RSI(2) dip-buying on broad ETFs in long-term uptrends. */
export function meanReversionSignals(
  bars: Map<string, Bar[]>,
  held: Position[]
): SignalCandidate[] {
  const out: SignalCandidate[] = [];
  const heldMap = new Map(held.filter((p) => p.leg === "STOCK").map((p) => [p.symbol, p]));

  for (const symbol of MEANREV_UNIVERSE) {
    const b = bars.get(symbol);
    if (!b || b.length < 220) continue;
    const r2 = rsi(b, 2);
    const s200 = sma(b, 200);
    const price = b[b.length - 1].close;
    if (r2 === null || s200 === null) continue;

    const pos = heldMap.get(symbol);
    if (pos && r2 > 65) {
      out.push({
        strategy: "rsi2_meanrev",
        leg: "STOCK",
        symbol,
        action: "EXIT",
        side: "SELL",
        strength: 1,
        reason: `The oversold dip that triggered this buy has snapped back (2-day RSI now ${round2(r2)}, above the 65 exit line) — mean-reversion trades take the bounce and leave.`,
        indicators: { price: round2(price), rsi2: round2(r2) },
      });
    } else if (!pos && r2 < 10 && price > s200) {
      out.push({
        strategy: "rsi2_meanrev",
        leg: "STOCK",
        symbol,
        action: "ENTER",
        side: "BUY",
        strength: 0.6,
        reason: `${symbol} is sharply oversold short-term (2-day RSI ${round2(r2)}, below 10) while still above its 200-day average — historically these dips inside uptrends have tended to bounce within days.`,
        indicators: { price: round2(price), rsi2: round2(r2), sma200: round2(s200) },
      });
    }
  }
  return out;
}

/** Strategy 3 — 20/50 SMA trend following on major FX pairs, long or flat. */
export function fxTrendSignals(bars: Map<string, Bar[]>, held: Position[]): SignalCandidate[] {
  const out: SignalCandidate[] = [];
  const heldMap = new Map(held.filter((p) => p.leg === "FX").map((p) => [p.symbol, p]));

  for (const symbol of FX_WATCHLIST) {
    const b = bars.get(symbol);
    if (!b || b.length < 120) continue;
    const s20 = sma(b, 20);
    const s50 = sma(b, 50);
    const a10 = atr(b, 10);
    const price = b[b.length - 1].close;
    if (s20 === null || s50 === null || a10 === null) continue;

    const pos = heldMap.get(symbol);
    if (pos && s20 < s50) {
      out.push({
        strategy: "fx_trend",
        leg: "FX",
        symbol,
        action: "EXIT",
        side: "SELL",
        strength: 1,
        reason: `${symbol}'s 20-day average crossed back below its 50-day average — the uptrend this position was riding has ended by the strategy's own definition.`,
        indicators: { price: round4(price), sma20: round4(s20), sma50: round4(s50) },
      });
    } else if (!pos && s20 > s50 && price > s20) {
      out.push({
        strategy: "fx_trend",
        leg: "FX",
        symbol,
        action: "ENTER",
        side: "BUY",
        strength: 0.5,
        reason: `${symbol} is in a defined uptrend: 20-day average above 50-day average with price above both. Trend-following takes the ride and exits on the cross-back.`,
        indicators: {
          price: round4(price),
          sma20: round4(s20),
          sma50: round4(s50),
          atr10: round4(a10),
        },
      });
    }
  }
  return out;
}

export function allSignals(
  stockBars: Map<string, Bar[]>,
  fxBars: Map<string, Bar[]>,
  held: Position[]
): SignalCandidate[] {
  return [
    ...trendMomentumSignals(stockBars, held),
    ...meanReversionSignals(stockBars, held),
    ...fxTrendSignals(fxBars, held),
  ];
}
