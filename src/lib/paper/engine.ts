import { FX_WATCHLIST, STOCK_WATCHLIST } from "../config";
import { fetchMany } from "../data/market";
import { newsOutlets, relatedSymbols } from "../data/news";
import { allSignals } from "../strategy/strategies";
import { evaluateEntry, evaluateExit, type RiskContext } from "../risk";
import { priceMap } from "./prices";
import {
  applyOrder,
  markEquity,
  toAccount,
  toPositions,
  valueSandbox,
  type PaperSandbox,
  type PaperTrade,
} from "./sandbox";

/**
 * One engine cycle against a tester sandbox. Same strategies and same risk
 * chokepoint as the real engine, but nothing touches the database and no
 * broker is called — fills land on the sandbox cookie at live prices.
 *
 * The AI vetting layer is deliberately skipped: it costs the owner's API budget
 * and its verdicts belong in the audited journal, not in throwaway play money.
 */

export interface PaperEngineReport {
  /** Fills from this run only; the full log lives in the sandbox view. */
  placed: PaperTrade[];
  /** Plain-English notes, including the reasons nothing was traded. */
  notes: string[];
  summary: string;
}

export async function runSandboxEngine(
  sb: PaperSandbox,
  ownerUserId: string
): Promise<{ sandbox: PaperSandbox; report: PaperEngineReport }> {
  const notes: string[] = [];
  const placed: PaperTrade[] = [];

  const [stocks, fx] = await Promise.all([
    fetchMany(STOCK_WATCHLIST, "STOCK", 320),
    fetchMany(FX_WATCHLIST, "FX", 320),
  ]);
  if (stocks.failures.length || fx.failures.length) {
    notes.push(
      `${stocks.failures.length + fx.failures.length} symbol(s) had no usable history this run and were skipped.`
    );
  }

  const signals = allSignals(stocks.bars, fx.bars, toPositions(sb));
  const exits = signals.filter((s) => s.action === "EXIT");
  const entries = signals.filter((s) => s.action === "ENTER");
  if (signals.length === 0) {
    notes.push("No strategy fired: the trend, dip-buying and FX rules all saw nothing worth doing.");
  }

  const barClose = (leg: string, symbol: string): number | null => {
    const bars = leg === "FX" ? fx.bars.get(symbol) : stocks.bars.get(symbol);
    return bars?.length ? bars[bars.length - 1].close : null;
  };

  let sandbox = sb;
  const quoteSymbols = [
    ...new Set([...sandbox.positions.map((p) => p.symbol), ...signals.map((s) => s.symbol)]),
  ];
  const prices = await priceMap(quoteSymbols);
  const priceOf = (leg: string, symbol: string): number | null =>
    prices.get(symbol) ?? barClose(leg, symbol);

  const value = () => valueSandbox(sandbox, prices);

  for (const s of exits) {
    const price = priceOf(s.leg, s.symbol);
    if (price === null) continue;
    const v = value();
    const ctx: RiskContext = {
      account: toAccount(sandbox, v.equity, ownerUserId),
      equity: v.equity,
      cash: sandbox.cash,
      openPositions: toPositions(sandbox),
      tradesToday: v.tradesToday,
      dayPnlPct: v.dayPnlPct,
      price,
    };
    if (!evaluateExit(ctx, s).allowed) continue;
    const result = applyOrder(sandbox, {
      symbol: s.symbol,
      side: "SELL",
      all: true,
      refPrice: price,
      source: "ENGINE",
    });
    if (!result.ok) {
      notes.push(`Could not close ${s.symbol}: ${result.error}`);
      continue;
    }
    sandbox = result.sandbox;
    placed.push(result.trade);
    notes.push(`SOLD ${s.symbol} — ${s.reason}`);
  }

  for (const s of entries) {
    const price = priceOf(s.leg, s.symbol);
    if (price === null) continue;
    const v = value();
    const ctx: RiskContext = {
      account: toAccount(sandbox, v.equity, ownerUserId),
      equity: v.equity,
      cash: sandbox.cash,
      openPositions: toPositions(sandbox),
      tradesToday: v.tradesToday,
      dayPnlPct: v.dayPnlPct,
      price,
    };
    const verdict = evaluateEntry(ctx, s);
    if (!verdict.allowed) {
      notes.push(`Skipped ${s.symbol}: ${verdict.blocks.join(" ")}`);
      continue;
    }
    const result = applyOrder(sandbox, {
      symbol: s.symbol,
      side: "BUY",
      notional: verdict.notionalUsd,
      refPrice: price,
      source: "ENGINE",
    });
    if (!result.ok) {
      notes.push(`Skipped ${s.symbol}: ${result.error}`);
      continue;
    }
    sandbox = result.sandbox;
    placed.push(result.trade);
    const related = relatedSymbols(s.symbol, s.leg)
      .map((r) => r.symbol)
      .join(", ");
    const outlets = newsOutlets(s.symbol, s.leg)
      .slice(0, 4)
      .map((o) => o.name)
      .join(", ");
    notes.push(
      `BOUGHT ${s.symbol} — ${s.reason}${related ? ` Also watch: ${related}.` : ""} Check the news: ${outlets}.`
    );
  }

  const finalValue = valueSandbox(sandbox, prices);
  sandbox = markEquity(sandbox, finalValue.equity);

  return {
    sandbox,
    report: {
      placed,
      notes: notes.slice(0, 10),
      summary: placed.length
        ? `${placed.length} paper trade(s) placed on your sandbox.`
        : "No trades this run — the strategies or your risk caps said sit tight.",
    },
  };
}
