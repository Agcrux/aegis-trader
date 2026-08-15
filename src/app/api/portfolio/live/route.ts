import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getAccounts, getPositions, getTrades } from "@/lib/store";
import { getLiveQuotes } from "@/lib/data/live";
import { isSetupIncomplete } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Live portfolio snapshot: equity and UNREALIZED P&L recomputed from live
 * quotes on every request, so the dashboard's earnings number moves with the
 * market instead of being a frozen figure. Owner session required.
 */
export interface LivePortfolio {
  totalEquity: number;
  totalOpenPnl: number;
  totalReturnPct: number;
  winRatePct: number | null;
  openPositions: number;
  accounts: Array<{ id: string; label: string; equity: number; openPnl: number; returnPct: number }>;
  ts: number;
}

export async function GET() {
  try {
    await requireSession();
  } catch (res) {
    return res as Response;
  }
  if (isSetupIncomplete()) {
    return NextResponse.json({
      totalEquity: 0,
      totalOpenPnl: 0,
      totalReturnPct: 0,
      winRatePct: null,
      openPositions: 0,
      accounts: [],
      ts: Date.now(),
    } satisfies LivePortfolio);
  }

  const [accounts, positions, trades] = await Promise.all([
    getAccounts(),
    getPositions(),
    getTrades(300),
  ]);

  const symbols = [
    ...new Set(positions.filter((p) => p.leg === "STOCK" || p.leg === "FX").map((p) => p.symbol)),
  ];
  const quotes = await getLiveQuotes(
    symbols.map((symbol) => {
      const leg = positions.find((p) => p.symbol === symbol)?.leg;
      return { symbol, leg: leg === "FX" ? "FX" : "STOCK" };
    })
  );
  const priceOf = (symbol: string, avg: number) => quotes.get(symbol)?.price ?? avg;

  const acctOut = accounts.map((a) => {
    const held = positions.filter((p) => p.accountId === a.id);
    let mv = 0;
    let openPnl = 0;
    for (const p of held) {
      const price = priceOf(p.symbol, p.avgPrice);
      mv += p.qty * price;
      openPnl += (price - p.avgPrice) * p.qty;
    }
    const equity = a.simCash + mv;
    const returnPct = a.startingEquity > 0 ? ((equity - a.startingEquity) / a.startingEquity) * 100 : 0;
    return { id: a.id, label: a.label, equity, openPnl, returnPct };
  });

  const totalEquity = acctOut.reduce((s, a) => s + a.equity, 0);
  const totalOpenPnl = acctOut.reduce((s, a) => s + a.openPnl, 0);
  const totalStart = accounts.reduce((s, a) => s + a.startingEquity, 0);
  const totalReturnPct = totalStart > 0 ? ((totalEquity - totalStart) / totalStart) * 100 : 0;
  const closed = trades.filter((t) => t.realizedPnl !== null);
  const wins = closed.filter((t) => (t.realizedPnl ?? 0) > 0).length;
  const winRatePct = closed.length ? (wins / closed.length) * 100 : null;

  return NextResponse.json(
    {
      totalEquity,
      totalOpenPnl,
      totalReturnPct,
      winRatePct,
      openPositions: positions.length,
      accounts: acctOut,
      ts: Date.now(),
    } satisfies LivePortfolio,
    { headers: { "cache-control": "no-store" } }
  );
}
