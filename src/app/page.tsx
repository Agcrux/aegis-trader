import Link from "next/link";
import { Card, Dot, MSym } from "@/components/ui";
import { getHealth } from "@/lib/store";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [health, user] = await Promise.all([getHealth(), getSession()]);
  const ready = !health.demoMode;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-14">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant bg-surface-container text-primary">
          <MSym name="shield" fill />
        </span>
        <span className="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant">
          ProTrader-grade terminal
        </span>
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-on-surface">
        <span className="text-primary">Aegis</span> Trader
      </h1>
      <p className="mt-3 text-base leading-relaxed text-on-surface-variant">
        A guardrails-first automated trading terminal for two family accounts. Systematic swing
        strategies scan stocks and forex on <strong className="text-on-surface">live, real-time
        data</strong>; an AI layer vets each trade and writes down, in plain English,{" "}
        <em>what</em> it did, <em>when</em>, and <em>why</em>. Hard spending caps, a drawdown
        circuit breaker, and a kill switch in each owner&apos;s pocket.
      </p>

      <Card className="mt-6">
        <div className="grid grid-cols-2 gap-2 text-xs text-on-surface-variant sm:grid-cols-3">
          <span className="flex items-center gap-2"><Dot ok={health.db} /> Database</span>
          <span className="flex items-center gap-2"><Dot ok={health.dataFeed} /> Live data feed</span>
          <span className="flex items-center gap-2"><Dot ok={health.discordWebhook} /> Discord</span>
          <span className="flex items-center gap-2"><Dot ok={health.aiVet} /> AI vet</span>
          <span className="flex items-center gap-2"><Dot ok={health.alpacaKeys} /> Alpaca paper</span>
          <span className="flex items-center gap-2"><Dot ok={health.oandaKeys} /> OANDA practice</span>
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/markets"
          className="rounded-sm bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-container"
        >
          Open live terminal
        </Link>
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-sm border border-outline-variant px-4 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container-high"
          >
            My dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-sm border border-outline-variant px-4 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container-high"
            >
              Sign in
            </Link>
            <Link
              href="/join"
              className="rounded-sm border border-outline-variant px-4 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container-high"
            >
              Join with invite code
            </Link>
          </>
        )}
      </div>

      {!ready ? (
        <p className="mt-4 text-xs text-[#ffde9c]">
          Setup note: no database is connected yet, so accounts and the engine are offline. The
          live market terminal works right now — connect Postgres (docs/SETUP.md) to enable trading.
        </p>
      ) : null}

      <div className="mt-10 space-y-2 text-xs leading-relaxed text-on-surface-variant/80">
        <p>
          <strong className="text-on-surface-variant">Honesty box.</strong> Nothing here is
          financial advice, and no system — AI included — can guarantee trading profits; most
          retail strategies lose money after costs. Every account starts with a 30-day
          paper-trading month on live data, strategies must beat buy-and-hold in multi-year
          backtests before mattering, and only each account&apos;s owner can move it toward real
          money.
        </p>
        <p>
          Every trade is journaled with its full reasoning. If the numbers say &quot;just buy an
          index fund,&quot; this system will be the first to tell you.
        </p>
      </div>
    </main>
  );
}
