import { Card, Section, Stat } from "@/components/ui";
import { BacktestButton } from "@/components/controls";
import OwnerOnlyNotice from "@/components/paper/OwnerOnlyNotice";
import { getBacktests } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { isSetupIncomplete } from "@/lib/config";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const STRATEGY_NAMES: Record<string, string> = {
  trend_momentum: "Trend momentum rotation",
  rsi2_meanrev: "RSI(2) dip-buying",
  fx_trend: "FX trend following",
};

const STRATEGY_EXPLAINERS: Record<string, string> = {
  trend_momentum:
    "Holds the 3 strongest uptrends on the watchlist, measured by 3-month gain, with trend filters. Rotates out when trends break.",
  rsi2_meanrev:
    "Buys broad ETFs on sharp 1-2 day dips inside long-term uptrends, sells the bounce within days.",
  fx_trend:
    "Rides major currency-pair uptrends defined by the 20-day average being above the 50-day; exits on the cross-back.",
};

export default async function LabPage() {
  const session = await getSession();
  if (session?.role === "TESTER") return <OwnerOnlyNotice surface="Strategy lab" />;

  const incomplete = isSetupIncomplete();
  const backtests = await getBacktests();

  return (
    <Section title="Strategy lab" action={<BacktestButton demo={incomplete} />}>
      <p className="mb-4 text-sm leading-relaxed text-on-surface-variant">
        The gate from the project vision: a strategy must survive ~5 years of real history —
        including crash periods — and beat just buying and holding SPY, net of realistic costs,
        before it deserves real money. Backtests flatter; treat a pass as permission to keep
        proving on paper, not as a promise. All backtests run on live historical data.
        {incomplete ? " Connect a database to run and store backtests." : ""}
      </p>
      <div className="space-y-4">
        {backtests.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500">
              No backtests stored yet — press &quot;Run backtests&quot; to test all three
              strategies against ~5 years of daily history (takes ~30 seconds).
            </p>
          </Card>
        ) : (
          backtests.map((bt) => (
            <Card key={bt.id}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-zinc-100">
                    {STRATEGY_NAMES[bt.strategy] ?? bt.strategy}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {bt.market} · {bt.years.toFixed(1)} years · run {fmtDateTime(bt.ts)}
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    bt.passed
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-rose-500/15 text-rose-400"
                  }`}
                >
                  {bt.passed ? "PASSED GATE" : "FAILED GATE"}
                </span>
              </div>
              <p className="mb-3 text-xs text-zinc-500">
                {STRATEGY_EXPLAINERS[bt.strategy] ?? ""}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Strategy return"
                  value={`${bt.result.totalReturnPct >= 0 ? "+" : ""}${bt.result.totalReturnPct.toFixed(1)}%`}
                  tone={bt.result.totalReturnPct >= 0 ? "up" : "down"}
                />
                <Stat
                  label="Buy-and-hold SPY"
                  value={`${bt.result.benchmarkReturnPct >= 0 ? "+" : ""}${bt.result.benchmarkReturnPct.toFixed(1)}%`}
                />
                <Stat label="Max drawdown" value={`-${bt.result.maxDrawdownPct.toFixed(1)}%`} />
                <Stat
                  label="Trades"
                  value={String(bt.result.trades)}
                  sub={`${bt.result.winRatePct.toFixed(0)}% winners`}
                />
              </div>
              <p className="mt-3 text-[11px] text-zinc-600">
                Params: {JSON.stringify(bt.params)} · Costs modeled: {`$${bt.result.feesPaid.toFixed(2)}`} slippage/spread on a $1,000 test pot
              </p>
            </Card>
          ))
        )}
      </div>
    </Section>
  );
}
