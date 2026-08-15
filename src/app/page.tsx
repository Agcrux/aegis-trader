import Link from "next/link";
import { Card, Dot } from "@/components/ui";
import { getHealth } from "@/lib/store";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [health, user] = await Promise.all([getHealth(), getSession()]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-14">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
        <span className="text-emerald-400">Aegis</span> Trader
      </h1>
      <p className="mt-3 text-base leading-relaxed text-zinc-400">
        A guardrails-first automated trading system for two family accounts. Systematic swing
        strategies scan stocks and forex; an AI layer vets each trade and writes down, in plain
        English, <em>what</em> it did, <em>when</em>, and <em>why</em>. Hard spending caps, a
        drawdown circuit breaker, and a kill switch in each owner&apos;s pocket.
      </p>

      <Card className="mt-6">
        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 sm:grid-cols-3">
          <span className="flex items-center gap-2"><Dot ok={!health.demoMode} /> Database</span>
          <span className="flex items-center gap-2"><Dot ok={health.dataFeed} /> Market data</span>
          <span className="flex items-center gap-2"><Dot ok={health.discordWebhook} /> Discord</span>
          <span className="flex items-center gap-2"><Dot ok={health.aiVet} /> AI vet</span>
          <span className="flex items-center gap-2"><Dot ok={health.alpacaKeys} /> Alpaca paper</span>
          <span className="flex items-center gap-2"><Dot ok={health.oandaKeys} /> OANDA practice</span>
        </div>
      </Card>

      <div className="mt-6 flex gap-3">
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-md bg-emerald-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
          >
            Open dashboard
          </Link>
        ) : (
          <>
            <Link
              href={health.demoMode ? "/dashboard" : "/login"}
              className="rounded-md bg-emerald-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              {health.demoMode ? "Explore the demo" : "Sign in"}
            </Link>
            {!health.demoMode ? (
              <Link
                href="/join"
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Join with invite code
              </Link>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-10 space-y-2 text-xs leading-relaxed text-zinc-600">
        <p>
          <strong className="text-zinc-500">Honesty box.</strong> Nothing here is financial
          advice, and no system — AI included — can guarantee trading profits; most retail
          strategies lose money after costs. Every account starts with a 30-day paper-trading
          month, strategies must beat buy-and-hold in multi-year backtests before mattering, and
          only each account&apos;s owner can move it toward real money.
        </p>
        <p>
          Every trade is journaled with its full reasoning. If the numbers say &quot;just buy an
          index fund,&quot; this system will be the first to tell you.
        </p>
      </div>
    </main>
  );
}
