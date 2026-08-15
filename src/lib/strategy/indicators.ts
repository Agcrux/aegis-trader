import type { Bar } from "../types";

/** Simple moving average of closes over the last `period` bars ending at index `i`. */
export function sma(bars: Bar[], period: number, i: number = bars.length - 1): number | null {
  if (i + 1 < period) return null;
  let sum = 0;
  for (let k = i - period + 1; k <= i; k++) sum += bars[k].close;
  return sum / period;
}

/** Percent return over the last `period` bars ending at index `i`. */
export function momentum(bars: Bar[], period: number, i: number = bars.length - 1): number | null {
  if (i < period) return null;
  const then = bars[i - period].close;
  if (then <= 0) return null;
  return ((bars[i].close - then) / then) * 100;
}

/** Wilder RSI over `period` (default 2 for the mean-reversion strategy). */
export function rsi(bars: Bar[], period: number, i: number = bars.length - 1): number | null {
  if (i < period) return null;
  let gains = 0;
  let losses = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const diff = bars[k].close - bars[k - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (gains + losses === 0) return 50;
  const rs = losses === 0 ? Infinity : gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

/** Average true range over `period` bars ending at `i` (absolute price units). */
export function atr(bars: Bar[], period: number, i: number = bars.length - 1): number | null {
  if (i < period) return null;
  let sum = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const prevClose = bars[k - 1].close;
    const tr = Math.max(
      bars[k].high - bars[k].low,
      Math.abs(bars[k].high - prevClose),
      Math.abs(bars[k].low - prevClose)
    );
    sum += tr;
  }
  return sum / period;
}

/** True if the SMA(period) is higher now than `lookback` bars ago (rising trend filter). */
export function smaRising(
  bars: Bar[],
  period: number,
  lookback: number,
  i: number = bars.length - 1
): boolean | null {
  const now = sma(bars, period, i);
  const past = sma(bars, period, i - lookback);
  if (now === null || past === null) return null;
  return now > past;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
