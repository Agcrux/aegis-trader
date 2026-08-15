import type { Bar, BacktestResult } from "./types";
import { fetchMany } from "./data/market";
import {
  BENCHMARK,
  FX_SPREAD_BPS,
  FX_WATCHLIST,
  MEANREV_UNIVERSE,
  SLIPPAGE_BPS,
  STOCK_WATCHLIST,
} from "./config";
import { atr, momentum, rsi, sma, smaRising } from "./strategy/indicators";

/**
 * Daily-bar backtester for the three v1 strategies over 5+ years of history,
 * net of slippage/spread assumptions, versus buy-and-hold SPY. A strategy that
 * cannot beat doing nothing here never touches even paper money (VISION.md).
 *
 * Honesty notes baked into the method: signals computed on day N execute at
 * day N+1's open (no look-ahead), and every fill pays the slippage haircut.
 */

const YEARS = 5;
const START_CASH = 1000; // scale-free; percentages are what matter

interface SimPos {
  symbol: string;
  qty: number;
  entryIdx: number;
}

function alignedIndex(dates: string[], bars: Map<string, Bar[]>): Map<string, Map<string, Bar>> {
  const bySymbol = new Map<string, Map<string, Bar>>();
  for (const [sym, list] of bars) {
    bySymbol.set(sym, new Map(list.map((b) => [b.date, b])));
  }
  void dates;
  return bySymbol;
}

function equityStats(
  curve: Array<{ t: string; v: number; b: number }>,
  trades: number,
  wins: number,
  feesPaid: number,
  years: number
) {
  const first = curve[0];
  const last = curve[curve.length - 1];
  const totalReturnPct = ((last.v - first.v) / first.v) * 100;
  const benchmarkReturnPct = ((last.b - first.b) / first.b) * 100;
  const cagrPct = (Math.pow(last.v / first.v, 1 / years) - 1) * 100;
  const benchmarkCagrPct = (Math.pow(last.b / first.b, 1 / years) - 1) * 100;
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of curve) {
    peak = Math.max(peak, p.v);
    maxDd = Math.max(maxDd, ((peak - p.v) / peak) * 100);
  }
  const thin = curve.filter((_, i) => i % 5 === 0 || i === curve.length - 1);
  return {
    totalReturnPct: r2(totalReturnPct),
    cagrPct: r2(cagrPct),
    maxDrawdownPct: r2(maxDd),
    winRatePct: trades > 0 ? r2((wins / trades) * 100) : 0,
    trades,
    benchmarkReturnPct: r2(benchmarkReturnPct),
    benchmarkCagrPct: r2(benchmarkCagrPct),
    feesPaid: r2(feesPaid),
    equityCurve: thin.map((p) => ({ t: p.t, v: r2(p.v), b: r2(p.b) })),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

type StrategyId = "trend_momentum" | "rsi2_meanrev" | "fx_trend";

export async function runBacktest(strategy: StrategyId): Promise<Omit<BacktestResult, "id" | "ts">> {
  const isFx = strategy === "fx_trend";
  const symbols = isFx
    ? FX_WATCHLIST
    : strategy === "rsi2_meanrev"
      ? MEANREV_UNIVERSE
      : STOCK_WATCHLIST;

  const { bars } = await fetchMany(symbols, isFx ? "FX" : "STOCK", 300 + YEARS * 262);
  const bench = (await fetchMany([BENCHMARK], "STOCK", 300 + YEARS * 262)).bars.get(BENCHMARK);
  if (!bench || bars.size === 0) throw new Error("Not enough data to backtest");

  // Use the benchmark's calendar as the master clock.
  const warmup = 260;
  const dates = bench.map((b) => b.date);
  const startIdx = Math.max(warmup, dates.length - YEARS * 252);
  const bySymbol = alignedIndex(dates, bars);

  // Build per-symbol aligned arrays up to each master date for indicator math.
  const aligned = new Map<string, Bar[]>();
  for (const sym of bars.keys()) aligned.set(sym, []);

  let cash = START_CASH;
  const open: SimPos[] = [];
  const maxPositions = isFx ? 2 : 3;
  const haircut = (isFx ? FX_SPREAD_BPS : SLIPPAGE_BPS) / 10000;

  let trades = 0;
  let wins = 0;
  let feesPaid = 0;
  const curve: Array<{ t: string; v: number; b: number }> = [];
  const benchStartPrice = bench[startIdx].close;
  const entryPrices = new Map<string, number>();

  const priceAt = (sym: string, date: string): number | null => {
    const bar = bySymbol.get(sym)?.get(date);
    return bar ? bar.close : null;
  };

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    for (const sym of bars.keys()) {
      const bar = bySymbol.get(sym)!.get(date);
      if (bar) aligned.get(sym)!.push(bar);
    }
    if (i < startIdx) continue;

    // Execute yesterday-computed decisions at today's open ≈ today's close of
    // daily data with haircut (conservative simplification for daily swing).
    const decisions: Array<{ sym: string; action: "ENTER" | "EXIT" }> = [];

    for (const sym of bars.keys()) {
      const hist = aligned.get(sym)!;
      const j = hist.length - 2; // signal on prior completed bar
      if (j < warmup - 20) continue;
      const held = open.find((p) => p.symbol === sym);

      if (strategy === "trend_momentum") {
        const s50 = sma(hist, 50, j);
        if (held && s50 !== null && hist[j].close < s50) decisions.push({ sym, action: "EXIT" });
      } else if (strategy === "rsi2_meanrev") {
        const r = rsi(hist, 2, j);
        if (held && r !== null && r > 65) decisions.push({ sym, action: "EXIT" });
      } else {
        const s20 = sma(hist, 20, j);
        const s50 = sma(hist, 50, j);
        if (held && s20 !== null && s50 !== null && s20 < s50)
          decisions.push({ sym, action: "EXIT" });
      }
    }

    // Entries (rank momentum globally; others per-symbol).
    if (strategy === "trend_momentum") {
      const ranked: Array<{ sym: string; mom: number }> = [];
      for (const sym of bars.keys()) {
        const hist = aligned.get(sym)!;
        const j = hist.length - 2;
        if (j < warmup) continue;
        const m = momentum(hist, 63, j);
        const s50 = sma(hist, 50, j);
        const rising = smaRising(hist, 200, 21, j);
        if (m !== null && s50 !== null && rising && hist[j].close > s50)
          ranked.push({ sym, mom: m });
      }
      ranked.sort((a, b) => b.mom - a.mom);
      for (const r of ranked.slice(0, maxPositions)) {
        if (!open.find((p) => p.symbol === r.sym)) decisions.push({ sym: r.sym, action: "ENTER" });
      }
    } else if (strategy === "rsi2_meanrev") {
      for (const sym of bars.keys()) {
        const hist = aligned.get(sym)!;
        const j = hist.length - 2;
        if (j < warmup) continue;
        const r = rsi(hist, 2, j);
        const s200 = sma(hist, 200, j);
        if (
          r !== null &&
          s200 !== null &&
          r < 10 &&
          hist[j].close > s200 &&
          !open.find((p) => p.symbol === sym)
        )
          decisions.push({ sym, action: "ENTER" });
      }
    } else {
      for (const sym of bars.keys()) {
        const hist = aligned.get(sym)!;
        const j = hist.length - 2;
        if (j < 120) continue;
        const s20 = sma(hist, 20, j);
        const s50 = sma(hist, 50, j);
        const a = atr(hist, 10, j);
        if (
          s20 !== null &&
          s50 !== null &&
          a !== null &&
          s20 > s50 &&
          hist[j].close > s20 &&
          !open.find((p) => p.symbol === sym)
        )
          decisions.push({ sym, action: "ENTER" });
      }
    }

    for (const d of decisions) {
      const price = priceAt(d.sym, date);
      if (price === null) continue;
      if (d.action === "EXIT") {
        const idx = open.findIndex((p) => p.symbol === d.sym);
        if (idx === -1) continue;
        const pos = open[idx];
        const fill = price * (1 - haircut);
        const proceeds = pos.qty * fill;
        const entry = entryPrices.get(d.sym) ?? fill;
        feesPaid += pos.qty * price * haircut;
        if (fill > entry) wins++;
        trades++;
        cash += proceeds;
        open.splice(idx, 1);
        entryPrices.delete(d.sym);
      } else if (open.length < maxPositions) {
        const fill = price * (1 + haircut);
        const alloc = Math.min(cash, (cash + markValue(open, date)) / maxPositions);
        if (alloc < 10) continue;
        const qty = alloc / fill;
        feesPaid += alloc * haircut;
        cash -= alloc;
        open.push({ symbol: d.sym, qty, entryIdx: i });
        entryPrices.set(d.sym, fill);
      }
    }

    function markValue(list: SimPos[], onDate: string): number {
      let v = 0;
      for (const p of list) v += p.qty * (priceAt(p.symbol, onDate) ?? 0);
      return v;
    }

    const equity = cash + markValue(open, date);
    const benchVal = START_CASH * (bench[i].close / benchStartPrice);
    curve.push({ t: date, v: equity, b: benchVal });
  }

  const years = curve.length / 252;
  const result = equityStats(curve, trades, wins, feesPaid, Math.max(1, years));
  const passed = result.totalReturnPct > result.benchmarkReturnPct && result.maxDrawdownPct < 40;

  return {
    strategy,
    market: isFx ? "FX" : "STOCKS",
    years: r2(years),
    params:
      strategy === "trend_momentum"
        ? { topN: maxPositions, momentumDays: 63, trendFilter: "50d & rising 200d SMA" }
        : strategy === "rsi2_meanrev"
          ? { rsiPeriod: 2, entryBelow: 10, exitAbove: 65, regimeFilter: "price > 200d SMA" }
          : { fast: 20, slow: 50, universe: FX_WATCHLIST.join(",") },
    result,
    passed,
  };
}

export const BACKTEST_STRATEGIES: StrategyId[] = ["trend_momentum", "rsi2_meanrev", "fx_trend"];
