import { NextRequest, NextResponse } from "next/server";
import { requireTester } from "@/lib/auth";
import { legForSymbol } from "@/lib/config";
import { bestPrice, getLiveQuote } from "@/lib/data/live";
import { readSandboxOrFresh, writeSandbox } from "@/lib/paper/cookie";
import { applyOrder, markEquity, valueSandbox } from "@/lib/paper/sandbox";
import { buildSandboxView } from "@/lib/paper/view";
import { priceMap } from "@/lib/paper/prices";

/**
 * A manual paper order from a tester. The price is a real quote fetched here on
 * the server (so the client can't set its own fill), minus the usual slippage
 * haircut. No broker is contacted and no real money exists anywhere in it.
 */
export async function POST(req: NextRequest) {
  try {
    await requireTester();
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

  const symbol = (body?.symbol ?? "").trim().toUpperCase();
  const leg = legForSymbol(symbol);
  if (!leg) return NextResponse.json({ error: "Unknown symbol." }, { status: 400 });
  if (body?.side !== "BUY" && body?.side !== "SELL") {
    return NextResponse.json({ error: "side must be BUY or SELL." }, { status: 400 });
  }

  const quote = await getLiveQuote(symbol, leg);
  const refPrice = quote?.price ?? (await bestPrice(symbol, leg)) ?? 0;
  if (!refPrice) {
    return NextResponse.json(
      { error: `No live price for ${symbol} right now — the feed is unreachable.` },
      { status: 502 }
    );
  }

  const sandbox = await readSandboxOrFresh();
  const result = applyOrder(sandbox, {
    symbol,
    side: body.side,
    qty: typeof body.qty === "number" ? body.qty : undefined,
    notional: typeof body.notional === "number" ? body.notional : undefined,
    all: body.all === true,
    refPrice,
    source: "MANUAL",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const prices = await priceMap(result.sandbox.positions.map((p) => p.symbol));
  const marked = markEquity(result.sandbox, valueSandbox(result.sandbox, prices).equity);
  await writeSandbox(marked);

  const view = await buildSandboxView(marked, [symbol]);
  const t = result.trade;
  return NextResponse.json({
    ok: true,
    trade: t,
    note: `${t.side === "BUY" ? "Bought" : "Sold"} ${t.qty} ${t.symbol} at $${t.price.toFixed(
      leg === "FX" ? 4 : 2
    )} on paper${t.realized !== null ? ` — realized $${t.realized.toFixed(2)}` : ""}.`,
    ...view,
  });
}
