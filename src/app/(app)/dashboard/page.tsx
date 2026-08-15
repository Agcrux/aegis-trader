import { Card, KindBadge, ModeBadge, Section, Stat } from "@/components/ui";
import { ModeControls, RunNowButton } from "@/components/controls";
import EquityChart from "@/components/EquityChart";
import LiveTicker from "@/components/live/LiveTicker";
import LiveAnalytics from "@/components/live/LiveAnalytics";
import { getAccounts, getEquitySeries, getJournal, getPositions, getTrades } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { isSetupIncomplete, OPTIONS_UNLOCK_EQUITY, FUTURES_UNLOCK_EQUITY, PAPER_GATE_DAYS } from "@/lib/config";
import { fmtMoney, fmtPct, fmtQty, timeAgo } from "@/lib/format";
import { bestPrice } from "@/lib/data/live";
import { readSandboxOrFresh } from "@/lib/paper/cookie";
import { buildSandboxView } from "@/lib/paper/view";
import TesterOverview from "@/components/paper/TesterOverview";
import Link from "next/link";

export const dynamic = "force-dynamic";

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default async function DashboardPage() {
  const session = await getSession();

  // Testers see their own play-money sandbox, never the real accounts.
  if (session?.role === "TESTER") {
    const view = await buildSandboxView(await readSandboxOrFresh());
    return (
      <>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold text-on-surface">Tester sandbox</h1>
          <p className="font-mono text-[12px] text-on-surface-variant">
            paper trading · real prices · no real money
          </p>
        </div>
        <TesterOverview view={view} />
      </>
    );
  }

  const incomplete = isSetupIncomplete();
  const user = session;
  const [accounts, positions, journal, trades] = await Promise.all([
    getAccounts(),
    getPositions(),
    getJournal(8),
    getTrades(200),
  ]);

  // Enrich positions with a LIVE price (real-time quote, daily close fallback).
  const enriched = await Promise.all(
    positions.map(async (p) => {
      try {
        const lp = (await bestPrice(p.symbol, p.leg === "FX" ? "FX" : "STOCK")) ?? p.avgPrice;
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

  // Real portfolio analytics (no simulation) for the live widget.
  const openPnl = enriched.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
  const closed = trades.filter((t) => t.realizedPnl !== null);
  const wins = closed.filter((t) => (t.realizedPnl ?? 0) > 0).length;
  const winRatePct = closed.length ? (wins / closed.length) * 100 : null;
  const totalStart = accounts.reduce((s, a) => s + a.startingEquity, 0);
  const totalEquity =
    accounts.reduce((s, a) => s + a.simCash, 0) +
    enriched.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const totalReturnPct = totalStart > 0 ? ((totalEquity - totalStart) / totalStart) * 100 : 0;

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveTicker />
        </div>
        <LiveAnalytics
          dayPnl={openPnl}
          totalEquity={totalEquity}
          totalReturnPct={totalReturnPct}
          winRatePct={winRatePct}
          openPositions={enriched.length}
        />
      </div>

      <Section title="Accounts" action={<RunNowButton disabled={incomplete} />}>
        {accounts.length === 0 ? (
          <Card>
            <p className="text-sm text-on-surface-variant">
              {incomplete
                ? "No database connected yet, so there are no accounts. Market data above is live. Connect a Postgres database (see docs/SETUP.md) to bring accounts and the engine online."
                : "No owner accounts yet. Use the invite code on the Join page to claim the two owner seats — each starts a fresh $25 paper account."}
            </p>
          </Card>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {await Promise.all(
            accounts.map(async (a) => {
              const series = await getEquitySeries(a.id);
              // Live equity = current paper cash + live market value of this
              // account's holdings. Never trust a stale engine snapshot here —
              // it lags manual funding and hand trades (that was the $25 bug).
              const acctInvested = enriched
                .filter((p) => p.accountId === a.id)
                .reduce((s, p) => s + (p.marketValue ?? 0), 0);
              const equity = Math.round((a.simCash + acctInvested) * 100) / 100;
              const ret =
                a.startingEquity > 0
                  ? ((equity - a.startingEquity) / a.startingEquity) * 100
                  : 0;
              const chartPoints = [...series.map((s) => s.equity), equity];
              const paperDays = daysSince(a.paperStartedAt);
              const gatePct = Math.min(100, (paperDays / PAPER_GATE_DAYS) * 100);
              return (
                <Card key={a.id}>
                  <Link
                    href={`/accounts/${a.id}`}
                    className="group block rounded-sm transition-colors hover:bg-surface-container-high/40 -m-2 p-2"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-zinc-100 group-hover:text-primary">
                          {a.label}
                        </div>
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
                    <EquityChart points={chartPoints} height={70} />
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
                    <p className="mt-2 text-[11px] text-on-surface-variant group-hover:text-primary">
                      View trades &amp; P/L →
                    </p>
                  </Link>
                  <div className="mt-3 border-t border-zinc-800 pt-3">
                    <ModeControls
                      accountId={a.id}
                      label={a.label}
                      mode={a.mode}
                      frozen={a.frozen}
                      isOwner={incomplete ? false : user?.id === a.ownerUserId}
                      demo={incomplete}
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
                  <Link
                    key={p.id}
                    href={`/markets/${p.symbol}`}
                    className="flex items-center justify-between py-2.5 text-sm transition-colors hover:bg-surface-container-high"
                  >
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
                  </Link>
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
