"use client";

import { useEffect, useState } from "react";
import type { LiveQuote } from "@/lib/data/live";
import { STOCK_WATCHLIST } from "@/lib/config";
import { MSym } from "@/components/ui";

/**
 * The order-execution panel from the terminal design — kept as a LIVE-PRICED
 * calculator, not a live order router. Per the safety contract this build has
 * no live-execution path; the panel shows real quotes and a computed estimate,
 * and is explicit that placing orders is the automated engine's job (on paper)
 * or the owner's own broker app.
 */
export default function OrderPanel() {
  const [symbol, setSymbol] = useState("SPY");
  const [qty, setQty] = useState(1);
  const [quote, setQuote] = useState<LiveQuote | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/market/live?symbols=${symbol}`);
        if (!res.ok) return;
        const data = (await res.json()) as { quotes: LiveQuote[] };
        if (alive) setQuote(data.quotes[0] ?? null);
      } catch {
        /* keep last */
      }
    }
    load();
    const id = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol]);

  const price = quote?.price ?? 0;
  const estValue = price * qty;

  return (
    <section className="flex flex-col rounded-sm border border-outline-variant bg-surface p-4">
      <h2 className="mb-4 text-base font-semibold text-on-surface">Order Calculator</h2>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-[0.05em] text-on-surface-variant">
            Symbol
          </label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full rounded-sm border border-outline-variant bg-surface-container px-3 py-2 font-mono text-[13px] text-on-surface focus:border-primary focus:outline-none"
          >
            {STOCK_WATCHLIST.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.05em] text-on-surface-variant">
              Quantity
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(Math.max(0, Number(e.target.value)))}
              className="w-full rounded-sm border border-outline-variant bg-surface-container px-3 py-2 text-right font-mono text-[13px] text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.05em] text-on-surface-variant">
              Live price
            </label>
            <div className="rounded-sm border border-outline-variant bg-surface-container px-3 py-2 text-right font-mono text-[13px] text-primary">
              {price ? price.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
            </div>
          </div>
        </div>
        <div className="pt-1">
          <div className="mb-1 flex justify-between text-[11px] text-on-surface-variant">
            <span>Est. Value</span>
            <span className="font-mono text-on-surface">
              {estValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-on-surface-variant">
            <span>Change today</span>
            <span className={`font-mono ${(quote?.changePct ?? 0) >= 0 ? "text-primary" : "text-error"}`}>
              {quote ? `${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%` : "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-sm border border-outline-variant bg-surface-container-low p-3 text-[11px] leading-relaxed text-on-surface-variant">
        <MSym name="lock" className="mt-px text-sm text-primary" />
        <span>
          Manual orders aren&apos;t placed from here. The automated engine executes on paper
          inside your risk caps; for anything by hand, use your own broker app. This keeps the
          one-chokepoint safety rule intact.
        </span>
      </div>
    </section>
  );
}
