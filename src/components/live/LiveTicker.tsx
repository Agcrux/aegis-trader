"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LiveQuote } from "@/lib/data/live";

/**
 * The four sparkline index cards from the terminal design, driven by real
 * quotes and refreshed every 20 seconds. Each card links to that symbol's
 * chart page.
 */

const CARDS: Array<{ symbol: string; label: string }> = [
  { symbol: "SPY", label: "S&P 500 (SPY)" },
  { symbol: "QQQ", label: "NASDAQ 100 (QQQ)" },
  { symbol: "GLD", label: "GOLD (GLD)" },
  { symbol: "EURUSD", label: "EUR/USD" },
];

function Spark({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * 100).toFixed(1)},${(
          20 -
          ((p - min) / span) * 18 -
          1
        ).toFixed(1)}`
    )
    .join(" ");
  return (
    <>
      <div
        className={`absolute bottom-0 left-0 z-0 h-1/2 w-full bg-gradient-to-t ${
          up ? "from-primary/20" : "from-error/20"
        } to-transparent opacity-40`}
      />
      <svg
        className={`absolute bottom-0 left-0 z-0 h-1/2 w-full fill-none opacity-60 ${
          up ? "stroke-primary" : "stroke-error"
        }`}
        preserveAspectRatio="none"
        viewBox="0 0 100 20"
      >
        <path d={path} strokeWidth="1.5" />
      </svg>
    </>
  );
}

export default function LiveTicker() {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/market/live?symbols=${CARDS.map((c) => c.symbol).join(",")}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { quotes: LiveQuote[] };
        if (!alive) return;
        const map: Record<string, LiveQuote> = {};
        for (const q of data.quotes) map[q.symbol] = q;
        setQuotes(map);
        setStale(false);
      } catch {
        if (alive) setStale(true);
      }
    }
    load();
    const id = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((c) => {
        const q = quotes[c.symbol];
        const up = (q?.changePct ?? 0) >= 0;
        return (
          <Link
            key={c.symbol}
            href={`/markets/${c.symbol}`}
            className="group relative flex h-24 flex-col justify-between overflow-hidden rounded-sm border border-outline-variant bg-surface p-3 transition-colors hover:border-primary/60 hover:bg-surface-container-low"
          >
            <div className="z-10 flex items-start justify-between">
              <span className="font-mono text-[13px] text-on-surface-variant">{c.label}</span>
              {q ? (
                <span
                  className={`flex items-center gap-0.5 rounded-xs px-1.5 py-0.5 font-mono text-[12px] ${
                    up ? "bg-primary/10 text-primary" : "bg-error/10 text-error"
                  }`}
                >
                  {up ? "▲" : "▼"} {up ? "+" : ""}
                  {q.changePct.toFixed(2)}%
                </span>
              ) : (
                <span className="font-mono text-[11px] text-on-surface-variant">
                  {stale ? "offline" : "…"}
                </span>
              )}
            </div>
            <div className="z-10 flex items-baseline justify-between">
              <span className="font-mono text-lg font-semibold text-on-surface">
                {q ? q.price.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"}
              </span>
              <span className="z-10 font-mono text-[10px] text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100">
                open chart →
              </span>
            </div>
            {q ? <Spark points={q.spark} up={up} /> : null}
          </Link>
        );
      })}
    </section>
  );
}
