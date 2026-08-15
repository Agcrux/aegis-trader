"use client";

import { useEffect, useState } from "react";
import type { HistoryResult } from "@/lib/data/live";
import { LiveDot } from "@/components/ui";

/**
 * The main chart panel from the terminal design: real price history with
 * range switching (1D/1W/1M/YTD), volume bars, grid, and live readouts.
 * Refreshes every 30 seconds on the 1D range.
 */

const RANGES = ["1D", "1W", "1M", "YTD"] as const;

const NAMES: Record<string, string> = {
  SPY: "SPDR S&P 500 ETF Trust",
  QQQ: "Invesco QQQ Trust",
  EURUSD: "Euro / US Dollar",
};

export default function LiveChart({ symbol = "SPY" }: { symbol?: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1D");
  const [data, setData] = useState<HistoryResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/market/history?symbol=${symbol}&range=${range}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as HistoryResult;
        if (alive) {
          setData(body);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    }
    load();
    const id = setInterval(load, range === "1D" ? 30000 : 120000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol, range]);

  const points = data?.points ?? [];
  const closes = points.map((p) => p.c);
  const min = closes.length ? Math.min(...closes) : 0;
  const max = closes.length ? Math.max(...closes) : 1;
  const span = max - min || 1;
  const maxVol = points.length ? Math.max(...points.map((p) => p.v), 1) : 1;
  const up = (data?.changePct ?? 0) >= 0;

  const linePath = closes
    .map(
      (c, i) =>
        `${i === 0 ? "M" : "L"}${((i / Math.max(1, closes.length - 1)) * 100).toFixed(2)},${(
          48 -
          ((c - min) / span) * 44 -
          2
        ).toFixed(2)}`
    )
    .join(" ");

  const volBars = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 48)) === 0);

  return (
    <section className="relative flex h-[380px] flex-col overflow-hidden rounded-sm border border-outline-variant bg-surface">
      <div className="flex items-center justify-between border-b border-outline-variant p-3">
        <div className="flex items-center gap-3">
          <span className="text-xl font-semibold text-on-surface">{symbol}</span>
          <span className="hidden font-mono text-[13px] text-on-surface-variant sm:inline">
            {NAMES[symbol] ?? ""}
          </span>
          <span className="font-mono text-lg font-semibold text-primary">
            {data?.price ? data.price.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"}
          </span>
          <span className={`font-mono text-[13px] ${up ? "text-primary" : "text-error"}`}>
            {data ? `${up ? "+" : ""}${data.changePct.toFixed(2)}% ${range}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-xs px-2 py-1 font-mono text-[11px] font-semibold transition-colors ${
                r === range
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              {r}
            </button>
          ))}
          <LiveDot />
        </div>
      </div>

      <div className="relative flex flex-1 flex-col justify-end p-3">
        {/* Background grid */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-6 grid-rows-4 opacity-10">
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              className={`border-on-surface-variant ${i % 6 !== 5 ? "border-r" : ""} ${i < 18 ? "border-b" : ""}`}
            />
          ))}
        </div>

        {error && !data ? (
          <div className="flex flex-1 items-center justify-center font-mono text-sm text-on-surface-variant">
            Live feed unreachable — retrying…
          </div>
        ) : null}

        {/* Volume bars */}
        <div className="z-10 flex h-14 w-full items-end gap-px pb-1 opacity-60">
          {volBars.map((p, i) => {
            const prev = i > 0 ? volBars[i - 1].c : p.c;
            return (
              <div
                key={p.t}
                className={`w-full ${p.c >= prev ? "bg-primary/40" : "bg-error/40"}`}
                style={{ height: `${Math.max(4, (p.v / maxVol) * 100)}%` }}
              />
            );
          })}
        </div>

        {/* Price line */}
        {closes.length > 1 ? (
          <svg
            className={`absolute inset-x-3 top-3 z-20 h-[calc(100%-4.5rem)] w-[calc(100%-1.5rem)] fill-none ${
              up ? "stroke-primary" : "stroke-error"
            }`}
            preserveAspectRatio="none"
            viewBox="0 0 100 48"
          >
            <path d={linePath} strokeWidth="0.6" strokeLinejoin="round" />
          </svg>
        ) : null}

        {/* Live readouts */}
        <div className="absolute left-3 top-3 z-30 flex flex-col gap-1">
          {data?.rsi14 !== null && data?.rsi14 !== undefined ? (
            <span className="font-mono text-[10px] text-primary">RSI(14): {data.rsi14}</span>
          ) : null}
          <span className="font-mono text-[10px] text-on-surface-variant">
            {points.length} pts · updates {range === "1D" ? "30s" : "2m"}
          </span>
        </div>
      </div>
    </section>
  );
}
