import { LiveDot, Stat } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";

/**
 * The "Live Analytics" glass widget from the terminal design. Fed by the
 * real combined portfolio numbers computed server-side (not simulated).
 */
export default function LiveAnalytics({
  dayPnl,
  totalEquity,
  totalReturnPct,
  winRatePct,
  openPositions,
}: {
  dayPnl: number;
  totalEquity: number;
  totalReturnPct: number;
  winRatePct: number | null;
  openPositions: number;
}) {
  return (
    <section className="group relative flex flex-col overflow-hidden rounded-sm border border-outline-variant bg-surface p-4">
      <div className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
      <h2 className="z-10 mb-2 flex items-center justify-between text-base font-semibold text-on-surface">
        Live Analytics
        <LiveDot />
      </h2>
      <div className="z-10 flex flex-1 flex-col justify-center space-y-3">
        <div className="rounded-sm border border-outline-variant bg-surface-container p-3">
          <span className="mb-1 block text-[11px] uppercase tracking-[0.05em] text-on-surface-variant">
            Open P&amp;L · unrealized (all accounts)
          </span>
          <div className={`font-mono text-3xl font-bold ${dayPnl >= 0 ? "text-primary" : "text-error"}`}>
            {dayPnl >= 0 ? "+" : ""}
            {fmtMoney(dayPnl).replace("$-", "-$")}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-sm border border-outline-variant bg-surface-container p-2">
            <Stat
              label="Total equity"
              value={fmtMoney(totalEquity)}
              sub={`${fmtPct(totalReturnPct)} since start`}
            />
          </div>
          <div className="rounded-sm border border-outline-variant bg-surface-container p-2">
            <Stat
              label="Win rate"
              value={winRatePct === null ? "—" : `${winRatePct.toFixed(0)}%`}
              sub={`${openPositions} open`}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
