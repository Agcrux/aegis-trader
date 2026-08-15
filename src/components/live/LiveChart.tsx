"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HistoryResult } from "@/lib/data/live";
import { SYMBOL_NAMES } from "@/lib/config";
import { LiveDot } from "@/components/ui";

/**
 * The main chart panel: real price history with range switching, volume bars,
 * grid, live readouts and a hover crosshair that reads out the exact point
 * under the cursor. Refreshes every 30 seconds on the 1D range.
 */

const DEFAULT_RANGES = ["1D", "1W", "1M", "YTD"] as const;

const PLOT_W = 100;
const PLOT_H = 48;

export default function LiveChart({
  symbol = "SPY",
  ranges = DEFAULT_RANGES,
  initialRange,
  height = 380,
  showName = true,
}: {
  symbol?: string;
  ranges?: readonly string[];
  initialRange?: string;
  height?: number;
  showName?: boolean;
}) {
  const [range, setRange] = useState(initialRange ?? ranges[0]);
  const [loaded, setLoaded] = useState<HistoryResult | null>(null);
  const [failedSymbol, setFailedSymbol] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/market/history?symbol=${symbol}&range=${range}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as HistoryResult;
        if (alive) {
          setLoaded(body);
          setFailedSymbol(null);
        }
      } catch {
        if (alive) setFailedSymbol(symbol);
      }
    }
    load();
    const id = setInterval(load, range === "1D" ? 30000 : 120000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol, range]);

  // Keyed off the response so a symbol switch never leaves the old line on screen.
  const data = loaded?.symbol === symbol ? loaded : null;
  const error = failedSymbol === symbol;
  const points = useMemo(() => data?.points ?? [], [data]);
  const fx = symbol.length === 6 && !symbol.includes(".");
  const priceDigits = fx ? 4 : 2;

  const { min, span, maxVol, linePath, areaPath } = useMemo(() => {
    const closes = points.map((p) => p.c);
    const lo = closes.length ? Math.min(...closes) : 0;
    const hi = closes.length ? Math.max(...closes) : 1;
    const spread = hi - lo || 1;
    const x = (i: number) => (i / Math.max(1, closes.length - 1)) * PLOT_W;
    const y = (c: number) => PLOT_H - ((c - lo) / spread) * (PLOT_H - 4) - 2;
    const line = closes.map((c, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(c).toFixed(2)}`).join(" ");
    return {
      min: lo,
      span: spread,
      maxVol: points.length ? Math.max(...points.map((p) => p.v), 1) : 1,
      linePath: line,
      areaPath: closes.length > 1 ? `${line} L${PLOT_W},${PLOT_H} L0,${PLOT_H} Z` : "",
    };
  }, [points]);

  const up = (data?.changePct ?? 0) >= 0;
  const volBars = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 48)) === 0);
  const hovered = hover !== null ? points[hover] : undefined;
  const hoverLeftPct = hover !== null && points.length > 1 ? (hover / (points.length - 1)) * 100 : 0;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box || points.length < 2) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHover(Math.round(ratio * (points.length - 1)));
  }

  return (
    <section
      className="relative flex flex-col overflow-hidden rounded-sm border border-outline-variant bg-surface"
      style={{ height }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant p-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-xl font-semibold text-on-surface">{symbol}</span>
          {showName ? (
            <span className="hidden font-mono text-[13px] text-on-surface-variant sm:inline">
              {SYMBOL_NAMES[symbol] ?? ""}
            </span>
          ) : null}
          <span className="font-mono text-lg font-semibold text-primary">
            {data?.price
              ? data.price.toLocaleString("en-US", { maximumFractionDigits: priceDigits })
              : "—"}
          </span>
          <span className={`font-mono text-[13px] ${up ? "text-primary" : "text-error"}`}>
            {data ? `${up ? "+" : ""}${data.changePct.toFixed(2)}% ${range}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {ranges.map((r) => (
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

      <div
        ref={plotRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="relative flex flex-1 flex-col justify-end p-3"
      >
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
        {!error && !data ? (
          <div className="flex flex-1 items-center justify-center font-mono text-sm text-on-surface-variant">
            Loading {symbol}…
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

        {/* Price line + fill */}
        {points.length > 1 ? (
          <svg
            className="pointer-events-none absolute inset-x-3 top-3 z-20 h-[calc(100%-4.5rem)] w-[calc(100%-1.5rem)]"
            preserveAspectRatio="none"
            viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          >
            <defs>
              <linearGradient id={`fill-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={up ? "#75ff9e" : "#ffb4ab"} stopOpacity="0.22" />
                <stop offset="100%" stopColor={up ? "#75ff9e" : "#ffb4ab"} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#fill-${symbol})`} stroke="none" />
            <path
              d={linePath}
              fill="none"
              className={up ? "stroke-primary" : "stroke-error"}
              strokeWidth="0.6"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}

        {/* Hover crosshair */}
        {hovered ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-3 z-30 w-px bg-on-surface-variant/40"
              style={{ left: `calc(0.75rem + (100% - 1.5rem) * ${hoverLeftPct / 100})` }}
            />
            <div
              className={`pointer-events-none absolute z-30 flex flex-col gap-0.5 rounded-sm border border-outline-variant bg-surface-container px-2 py-1 font-mono text-[10px] shadow-lg ${
                hoverLeftPct > 60 ? "-translate-x-full" : ""
              }`}
              style={{
                left: `calc(0.75rem + (100% - 1.5rem) * ${hoverLeftPct / 100} ${
                  hoverLeftPct > 60 ? "- 0.5rem" : "+ 0.5rem"
                })`,
                top: "0.75rem",
              }}
            >
              <span className="text-on-surface">
                {hovered.c.toLocaleString("en-US", { maximumFractionDigits: priceDigits })}
              </span>
              <span className="text-on-surface-variant">
                {new Date(hovered.t).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  ...(range === "1D" || range === "1W"
                    ? { hour: "numeric", minute: "2-digit" }
                    : { year: "2-digit" }),
                })}
              </span>
              {hovered.v ? (
                <span className="text-on-surface-variant/70">vol {compact(hovered.v)}</span>
              ) : null}
            </div>
          </>
        ) : null}

        {/* Live readouts */}
        <div className="absolute left-3 top-3 z-20 flex flex-col gap-1">
          {data?.rsi14 !== null && data?.rsi14 !== undefined ? (
            <span className="font-mono text-[10px] text-primary">RSI(14): {data.rsi14}</span>
          ) : null}
          {points.length ? (
            <span className="font-mono text-[10px] text-on-surface-variant">
              {min.toLocaleString("en-US", { maximumFractionDigits: priceDigits })} –{" "}
              {(min + span).toLocaleString("en-US", { maximumFractionDigits: priceDigits })} ·{" "}
              {points.length} pts · updates {range === "1D" ? "30s" : "2m"}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function compact(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}
