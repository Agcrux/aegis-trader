"use client";

import { useEffect, useState } from "react";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { LivePortfolio } from "@/app/api/portfolio/live/route";
import RefreshCountdown from "./RefreshCountdown";

/**
 * The "Live Analytics" glass widget from the terminal design.
 * Seeded with server-computed values for first paint, then it polls
 * /api/portfolio/live every 15s so equity and unrealized earnings track the
 * market in real time — never a frozen number. A countdown shows exactly when
 * the next refresh lands.
 */

const REFRESH_MS = 15000;

interface Props {
  dayPnl: number;
  totalEquity: number;
  totalReturnPct: number;
  winRatePct: number | null;
  openPositions: number;
}

export default function LiveAnalytics(initial: Props) {
  const [data, setData] = useState<Props>(initial);
  const [updatedAt, setUpdatedAt] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/portfolio/live", { cache: "no-store" });
        if (!res.ok) return;
        const p = (await res.json()) as LivePortfolio;
        if (!alive) return;
        setData({
          dayPnl: p.totalOpenPnl,
          totalEquity: p.totalEquity,
          totalReturnPct: p.totalReturnPct,
          winRatePct: p.winRatePct,
          openPositions: p.openPositions,
        });
        setUpdatedAt(Date.now());
      } catch {
        /* keep last good values */
      }
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const { dayPnl, totalEquity, totalReturnPct, winRatePct, openPositions } = data;
  const up = dayPnl >= 0;

  return (
    <section className="group relative flex flex-col overflow-hidden rounded-sm border border-outline-variant bg-surface p-4">
      <div className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
      <h2 className="z-10 mb-2 flex items-center justify-between text-base font-semibold text-on-surface">
        Live Analytics
        <RefreshCountdown intervalMs={REFRESH_MS} updatedAt={updatedAt} />
      </h2>
      <div className="z-10 flex flex-1 flex-col justify-center space-y-3">
        <div className="rounded-sm border border-outline-variant bg-surface-container p-3">
          <span className="mb-1 block text-[11px] uppercase tracking-[0.05em] text-on-surface-variant">
            Live earnings · unrealized P&amp;L (all accounts)
          </span>
          <div className={`font-mono text-3xl font-bold ${up ? "text-primary" : "text-error"}`}>
            {dayPnl >= 0 ? "+" : ""}
            {fmtMoney(dayPnl).replace("$-", "-$")}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-sm border border-outline-variant bg-surface-container p-2">
            <div className="text-[11px] uppercase tracking-[0.05em] text-on-surface-variant">
              Total equity
            </div>
            <div className="font-mono text-lg font-semibold text-on-surface">
              {fmtMoney(totalEquity)}
            </div>
            <div className="text-xs text-on-surface-variant/80">{fmtPct(totalReturnPct)} since start</div>
          </div>
          <div className="rounded-sm border border-outline-variant bg-surface-container p-2">
            <div className="text-[11px] uppercase tracking-[0.05em] text-on-surface-variant">
              Win rate
            </div>
            <div className="font-mono text-lg font-semibold text-on-surface">
              {winRatePct === null ? "—" : `${winRatePct.toFixed(0)}%`}
            </div>
            <div className="text-xs text-on-surface-variant/80">{openPositions} open</div>
          </div>
        </div>
      </div>
    </section>
  );
}
