import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LiveChart from "@/components/live/LiveChart";
import SymbolTradePanel from "@/components/live/SymbolTradePanel";
import { Card, MSym, Section, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { ALL_SYMBOLS, SYMBOL_NAMES, legForSymbol } from "@/lib/config";
import { getLiveQuote } from "@/lib/data/live";
import { fmtMoney, fmtPct } from "@/lib/format";
import { readSandboxOrFresh } from "@/lib/paper/cookie";
import { buildSandboxView } from "@/lib/paper/view";
import { getAccountTradeState } from "@/lib/account/paperTrade";

export const dynamic = "force-dynamic";

const DETAIL_RANGES = ["1D", "1W", "1M", "6M", "YTD", "1Y", "5Y"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const s = symbol.toUpperCase();
  return { title: `${s} — ${SYMBOL_NAMES[s] ?? "Live chart"} · Aegis Trader` };
}

/**
 * One symbol, its own page: full-height live chart with range switching and a
 * hover crosshair, real quote stats, and the paper-order panel. Reached by
 * clicking any symbol card, mover row or open position.
 */
export default async function SymbolPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();
  const leg = legForSymbol(symbol);
  if (!leg) notFound();

  const [session, quote] = await Promise.all([getSession(), getLiveQuote(symbol, leg)]);
  const role = session?.role ?? null;
  const holding =
    role === "TESTER"
      ? (await buildSandboxView(await readSandboxOrFresh(), [symbol])).valuation.holdings.find(
          (h) => h.symbol === symbol
        )
      : role === "OWNER"
        ? (await getAccountTradeState(session!, symbol))?.holding ?? undefined
        : undefined;

  const digits = leg === "FX" ? 4 : 2;
  const fmtPrice = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: digits });
  const changePct = quote?.changePct ?? 0;
  const others = ALL_SYMBOLS.filter((s) => s !== symbol);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href="/markets"
            className="mb-1 flex items-center gap-1 text-[12px] text-on-surface-variant transition-colors hover:text-primary"
          >
            <MSym name="arrow_back" className="text-sm" /> All symbols
          </Link>
          <h1 className="text-xl font-semibold text-on-surface">
            {symbol}
            <span className="ml-2 text-sm font-normal text-on-surface-variant">
              {SYMBOL_NAMES[symbol] ?? ""}
            </span>
          </h1>
        </div>
        <span className="rounded-xs bg-surface-container-high px-2 py-0.5 font-mono text-[11px] text-on-surface-variant">
          {leg}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <LiveChart symbol={symbol} ranges={DETAIL_RANGES} height={440} />
        </div>
        <div className="space-y-3 lg:col-span-4">
          <Card>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Last" value={quote ? fmtPrice(quote.price) : "—"} />
              <Stat
                label="Change today"
                value={quote ? fmtPct(changePct) : "—"}
                tone={changePct >= 0 ? "up" : "down"}
              />
              <Stat label="Prev close" value={quote ? fmtPrice(quote.prevClose) : "—"} />
              <Stat
                label="Volume"
                value={quote?.volume ? compact(quote.volume) : "—"}
                sub={leg === "FX" ? "spot FX has no central volume" : undefined}
              />
            </div>
            {!quote ? (
              <p className="mt-3 text-[11px] text-on-surface-variant">
                The live feed is unreachable right now. The chart retries on its own.
              </p>
            ) : null}
          </Card>

          {holding ? (
            <Card>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
                Your paper position
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Held" value={String(holding.qty)} sub={`avg ${fmtPrice(holding.avgPrice)}`} />
                <Stat
                  label="Potential earnings"
                  value={`${holding.potentialEarnings >= 0 ? "+" : "−"}${fmtMoney(
                    Math.abs(holding.potentialEarnings)
                  )}`}
                  tone={holding.potentialEarnings >= 0 ? "up" : "down"}
                  sub={fmtPct(holding.potentialPct)}
                />
              </div>
            </Card>
          ) : null}

          <SymbolTradePanel symbol={symbol} role={role} />
        </div>
      </div>

      <Section title="Jump to another symbol">
        <div className="flex flex-wrap gap-1.5">
          {others.map((s) => (
            <Link
              key={s}
              href={`/markets/${s}`}
              className="rounded-xs border border-outline-variant bg-surface px-2 py-1 font-mono text-[12px] text-on-surface-variant transition-colors hover:border-primary/60 hover:text-primary"
            >
              {s}
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}

function compact(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}
