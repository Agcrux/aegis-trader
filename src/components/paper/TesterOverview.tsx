import Link from "next/link";
import { Card, MSym, Section, Stat } from "@/components/ui";
import EquityChart from "@/components/EquityChart";
import LiveTicker from "@/components/live/LiveTicker";
import PaperControls from "@/components/paper/PaperControls";
import { fmtMoney, fmtPct, fmtQty, timeAgo } from "@/lib/format";
import type { SandboxView } from "@/lib/paper/view";

/**
 * The tester's dashboard. The headline is "potential earnings": what these
 * paper trades would have earned in real USD, since no real dollars are ever
 * involved. Prices, quotes and P&L arithmetic are the same as the owner side.
 */

function signedMoney(n: number): string {
  return `${n >= 0 ? "+" : "−"}${fmtMoney(Math.abs(n))}`;
}

function dp(leg: string): number {
  return leg === "FX" ? 4 : 2;
}

function daysSince(ts: number): number {
  return Math.max(1, Math.round((Date.now() - ts) / 86400000));
}

export default function TesterOverview({ view }: { view: SandboxView }) {
  const { valuation: v, trades, marks } = view;
  const up = v.potentialEarnings >= 0;
  const days = daysSince(v.startedAt);

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveTicker />
        </div>

        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
                Potential earnings
              </span>
              <span className="rounded-xs bg-tertiary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-tertiary">
                PAPER
              </span>
            </div>
            <div
              className={`font-mono text-3xl font-semibold ${up ? "text-primary" : "text-error"}`}
            >
              {signedMoney(v.potentialEarnings)}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant">
              What these trades would have made in real USD, on{" "}
              {fmtMoney(v.startingCash)} of play money over {days} day{days === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-outline-variant pt-3">
            <Stat label="Return" value={fmtPct(v.returnPct)} tone={up ? "up" : "down"} />
            <Stat label="Equity" value={fmtMoney(v.equity)} />
          </div>
        </Card>
      </div>

      <Section title="Sandbox" action={<PaperControls />}>
        <Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Cash" value={fmtMoney(v.cash)} sub="unspent play money" />
            <Stat label="Invested" value={fmtMoney(v.invested)} sub={`${v.holdings.length} position(s)`} />
            <Stat
              label="Banked (paper)"
              value={signedMoney(v.realized)}
              tone={v.realized >= 0 ? "up" : "down"}
              sub="closed round trips"
            />
            <Stat
              label="Still open"
              value={signedMoney(v.open)}
              tone={v.open >= 0 ? "up" : "down"}
              sub="mark-to-market"
            />
          </div>
          {marks.length > 1 ? (
            <div className="mt-4">
              <EquityChart points={marks.map((m) => m[1])} height={90} />
              <p className="mt-1 text-[10px] text-on-surface-variant/70">
                Sandbox equity, marked each time you trade or run the engine.
              </p>
            </div>
          ) : null}
        </Card>
      </Section>

      <Section title="Your paper positions">
        <Card>
          {v.holdings.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              Nothing held yet. Open any symbol from{" "}
              <Link href="/markets" className="text-primary hover:underline">
                Live Markets
              </Link>{" "}
              to see its chart and place a paper order, or let the strategy engine pick for you.
            </p>
          ) : (
            <div className="divide-y divide-outline-variant/50">
              {v.holdings.map((h) => (
                <Link
                  key={h.symbol}
                  href={`/markets/${h.symbol}`}
                  className="flex items-center justify-between py-2.5 text-sm transition-colors hover:bg-surface-container-high"
                >
                  <div>
                    <span className="font-semibold text-on-surface">{h.symbol}</span>
                    <span className="ml-2 rounded-xs bg-surface-container-high px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
                      {h.leg}
                    </span>
                    <div className="font-mono text-xs text-on-surface-variant">
                      {fmtQty(h.qty)} @ {h.avgPrice.toFixed(dp(h.leg))} · now{" "}
                      {h.lastPrice.toFixed(dp(h.leg))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-on-surface">{fmtMoney(h.marketValue)}</div>
                    <div
                      className={`font-mono text-xs ${h.potentialEarnings >= 0 ? "text-primary" : "text-error"}`}
                    >
                      {signedMoney(h.potentialEarnings)} ({fmtPct(h.potentialPct)})
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </Section>

      <Section title={`Paper trade log (${trades.length})`}>
        <Card>
          {trades.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              No paper trades yet. Every fill is priced from a real quote, minus the same slippage
              haircut the live simulator applies.
            </p>
          ) : (
            <div className="divide-y divide-outline-variant/50">
              {trades.map((t, i) => (
                <div key={`${t.ts}-${i}`} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-xs px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                        t.side === "BUY" ? "bg-primary/15 text-primary" : "bg-tertiary/15 text-tertiary"
                      }`}
                    >
                      {t.side}
                    </span>
                    <Link href={`/markets/${t.symbol}`} className="font-semibold text-on-surface hover:underline">
                      {t.symbol}
                    </Link>
                    <span className="font-mono text-xs text-on-surface-variant">
                      {fmtQty(t.qty)} @ {t.price.toFixed(dp(t.leg))}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.05em] text-on-surface-variant/70">
                      {t.source === "ENGINE" ? "engine" : "by hand"}
                    </span>
                  </div>
                  <div className="text-right">
                    {t.realized !== null ? (
                      <div
                        className={`font-mono text-xs ${t.realized >= 0 ? "text-primary" : "text-error"}`}
                      >
                        {signedMoney(t.realized)}
                      </div>
                    ) : null}
                    <div className="text-[10px] text-on-surface-variant/70">
                      {timeAgo(new Date(t.ts).toISOString())}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Section>

      <Card className="flex items-start gap-2 text-[11px] leading-relaxed text-on-surface-variant">
        <MSym name="info" className="mt-px text-sm text-tertiary" />
        <span>
          <strong className="text-on-surface">How this sandbox works.</strong> No money is spent and
          no broker is contacted — but nothing about the data is faked: quotes, charts and P&amp;L
          come from the same live feed the owner accounts use, and fills carry a realistic slippage
          cost. &ldquo;Potential earnings&rdquo; is the honest answer to &ldquo;what would this have
          made in real USD?&rdquo; Your sandbox lives in a cookie in this browser, so it survives
          refreshes but not a different device or a cleared cookie jar. The engine button runs the
          same strategies and risk caps as the real system, minus the AI vetting layer.
        </span>
      </Card>
    </>
  );
}
