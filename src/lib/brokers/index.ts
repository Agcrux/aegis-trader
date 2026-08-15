import type { Account, Leg, Side } from "../types";
import { env, SLIPPAGE_BPS, FX_SPREAD_BPS } from "../config";

/**
 * Broker adapters. SimBroker fills instantly at the last daily close plus a
 * slippage/spread haircut and persists positions in our own database — it is
 * the keyless paper vehicle for the 30-day proving month.
 *
 * AlpacaBroker (stocks) and OandaBroker (FX) are wired for their PAPER/practice
 * environments and activate only when their keys exist in the environment.
 * LIVE endpoints are intentionally NOT configured in v1 — going live is a
 * later, owner-approved stage after the paper month passes.
 */

export interface FillResult {
  broker: "SIM" | "ALPACA" | "OANDA";
  orderRef: string | null;
  fillPrice: number;
  status: "FILLED" | "SUBMITTED" | "REJECTED";
  note: string;
}

export interface OrderRequest {
  account: Account;
  leg: Leg;
  symbol: string;
  side: Side;
  qty: number;
  refPrice: number;
}

function simFillPrice(req: OrderRequest): number {
  const haircutBps = req.leg === "FX" ? FX_SPREAD_BPS : SLIPPAGE_BPS;
  const sign = req.side === "BUY" ? 1 : -1;
  return req.refPrice * (1 + (sign * haircutBps) / 10000);
}

export async function placeOrder(req: OrderRequest): Promise<FillResult> {
  // LIVE trading is a hard no in v1 regardless of configuration.
  if (req.account.mode === "LIVE") {
    return {
      broker: "SIM",
      orderRef: null,
      fillPrice: 0,
      status: "REJECTED",
      note: "LIVE execution is not enabled in this build. The paper month must pass and a later stage adds live endpoints behind owner approval.",
    };
  }

  if (req.leg === "STOCK" && env.alpacaKeyId() && env.alpacaSecret()) {
    try {
      return await alpacaPaperOrder(req);
    } catch (err) {
      return {
        broker: "SIM",
        orderRef: null,
        fillPrice: simFillPrice(req),
        status: "FILLED",
        note: `Alpaca paper order failed (${(err as Error).message}) — filled on internal simulator instead.`,
      };
    }
  }
  if (req.leg === "FX" && env.oandaToken()) {
    try {
      return await oandaPracticeOrder(req);
    } catch (err) {
      return {
        broker: "SIM",
        orderRef: null,
        fillPrice: simFillPrice(req),
        status: "FILLED",
        note: `OANDA practice order failed (${(err as Error).message}) — filled on internal simulator instead.`,
      };
    }
  }

  return {
    broker: "SIM",
    orderRef: null,
    fillPrice: simFillPrice(req),
    status: "FILLED",
    note: "Internal simulator fill at last close plus a realistic slippage/spread haircut.",
  };
}

/** Alpaca PAPER environment only (paper-api.alpaca.markets). Fractional market order. */
async function alpacaPaperOrder(req: OrderRequest): Promise<FillResult> {
  const res = await fetch("https://paper-api.alpaca.markets/v2/orders", {
    method: "POST",
    headers: {
      "APCA-API-KEY-ID": env.alpacaKeyId(),
      "APCA-API-SECRET-KEY": env.alpacaSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      symbol: req.symbol,
      qty: String(Math.round(req.qty * 1e6) / 1e6),
      side: req.side.toLowerCase(),
      type: "market",
      time_in_force: "day",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Alpaca HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const order = (await res.json()) as { id?: string; filled_avg_price?: string };
  return {
    broker: "ALPACA",
    orderRef: order.id ?? null,
    fillPrice: Number(order.filled_avg_price) || simFillPrice(req),
    status: "SUBMITTED",
    note: "Submitted to Alpaca's paper environment (fills settle asynchronously; simulator price used for bookkeeping until reconciled).",
  };
}

/** OANDA practice environment only (api-fxpractice.oanda.com). */
async function oandaPracticeOrder(req: OrderRequest): Promise<FillResult> {
  const instrument = `${req.symbol.slice(0, 3)}_${req.symbol.slice(3)}`;
  const units = Math.round(req.qty) * (req.side === "BUY" ? 1 : -1);
  if (units === 0) throw new Error("FX order rounds to zero units");
  const accountsRes = await fetch("https://api-fxpractice.oanda.com/v3/accounts", {
    headers: { authorization: `Bearer ${env.oandaToken()}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!accountsRes.ok) throw new Error(`OANDA HTTP ${accountsRes.status}`);
  const accounts = (await accountsRes.json()) as { accounts?: Array<{ id: string }> };
  const oandaAccount = accounts.accounts?.[0]?.id;
  if (!oandaAccount) throw new Error("No OANDA practice account found for this token");
  const res = await fetch(
    `https://api-fxpractice.oanda.com/v3/accounts/${oandaAccount}/orders`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.oandaToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        order: { type: "MARKET", instrument, units: String(units), timeInForce: "FOK" },
      }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error(`OANDA HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as {
    orderFillTransaction?: { id?: string; price?: string };
  };
  return {
    broker: "OANDA",
    orderRef: body.orderFillTransaction?.id ?? null,
    fillPrice: Number(body.orderFillTransaction?.price) || simFillPrice(req),
    status: "FILLED",
    note: "Filled on OANDA's practice environment.",
  };
}
