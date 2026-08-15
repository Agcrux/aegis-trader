import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { isSetupIncomplete } from "@/lib/config";
import { getAccountTradeState, placeManualOrder } from "@/lib/account/paperTrade";

export const dynamic = "force-dynamic";

/**
 * Owner manual paper trading against their own database account.
 *  GET  ?symbol=SPY  → current cash + holding for that symbol
 *  POST { symbol, side, qty|notional|all } → places a paper order
 * Paper only: no broker, no real money. Every fill is journaled as manual.
 */

export async function GET(req: NextRequest) {
  if (isSetupIncomplete()) {
    return NextResponse.json({ error: "Connect a database first." }, { status: 403 });
  }
  let user;
  try {
    user = await requireOwner();
  } catch (res) {
    return res as Response;
  }
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "SPY").toUpperCase();
  const state = await getAccountTradeState(user, symbol);
  if (!state) return NextResponse.json({ error: "No owner account found." }, { status: 404 });
  return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (isSetupIncomplete()) {
    return NextResponse.json({ error: "Connect a database first." }, { status: 403 });
  }
  let user;
  try {
    user = await requireOwner();
  } catch (res) {
    return res as Response;
  }
  const body = (await req.json().catch(() => null)) as {
    symbol?: string;
    side?: "BUY" | "SELL";
    qty?: number;
    notional?: number;
    all?: boolean;
  } | null;
  if (!body?.symbol || !body.side) {
    return NextResponse.json({ error: "symbol and side are required." }, { status: 400 });
  }
  const result = await placeManualOrder(user, {
    symbol: body.symbol,
    side: body.side,
    qty: typeof body.qty === "number" ? body.qty : undefined,
    notional: typeof body.notional === "number" ? body.notional : undefined,
    all: body.all === true,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
