import { NextRequest, NextResponse } from "next/server";
import { getLiveQuotes } from "@/lib/data/live";
import { FX_WATCHLIST, STOCK_WATCHLIST } from "@/lib/config";

/**
 * Public live-quote endpoint for client widgets (tickers, movers).
 * Only whitelisted symbols are served; upstream fetches are cached ~30s.
 */
export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("symbols") ?? "";
  const allowed = new Map<string, "STOCK" | "FX">();
  for (const s of STOCK_WATCHLIST) allowed.set(s, "STOCK");
  for (const s of FX_WATCHLIST) allowed.set(s, "FX");

  const requested = [
    ...new Set(param.split(",").map((s) => s.trim().toUpperCase())),
  ]
    .filter((s) => allowed.has(s))
    .slice(0, 24);
  if (requested.length === 0) {
    return NextResponse.json({ error: "No valid symbols requested." }, { status: 400 });
  }

  const quotes = await getLiveQuotes(requested.map((symbol) => ({ symbol, leg: allowed.get(symbol)! })));
  return NextResponse.json(
    { quotes: requested.map((s) => quotes.get(s)).filter(Boolean), ts: Date.now() },
    { headers: { "cache-control": "public, max-age=15" } }
  );
}
