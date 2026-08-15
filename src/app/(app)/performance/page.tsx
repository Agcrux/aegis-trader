import { Card, Section, Stat } from "@/components/ui";
import EquityChart from "@/components/EquityChart";
import OwnerOnlyNotice from "@/components/paper/OwnerOnlyNotice";
import { getSession } from "@/lib/auth";
import { getAccounts, getEquitySeries, getTrades } from "@/lib/store";
import { fetchDailyBars } from "@/lib/data/market";
import { BENCHMARK } from "@/lib/config";
import { fmtMoney, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const session = await getSession();
  if (session?.role === "TESTER") return <OwnerOnlyNotice surface="Analytics" />;

  const [accounts, trades] = await Promise.all([getAccounts(), getTrades(200)]);

  return (
    <>
      {await Promise.all(
        accounts.map(async (a) => {
          const series = await getEquitySeries(a.id);
          const points = series.map((s) => s.equity);
          const equity = points.length ? points[points.length - 1] : a.simCash;
          const ret =
            a.startingEquity > 0 ? ((equity - a.startingEquity) / a.startingEquity) * 100 : 0;

          // Normalized benchmark: what the same start money did in SPY over the same window.
          let benchmark: number[] | undefined;
          try {
            if (series.length > 1) {
              const bars = await fetchDailyBars(BENCHMARK, "STOCK", 400);
              const startDate = series[0].ts.slice(0, 10);
              const window = bars.filter((b) => b.date >= startDate);
              if (window.length > 1) {
                const scale = a.startingEquity / window[0].close;
                benchmark = resample(window.map((b) => b.close * scale), points.length);
              }
            }
          } catch {
            benchmark = undefined;
          }

          let peak = -Infinity;
          let maxDd = 0;
          for (const v of points) {
            peak = Math.max(peak, v);
            maxDd = Math.max(maxDd, peak > 0 ? ((peak - v) / peak) * 100 : 0);
          }
          const acctTrades = trades.filter((t) => t.accountId === a.id);
          const closed = acctTrades.filter((t) => t.realizedPnl !== null);
          const wins = closed.filter((t) => (t.realizedPnl ?? 0) > 0).length;

          return (
            <Section key={a.id} title={`${a.label} — vs. doing nothing (${BENCHMARK})`}>
              <Card>
                <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Equity" value={fmtMoney(equity)} />
                  <Stat label="Return" value={fmtPct(ret)} tone={ret >= 0 ? "up" : "down"} />
                  <Stat label="Max drawdown" value={fmtPct(-maxDd, false)} tone={maxDd > 10 ? "down" : "neutral"} />
                  <Stat
                    label="Closed trades"
                    value={`${closed.length}`}
                    sub={closed.length ? `${Math.round((wins / closed.length) * 100)}% winners` : "—"}
                  />
                </div>
                <EquityChart points={points} benchmark={benchmark} height={170} />
                <p className="mt-2 text-[11px] text-zinc-600">
                  Solid line: this account. Dashed: the same starting money parked in {BENCHMARK}.
                  If the dashed line wins over months, that is real information — the honest
                  benchmark this system must beat to be worth running.
                </p>
              </Card>
            </Section>
          );
        })
      )}
    </>
  );
}

function resample(series: number[], targetLen: number): number[] {
  if (series.length === 0 || targetLen < 2) return series;
  const out: number[] = [];
  for (let i = 0; i < targetLen; i++) {
    const idx = Math.min(
      series.length - 1,
      Math.round((i / (targetLen - 1)) * (series.length - 1))
    );
    out.push(series[idx]);
  }
  return out;
}
