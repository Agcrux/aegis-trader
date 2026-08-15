import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/data/live";
import { FX_WATCHLIST, STOCK_WATCHLIST } from "@/lib/config";

/** Public chart-history endpoint for the live chart (whitelisted symbols only). */
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "SPY").toUpperCase();
  const range = req.nextUrl.searchParams.get("range") ?? "1D";
  const leg = (FX_WATCHLIST as readonly string[]).includes(symbol)
    ? ("FX" as const)
    : (STOCK_WATCHLIST as readonly string[]).includes(symbol)
      ? ("STOCK" as const)
      : null;
  if (!leg) return NextResponse.json({ error: "Unknown symbol." }, { status: 400 });

  const history = await getHistory(symbol, leg, range);
  if (!history) return NextResponse.json({ error: "No data available." }, { status: 502 });
  return NextResponse.json(history, { headers: { "cache-control": "public, max-age=15" } });
}
