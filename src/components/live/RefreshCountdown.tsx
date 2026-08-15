"use client";

import { useEffect, useState } from "react";

/**
 * Small live indicator that counts down to the next data refresh, with a
 * depleting ring. Feed it the widget's poll interval and the timestamp of its
 * last successful fetch; it re-renders itself ~4x/second and shows
 * "next update in Ns", flipping to "refreshing…" as the fetch lands.
 */
export default function RefreshCountdown({
  intervalMs,
  updatedAt,
  label = "next update",
}: {
  intervalMs: number;
  updatedAt: number;
  label?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsed = updatedAt > 0 ? Math.max(0, now - updatedAt) : 0;
  const remainMs = Math.max(0, intervalMs - elapsed);
  const secs = Math.ceil(remainMs / 1000);
  const frac = Math.min(1, elapsed / intervalMs); // 0 just after refresh → 1 at due
  const refreshing = updatedAt === 0 || remainMs <= 300;

  const r = 6;
  const circ = 2 * Math.PI * r;

  return (
    <span
      className="flex items-center gap-1.5 font-mono text-[10px] text-on-surface-variant"
      title="Time until the next automatic data refresh"
      aria-live="polite"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" className="-rotate-90 shrink-0">
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke="#75ff9e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * frac}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      {refreshing ? (
        <span className="text-primary">refreshing…</span>
      ) : (
        <span>
          {label} in {secs}s
        </span>
      )}
    </span>
  );
}
