import type { Bar, Position, SignalCandidate } from "../types";
import { STOCK_WATCHLIST, FX_WATCHLIST } from "../config";
import { atr, momentum, round2, round4, rsi, sma } from "./indicators";

/**
 * The three v1 strategies from VISION.md. All are deterministic, daily-bar,
 * long-or-flat swing strategies — every signal carries the indicator values
 * that produced it so the journal can explain the decision in plain English.
 *
 * NOTE: entry rules were intentionally LOOSENED for the paper phase so the
 * engine trades more often and the machine is easy to watch. This means the
 * live rules are now more permissive than the versions proved in the backtest
 * gate — treat the extra activity as exploration on play money, not as a
 * validated edge. Tighten before real money (see VISION.md Stage 3).
 *
 * NOT FINANCIAL ADVICE: these are widely known systematic patterns implemented
 * as software.
 */

// Paper phase: momentum holds EVERY uptrending name, with no fixed top-N cap.

/** Strategy 1 — trend/momentum rotation on the stock watchlist. */
export function trendMomentumSignals(
  bars: Map<string, Bar[]>,
  held: Position[]
): SignalCandidate[] {
  const out: SignalCandidate[] = [];
  const ranked: Array<{ symbol: string; mom: number; aboveSma50: boolean }> = [];

  for (const symbol of STOCK_WATCHLIST) {
    const b = bars.get(symbol);
    if (!b || b.length < 130) continue;
    const mom63 = momentum(b, 63);
    const s50 = sma(b, 50);
    if (mom63 === null || s50 === null) continue;
    ranked.push({
      symbol,
      mom: mom63,
      aboveSma50: b[b.length - 1].close > s50,
    });
  }
  ranked.sort((a, b) => b.mom - a.mom);
  // Paper phase: buy EVERY name in an uptrend (above its 50-day MA), not a
  // top-N slice — the owner asked for as many buys as the rules can find.
  const topSymbols = ranked.filter((r) => r.aboveSma50);

  const heldTrend = held.filter((p) => p.leg === "STOCK");
  for (const p of heldTrend) {
    const b = bars.get(p.symbol);
    if (!b) continue;
    const s50 = sma(b, 50);
    const price = b[b.length - 1].close;
    // Exit only when the uptrend actually breaks (price below the 50-day MA).
    // The old "fell out of the top half" rotation is dropped — when you hold
    // many names at once, rotating on rank just churns.
    if (s50 !== null && price < s50) {
      out.push({
        strategy: "trend_momentum",
        leg: "STOCK",
        symbol: p.symbol,
        action: "EXIT",
        side: "SELL",
        strength: 1,
        reason: `Price ${round2(price)} closed below its 50-day average ${round2(s50)} — the uptrend that justified holding is broken.`,
        indicators: { price: round2(price), sma50: round2(s50) },
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
      reason: `${r.symbol} is in an uptrend — up +${round2(r.mom)}% over 3 months and trading above its 50-day average.`,
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

  // Loosened for paper activity: dip-buy across the whole stock watchlist
  // (not just broad ETFs), a shallower RSI(2) trigger (<25, was <10), and a
  // lighter 100-day trend filter (was 200-day).
  for (const symbol of STOCK_WATCHLIST) {
    const b = bars.get(symbol);
    if (!b || b.length < 120) continue;
    const r2 = rsi(b, 2);
    const s100 = sma(b, 100);
    const price = b[b.length - 1].close;
    if (r2 === null || s100 === null) continue;

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
    } else if (!pos && r2 < 25 && price > s100) {
      out.push({
        strategy: "rsi2_meanrev",
        leg: "STOCK",
        symbol,
        action: "ENTER",
        side: "BUY",
        strength: 0.6,
        reason: `${symbol} is oversold short-term (2-day RSI ${round2(r2)}, below 25) while still above its 100-day average — dips inside an uptrend have tended to bounce within days.`,
        indicators: { price: round2(price), rsi2: round2(r2), sma100: round2(s100) },
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
    } else if (!pos && s20 > s50) {
      out.push({
        strategy: "fx_trend",
        leg: "FX",
        symbol,
        action: "ENTER",
        side: "BUY",
        strength: 0.5,
        reason: `${symbol} is in an uptrend: its 20-day average is above its 50-day average. Trend-following takes the ride and exits on the cross-back.`,
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
  const signals = [
    ...trendMomentumSignals(stockBars, held),
    ...meanReversionSignals(stockBars, held),
    ...fxTrendSignals(fxBars, held),
  ];
  // Dedup ENTER candidates so one symbol isn't bought twice in a single tick
  // (momentum and dip-buying can both flag the same name). Keep every EXIT.
  const seen = new Set<string>();
  return signals.filter((s) => {
    if (s.action !== "ENTER") return true;
    const key = `${s.leg}:${s.symbol}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
