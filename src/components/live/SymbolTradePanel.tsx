"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LiveQuote } from "@/lib/data/live";
import type { SandboxView } from "@/lib/paper/view";
import type { AccountTradeState } from "@/lib/account/paperTrade";
import { SYMBOL_NAMES, STOCK_WATCHLIST, FX_WATCHLIST, legForSymbol } from "@/lib/config";
import { MSym } from "@/components/ui";

/**
 * Live-priced order panel. Behaviour depends on who is signed in:
 *  - OWNER  → places real paper orders against their own database account
 *             (journaled as "manual"), and can set their paper balance.
 *  - TESTER → places paper orders against their browser-cookie sandbox.
 *  - guest  → a read-only calculator with a prompt to sign in.
 * No broker is contacted and no real money exists in any path.
 */

type Role = "OWNER" | "TESTER" | null;

interface NormHolding {
  symbol: string;
  qty: number;
  avgPrice: number;
  potentialEarnings: number;
  potentialPct: number;
}
interface NormState {
  cash: number;
  holding: NormHolding | null;
}

const input =
  "w-full rounded-sm border border-outline-variant bg-surface-container px-3 py-2 font-mono text-[13px] text-on-surface focus:border-primary focus:outline-none";

function normalizeSandbox(view: SandboxView, symbol: string): NormState {
  const h = view.valuation.holdings.find((x) => x.symbol === symbol);
  return {
    cash: view.valuation.cash,
    holding: h
      ? {
          symbol: h.symbol,
          qty: h.qty,
          avgPrice: h.avgPrice,
          potentialEarnings: h.potentialEarnings,
          potentialPct: h.potentialPct,
        }
      : null,
  };
}
function normalizeAccount(state: AccountTradeState): NormState {
  return {
    cash: state.cash,
    holding: state.holding
      ? {
          symbol: state.holding.symbol,
          qty: state.holding.qty,
          avgPrice: state.holding.avgPrice,
          potentialEarnings: state.holding.potentialEarnings,
          potentialPct: state.holding.potentialPct,
        }
      : null,
  };
}

export default function SymbolTradePanel({
  symbol: fixedSymbol,
  role,
}: {
  symbol?: string;
  role: Role;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState("SPY");
  const [mode, setMode] = useState<"shares" | "dollars">("dollars");
  const [amount, setAmount] = useState(1000);
  const [quoted, setQuoted] = useState<LiveQuote | null>(null);
  const [state, setState] = useState<NormState | null>(null);
  const [busy, setBusy] = useState<"BUY" | "SELL" | "FUNDS" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fundsInput, setFundsInput] = useState(1000000);

  const symbol = fixedSymbol ?? picked;
  const canTrade = role === "OWNER" || role === "TESTER";
  const stateUrl = role === "OWNER" ? "/api/account/order" : "/api/paper/state";
  const orderUrl = role === "OWNER" ? "/api/account/order" : "/api/paper/order";

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/market/live?symbols=${symbol}`);
        if (!res.ok) return;
        const data = (await res.json()) as { quotes: LiveQuote[] };
        if (alive) setQuoted(data.quotes[0] ?? null);
      } catch {
        /* keep last */
      }
    }
    load();
    const id = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol]);

  const loadState = useCallback(async () => {
    if (!canTrade) return;
    try {
      const res = await fetch(`${stateUrl}?symbol=${symbol}`);
      if (!res.ok) return;
      const data = await res.json();
      if (role === "OWNER") setState(normalizeAccount(data as AccountTradeState));
      else setState(normalizeSandbox(data as SandboxView, symbol));
    } catch {
      /* keep last */
    }
  }, [canTrade, role, stateUrl, symbol]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  // Never show one symbol's price next to another's ticker.
  const quote = quoted?.symbol === symbol ? quoted : null;
  const leg = legForSymbol(symbol) ?? "STOCK";
  const digits = leg === "FX" ? 4 : 2;
  const price = quote?.price ?? 0;
  const qty = mode === "shares" ? amount : price > 0 ? amount / price : 0;
  const estValue = mode === "shares" ? amount * price : amount;
  const holding = state?.holding && state.holding.symbol === symbol ? state.holding : null;
  const cash = state?.cash ?? 0;

  async function place(side: "BUY" | "SELL", all = false) {
    setBusy(side);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(orderUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          all,
          ...(all ? {} : mode === "shares" ? { qty: amount } : { notional: amount }),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        note?: string;
        state?: AccountTradeState;
        valuation?: SandboxView["valuation"];
        trades?: SandboxView["trades"];
        marks?: SandboxView["marks"];
      };
      if (!res.ok) {
        setError(data.error ?? `Order failed (${res.status})`);
        return;
      }
      setNote(data.note ?? "Filled on paper.");
      if (role === "OWNER" && data.state) setState(normalizeAccount(data.state));
      else if (data.valuation)
        setState(normalizeSandbox({ valuation: data.valuation, trades: data.trades!, marks: data.marks! }, symbol));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function setFunds(value: number) {
    setBusy("FUNDS");
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/account/funds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ balance: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; balance?: number };
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setNote(`Paper balance set to $${(data.balance ?? value).toLocaleString("en-US")}.`);
      await loadState();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "flex-1 rounded-sm px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const title = role === "OWNER" ? "Manual paper order" : role === "TESTER" ? "Paper order" : "Order calculator";

  return (
    <section className="flex flex-col rounded-sm border border-outline-variant bg-surface p-4">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-on-surface">{title}</h2>
        {canTrade ? (
          <span className="rounded-xs bg-tertiary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-tertiary">
            {role === "OWNER" ? "PAPER" : "PLAY MONEY"}
          </span>
        ) : null}
      </div>

      {/* Owner-only: set paper balance (play money for testing) */}
      {role === "OWNER" ? (
        <div className="mb-4 rounded-sm border border-outline-variant bg-surface-container-low p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.05em] text-on-surface-variant">
              Paper cash
            </span>
            <span className="font-mono text-[13px] text-primary">
              {cash.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="1000"
              value={fundsInput}
              onChange={(e) => setFundsInput(Math.max(0, Number(e.target.value)))}
              className={`${input} text-right`}
            />
            <button
              className="shrink-0 rounded-sm border border-outline-variant px-2.5 py-2 text-[12px] text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => setFunds(fundsInput)}
            >
              Set
            </button>
            <button
              className="shrink-0 rounded-sm bg-primary/15 px-2.5 py-2 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => {
                setFundsInput(1000000);
                void setFunds(1000000);
              }}
            >
              $1,000,000
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {fixedSymbol ? null : (
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.05em] text-on-surface-variant">
              Symbol
            </label>
            <select value={symbol} onChange={(e) => setPicked(e.target.value)} className={input}>
              {[...STOCK_WATCHLIST, ...FX_WATCHLIST].map((s) => (
                <option key={s} value={s}>
                  {s} — {SYMBOL_NAMES[s] ?? ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[11px] uppercase tracking-[0.05em] text-on-surface-variant">
              {mode === "shares" ? "Shares" : "Amount (USD)"}
            </label>
            <div className="flex gap-1">
              {(["dollars", "shares"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-xs px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                    mode === m
                      ? "bg-primary/15 text-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {m === "dollars" ? "$" : "qty"}
                </button>
              ))}
            </div>
          </div>
          <input
            type="number"
            min="0"
            step={mode === "shares" ? "0.01" : "10"}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            className={`${input} text-right`}
          />
        </div>

        <div className="space-y-1 border-t border-outline-variant pt-3 text-[11px] text-on-surface-variant">
          <Row label="Live price" value={price ? price.toFixed(digits) : "—"} mono accent />
          <Row
            label="Change today"
            value={quote ? `${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%` : "—"}
            tone={(quote?.changePct ?? 0) >= 0 ? "up" : "down"}
            mono
          />
          <Row
            label={mode === "shares" ? "Est. cost" : "Est. shares"}
            value={
              mode === "shares"
                ? estValue.toLocaleString("en-US", { style: "currency", currency: "USD" })
                : qty.toFixed(4)
            }
            mono
          />
          {canTrade ? (
            <Row
              label={role === "OWNER" ? "Account cash" : "Sandbox cash"}
              value={cash.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              mono
            />
          ) : null}
        </div>

        {canTrade && holding ? (
          <div className="rounded-sm border border-outline-variant bg-surface-container-low p-2.5 text-[11px]">
            <div className="text-on-surface">
              You hold <span className="font-mono">{holding.qty}</span> {symbol} @{" "}
              <span className="font-mono">{holding.avgPrice.toFixed(digits)}</span>
            </div>
            <div
              className={`mt-0.5 font-mono ${
                holding.potentialEarnings >= 0 ? "text-primary" : "text-error"
              }`}
            >
              {role === "OWNER" ? "Unrealized" : "Potential earnings"}{" "}
              {holding.potentialEarnings >= 0 ? "+" : "−"}$
              {Math.abs(holding.potentialEarnings).toFixed(2)} ({holding.potentialPct.toFixed(2)}%)
            </div>
          </div>
        ) : null}

        {canTrade ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                className={`${btn} bg-primary text-on-primary hover:bg-primary-container`}
                disabled={busy !== null || !price || amount <= 0}
                onClick={() => place("BUY")}
              >
                {busy === "BUY" ? "Filling…" : "Buy on paper"}
              </button>
              <button
                className={`${btn} border border-outline-variant text-on-surface hover:bg-surface-container-high`}
                disabled={busy !== null || !price || !holding}
                onClick={() => place("SELL")}
              >
                {busy === "SELL" ? "Filling…" : "Sell"}
              </button>
            </div>
            {holding ? (
              <button
                className="w-full rounded-sm border border-outline-variant py-1.5 text-[11px] text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-50"
                disabled={busy !== null}
                onClick={() => place("SELL", true)}
              >
                Close whole {symbol} position
              </button>
            ) : null}
            {error ? <p className="text-[11px] text-error">{error}</p> : null}
            {note ? <p className="text-[11px] text-primary">{note}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-sm border border-outline-variant bg-surface-container-low p-3 text-[11px] leading-relaxed text-on-surface-variant">
        <MSym name={canTrade ? "science" : "lock"} className="mt-px text-sm text-primary" />
        {role === "OWNER" ? (
          <span>
            Paper only: hand trades fill at a live server-side quote minus a realistic slippage cost,
            update your account, and appear in the journal tagged <span className="font-mono">manual</span>.
            The automated engine keeps trading alongside you. No broker, no real money.
          </span>
        ) : role === "TESTER" ? (
          <span>
            Paper only: no money moves and no broker is contacted. Fills use a live server-side quote
            minus a realistic slippage cost, and your positions live in this browser.
          </span>
        ) : (
          <span>
            Sign in to trade on paper.{" "}
            <Link href="/login" className="text-primary hover:underline">
              Owners
            </Link>{" "}
            trade their own account by hand; testers get a play-money sandbox.
          </span>
        )}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
  accent,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  tone?: "up" | "down";
}) {
  const color = accent
    ? "text-primary"
    : tone === "up"
      ? "text-primary"
      : tone === "down"
        ? "text-error"
        : "text-on-surface";
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${color}`}>{value}</span>
    </div>
  );
}
