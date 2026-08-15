import { NextRequest, NextResponse } from "next/server";
import { getHistory, HISTORY_RANGES } from "@/lib/data/live";
import { legForSymbol } from "@/lib/config";

/** Public chart-history endpoint for the live chart (whitelisted symbols only). */
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "SPY").toUpperCase();
  const requested = req.nextUrl.searchParams.get("range") ?? "1D";
  const range = (HISTORY_RANGES as readonly string[]).includes(requested) ? requested : "1D";
  const leg = legForSymbol(symbol);
  if (!leg) return NextResponse.json({ error: "Unknown symbol." }, { status: 400 });

  const history = await getHistory(symbol, leg, range);
  if (!history) return NextResponse.json({ error: "No data available." }, { status: 502 });
  return NextResponse.json(history, { headers: { "cache-control": "public, max-age=15" } });
}
