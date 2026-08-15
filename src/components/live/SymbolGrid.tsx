"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LiveQuote } from "@/lib/data/live";
import { ALL_SYMBOLS, SYMBOL_NAMES, legForSymbol } from "@/lib/config";
import { MSym } from "@/components/ui";

/**
 * Every tradable symbol as a clickable card. This is the way into a symbol's
 * own chart page — the cards used to be decoration, now they navigate.
 */

function Spark({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
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
    <svg
      className={`absolute bottom-0 left-0 h-1/2 w-full fill-none opacity-50 ${
        up ? "stroke-primary" : "stroke-error"
      }`}
      preserveAspectRatio="none"
      viewBox="0 0 100 20"
    >
      <path d={d} strokeWidth="1.5" />
    </svg>
  );
}

export default function SymbolGrid() {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/market/live?symbols=${ALL_SYMBOLS.join(",")}`);
        if (!res.ok) return;
        const data = (await res.json()) as { quotes: LiveQuote[] };
        if (!alive) return;
        const map: Record<string, LiveQuote> = {};
        for (const q of data.quotes) map[q.symbol] = q;
        setQuotes(map);
      } catch {
        // keep last good data
      }
    }
    load();
    const id = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return ALL_SYMBOLS;
    return ALL_SYMBOLS.filter(
      (s) => s.includes(q) || (SYMBOL_NAMES[s] ?? "").toUpperCase().includes(q)
    );
  }, [query]);

  return (
    <section className="rounded-sm border border-outline-variant bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-low p-3">
        <h2 className="text-base font-semibold text-on-surface">
          Watchlist <span className="text-on-surface-variant">· click any symbol for its chart</span>
        </h2>
        <label className="flex items-center gap-1.5 rounded-sm border border-outline-variant bg-surface-container px-2 py-1">
          <MSym name="search" className="text-sm text-on-surface-variant" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter symbols"
            className="w-32 bg-transparent font-mono text-[12px] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none sm:w-44"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((s) => {
          const q = quotes[s];
          const up = (q?.changePct ?? 0) >= 0;
          const digits = legForSymbol(s) === "FX" ? 4 : 2;
          return (
            <Link
              key={s}
              href={`/markets/${s}`}
              className="group relative flex h-[74px] flex-col justify-between overflow-hidden rounded-sm border border-outline-variant bg-surface-container-low p-2.5 transition-colors hover:border-primary/60 hover:bg-surface-container-high"
            >
              <div className="z-10 flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="font-semibold text-on-surface">{s}</div>
                  <div className="truncate text-[10px] text-on-surface-variant">
                    {SYMBOL_NAMES[s] ?? ""}
                  </div>
                </div>
                {q ? (
                  <span
                    className={`shrink-0 rounded-xs px-1 py-0.5 font-mono text-[11px] ${
                      up ? "bg-primary/10 text-primary" : "bg-error/10 text-error"
                    }`}
                  >
                    {up ? "+" : ""}
                    {q.changePct.toFixed(2)}%
                  </span>
                ) : null}
              </div>
              <div className="z-10 font-mono text-[15px] font-semibold text-on-surface">
                {q ? q.price.toLocaleString("en-US", { maximumFractionDigits: digits }) : "…"}
              </div>
              {q ? <Spark points={q.spark} up={up} /> : null}
            </Link>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-on-surface-variant">
          Nothing matches “{query}”. The engine only trades a fixed liquid watchlist.
        </p>
      ) : null}
    </section>
  );
}
