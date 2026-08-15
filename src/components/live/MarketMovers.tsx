"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LiveQuote } from "@/lib/data/live";
import { STOCK_WATCHLIST } from "@/lib/config";

/** The market-movers table from the terminal design, fed by real quotes. */

type Tab = "gainers" | "losers" | "volume";

function fmtVol(v: number | null): string {
  if (!v) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

export default function MarketMovers() {
  const [quotes, setQuotes] = useState<LiveQuote[]>([]);
  const [tab, setTab] = useState<Tab>("gainers");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/market/live?symbols=${STOCK_WATCHLIST.join(",")}`);
        if (!res.ok) return;
        const data = (await res.json()) as { quotes: LiveQuote[] };
        if (alive) setQuotes(data.quotes);
      } catch {
        // keep last good data
      }
    }
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const rows = useMemo(() => {
    const sorted = [...quotes];
    if (tab === "gainers") sorted.sort((a, b) => b.changePct - a.changePct);
    else if (tab === "losers") sorted.sort((a, b) => a.changePct - b.changePct);
    else sorted.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    return sorted.slice(0, 6);
  }, [quotes, tab]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "gainers", label: "Top Gainers" },
    { id: "losers", label: "Top Losers" },
    { id: "volume", label: "Volume" },
  ];

  return (
    <section className="flex flex-col overflow-hidden rounded-sm border border-outline-variant bg-surface">
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low p-3">
        <h2 className="text-base font-semibold text-on-surface">Market Movers</h2>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-xs px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] transition-colors ${
                tab === t.id
                  ? "bg-primary/10 text-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-outline-variant bg-surface">
            <tr className="text-[11px] uppercase tracking-[0.05em] text-on-surface-variant">
              <th className="w-1/4 px-4 py-2 font-semibold">Symbol</th>
              <th className="w-1/4 px-4 py-2 text-right font-semibold">Price</th>
              <th className="w-1/4 px-4 py-2 text-right font-semibold">Change %</th>
              <th className="w-1/4 px-4 py-2 text-right font-semibold">Volume</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[13px]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-on-surface-variant">
                  Loading live quotes…
                </td>
              </tr>
            ) : (
              rows.map((q) => (
                <tr
                  key={q.symbol}
                  className="border-b border-outline-variant/50 transition-colors hover:bg-surface-container-high"
                >
                  <td className="px-4 py-1.5 font-bold text-on-surface">
                    <Link href={`/markets/${q.symbol}`} className="hover:text-primary hover:underline">
                      {q.symbol}
                    </Link>
                  </td>
                  <td className="px-4 py-1.5 text-right text-on-surface">
                    {q.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </td>
                  <td
                    className={`px-4 py-1.5 text-right ${q.changePct >= 0 ? "text-primary" : "text-error"}`}
                  >
                    {q.changePct >= 0 ? "+" : ""}
                    {q.changePct.toFixed(2)}%
                  </td>
                  <td className="px-4 py-1.5 text-right text-on-surface-variant">
                    {fmtVol(q.volume)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
