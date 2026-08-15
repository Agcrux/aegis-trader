import { Card, KindBadge, ModeBadge, Section, Stat } from "@/components/ui";
import { ModeControls, RunNowButton } from "@/components/controls";
import EquityChart from "@/components/EquityChart";
import { getAccounts, getEquitySeries, getJournal, getPositions } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { isDemoMode, OPTIONS_UNLOCK_EQUITY, FUTURES_UNLOCK_EQUITY, PAPER_GATE_DAYS } from "@/lib/config";
import { fmtMoney, fmtPct, fmtQty, timeAgo } from "@/lib/format";
import { lastPrice } from "@/lib/data/market";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const demo = isDemoMode();
  const [accounts, positions, journal, user] = await Promise.all([
    getAccounts(),
    getPositions(),
    getJournal(8),
    getSession(),
  ]);

  // Enrich positions with a best-effort last price (cheap: few symbols, cached).
  const enriched = await Promise.all(
    positions.map(async (p) => {
      if (p.lastPrice) return p;
      try {
        const lp = await lastPrice(p.symbol, p.leg === "FX" ? "FX" : "STOCK");
        return {
          ...p,
          lastPrice: lp,
          marketValue: p.qty * lp,
          unrealizedPnl: (lp - p.avgPrice) * p.qty,
        };
      } catch {
        return { ...p, lastPrice: p.avgPrice, marketValue: p.qty * p.avgPrice, unrealizedPnl: 0 };
      }
    })
  );

  return (
    <>
      <Section title="Accounts" action={<RunNowButton disabled={demo} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          {await Promise.all(
            accounts.map(async (a) => {
              const series = await getEquitySeries(a.id);
              const equity = series.length
                ? series[series.length - 1].equity
                : a.simCash;
              const ret =
                a.startingEquity > 0
                  ? ((equity - a.startingEquity) / a.startingEquity) * 100
                  : 0;
              const paperDays = a.paperStartedAt
                ? Math.floor((Date.now() - new Date(a.paperStartedAt).getTime()) / 86400000)
                : 0;
              const gatePct = Math.min(100, (paperDays / PAPER_GATE_DAYS) * 100);
              return (
                <Card key={a.id}>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-zinc-100">{a.label}</div>
                      <div className="text-xs text-zinc-500">{a.ownerName}</div>
                    </div>
                    <ModeBadge mode={a.mode} frozen={a.frozen} />
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <Stat label="Equity" value={fmtMoney(equity)} />
                    <Stat
                      label="Since start"
                      value={fmtPct(ret)}
                      tone={ret >= 0 ? "up" : "down"}
                    />
                  </div>
                  <EquityChart points={series.map((s) => s.equity)} height={70} />
                  {a.frozen ? (
                    <p className="mt-2 rounded-md bg-rose-500/10 p-2 text-xs text-rose-300">
                      {a.frozenReason}
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
                      <span>Paper month: day {Math.min(paperDays, PAPER_GATE_DAYS)}/{PAPER_GATE_DAYS}</span>
                      <span>
                        Options {equity >= OPTIONS_UNLOCK_EQUITY ? "unlocked" : `locked · $${OPTIONS_UNLOCK_EQUITY.toLocaleString()}`} · Futures{" "}
                        {equity >= FUTURES_UNLOCK_EQUITY ? "unlocked" : `locked · $${FUTURES_UNLOCK_EQUITY.toLocaleString()}`}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-sky-500/70"
                        style={{ width: `${gatePct}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 border-t border-zinc-800 pt-3">
                    <ModeControls
                      accountId={a.id}
                      label={a.label}
                      mode={a.mode}
                      frozen={a.frozen}
                      isOwner={demo ? false : user?.id === a.ownerUserId}
                      demo={demo}
                    />
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </Section>

      <Section title="Open positions">
        <Card>
          {enriched.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No open positions. For a swing system, flat is a position too — the journal explains
              each pass.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {enriched.map((p) => {
                const acct = accounts.find((a) => a.id === p.accountId);
                const pnl = p.unrealizedPnl ?? 0;
                return (
                  <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <span className="font-semibold text-zinc-100">{p.symbol}</span>
                      <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {p.leg}
                      </span>
                      <div className="text-xs text-zinc-500">
                        {acct?.label} · {fmtQty(p.qty)} @ {p.avgPrice.toFixed(p.leg === "FX" ? 4 : 2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-zinc-200">{fmtMoney(p.marketValue ?? 0)}</div>
                      <div className={`text-xs ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {pnl >= 0 ? "+" : ""}
                        {fmtMoney(pnl).replace("$-", "-$")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </Section>

      <Section
        title="Latest journal"
        action={
          <Link href="/journal" className="text-xs text-emerald-400 hover:underline">
            See all →
          </Link>
        }
      >
        <div className="space-y-2">
          {journal.map((j) => (
            <Card key={j.id} className="py-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                <KindBadge kind={j.kind} />
                <span>{timeAgo(j.ts)}</span>
                {j.accountLabel ? <span>· {j.accountLabel}</span> : null}
              </div>
              <div className="text-sm font-medium text-zinc-100">{j.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">{j.why}</p>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
