import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import EquityChart from "@/components/EquityChart";
import { Card, ModeBadge, MSym, Section, Stat } from "@/components/ui";
import { getAccounts, getEquitySeries, getPositions, getTradesByAccount } from "@/lib/store";
import { bestPrice } from "@/lib/data/live";
import { fmtMoney, fmtPct, fmtQty, timeAgo } from "@/lib/format";
import type { Position, Trade } from "@/lib/types";

export const dynamic = "force-dynamic";

function signedMoney(n: number): string {
  return `${n >= 0 ? "+" : "−"}${fmtMoney(Math.abs(n))}`;
}

function dp(leg: string): number {
  return leg === "FX" ? 4 : 2;
}

function tradeSource(t: Trade): string {
  if (t.strategy) return "engine";
  if (t.orderRef?.startsWith("manual")) return "by hand";
  return t.broker === "SIM" ? "sim" : t.broker.toLowerCase();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const accounts = await getAccounts();
  const account = accounts.find((a) => a.id === id);
  return { title: account ? `${account.label} · Trades · Aegis Trader` : "Account · Aegis Trader" };
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [accounts, allPositions, trades] = await Promise.all([
    getAccounts(),
    getPositions(),
    getTradesByAccount(id),
  ]);

  const account = accounts.find((a) => a.id === id);
  if (!account) notFound();

  const positions = allPositions.filter((p) => p.accountId === id);
  const enriched = await Promise.all(
    positions.map(async (p): Promise<Position> => {
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

  const invested = enriched.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const equity = Math.round((account.simCash + invested) * 100) / 100;
  const ret =
    account.startingEquity > 0 ? ((equity - account.startingEquity) / account.startingEquity) * 100 : 0;

  const closed = trades.filter((t) => t.realizedPnl !== null);
  const realizedTotal = closed.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const openPnl = enriched.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
  const wins = closed.filter((t) => (t.realizedPnl ?? 0) > 0).length;
  const winRatePct = closed.length ? (wins / closed.length) * 100 : null;

  const series = await getEquitySeries(id);
  const chartPoints = [...series.map((s) => s.equity), equity];

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/dashboard"
          className="mb-1 flex items-center gap-1 text-[12px] text-on-surface-variant transition-colors hover:text-primary"
        >
          <MSym name="arrow_back" className="text-sm" /> Overview
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-on-surface">{account.label}</h1>
            <p className="text-sm text-on-surface-variant">{account.ownerName}</p>
          </div>
          <ModeBadge mode={account.mode} frozen={account.frozen} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Equity" value={fmtMoney(equity)} />
        <Stat label="Since start" value={fmtPct(ret)} tone={ret >= 0 ? "up" : "down"} />
        <Stat
          label="Realized P/L"
          value={signedMoney(realizedTotal)}
          tone={realizedTotal >= 0 ? "up" : "down"}
        />
        <Stat
          label="Open P/L"
          value={signedMoney(openPnl)}
          tone={openPnl >= 0 ? "up" : "down"}
          sub={winRatePct !== null ? `${winRatePct.toFixed(0)}% win rate` : undefined}
        />
      </div>

      {enriched.length > 0 ? (
        <Section title={`Open positions (${enriched.length})`}>
          <Card>
            <div className="divide-y divide-outline-variant/50">
              {enriched.map((p) => {
                const pnl = p.unrealizedPnl ?? 0;
                return (
                  <Link
                    key={p.id}
                    href={`/markets/${p.symbol}`}
                    className="flex items-center justify-between py-2.5 text-sm transition-colors hover:bg-surface-container-high"
                  >
                    <div>
                      <span className="font-semibold text-on-surface">{p.symbol}</span>
                      <span className="ml-2 rounded-xs bg-surface-container-high px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
                        {p.leg}
                      </span>
                      <div className="text-xs text-on-surface-variant">
                        {fmtQty(p.qty)} @ {p.avgPrice.toFixed(dp(p.leg))}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-on-surface">{fmtMoney(p.marketValue ?? 0)}</div>
                      <div className={`font-mono text-xs ${pnl >= 0 ? "text-primary" : "text-error"}`}>
                        {signedMoney(pnl)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </Section>
      ) : null}

      <Section title={`Trade log (${trades.length})`}>
        <Card>
          {trades.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              No trades yet for this account. Trades appear here when the engine runs or when the
              owner places manual paper orders.
            </p>
          ) : (
            <div className="divide-y divide-outline-variant/50">
              {trades.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-xs px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                        t.side === "BUY" ? "bg-primary/15 text-primary" : "bg-tertiary/15 text-tertiary"
                      }`}
                    >
                      {t.side}
                    </span>
                    <Link
                      href={`/markets/${t.symbol}`}
                      className="font-semibold text-on-surface hover:underline"
                    >
                      {t.symbol}
                    </Link>
                    <span className="font-mono text-xs text-on-surface-variant">
                      {fmtQty(t.qty)} @ {t.price.toFixed(dp(t.leg))}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.05em] text-on-surface-variant/70">
                      {tradeSource(t)}
                    </span>
                  </div>
                  <div className="text-right">
                    {t.realizedPnl !== null ? (
                      <div
                        className={`font-mono text-xs ${t.realizedPnl >= 0 ? "text-primary" : "text-error"}`}
                      >
                        {signedMoney(t.realizedPnl)}
                      </div>
                    ) : (
                      <div className="font-mono text-xs text-on-surface-variant/70">
                        {fmtMoney(t.notional)}
                      </div>
                    )}
                    <div className="text-[10px] text-on-surface-variant/70">{timeAgo(t.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Section>

      {chartPoints.length > 1 ? (
        <Section title="Equity history">
          <Card>
            <EquityChart points={chartPoints} height={120} />
          </Card>
        </Section>
      ) : null}
    </div>
  );
}
