"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LiveQuote } from "@/lib/data/live";
import type { SandboxView } from "@/lib/paper/view";
import { SYMBOL_NAMES, STOCK_WATCHLIST, FX_WATCHLIST, legForSymbol } from "@/lib/config";
import { MSym } from "@/components/ui";

/**
 * Live-priced order panel. For owners it stays what it always was — a
 * calculator, since this build has no live execution path. For a tester session
 * the buttons place real paper orders against their cookie sandbox: fills come
 * from a server-side quote, so no money and no broker are involved.
 */

const input =
  "w-full rounded-sm border border-outline-variant bg-surface-container px-3 py-2 font-mono text-[13px] text-on-surface focus:border-primary focus:outline-none";

export default function SymbolTradePanel({
  symbol: fixedSymbol,
  isTester,
}: {
  symbol?: string;
  isTester: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState("SPY");
  const [mode, setMode] = useState<"shares" | "dollars">("dollars");
  const [amount, setAmount] = useState(1000);
  const [quoted, setQuoted] = useState<LiveQuote | null>(null);
  const [sandbox, setSandbox] = useState<SandboxView | null>(null);
  const [busy, setBusy] = useState<"BUY" | "SELL" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const symbol = fixedSymbol ?? picked;

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

  useEffect(() => {
    if (!isTester) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/paper/state?symbol=${symbol}`);
        if (!res.ok) return;
        const data = (await res.json()) as SandboxView;
        if (alive) setSandbox(data);
      } catch {
        /* keep last */
      }
    })();
    return () => {
      alive = false;
    };
  }, [isTester, symbol]);

  // Never show one symbol's price next to another's ticker.
  const quote = quoted?.symbol === symbol ? quoted : null;
  const leg = legForSymbol(symbol) ?? "STOCK";
  const digits = leg === "FX" ? 4 : 2;
  const price = quote?.price ?? 0;
  const qty = mode === "shares" ? amount : price > 0 ? amount / price : 0;
  const estValue = mode === "shares" ? amount * price : amount;
  const holding = sandbox?.valuation.holdings.find((h) => h.symbol === symbol);
  const cash = sandbox?.valuation.cash ?? 0;

  async function place(side: "BUY" | "SELL", all = false) {
    setBusy(side);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/paper/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          all,
          ...(all ? {} : mode === "shares" ? { qty: amount } : { notional: amount }),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SandboxView & {
        error?: string;
        note?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Order failed (${res.status})`);
        return;
      }
      setNote(data.note ?? "Filled on paper.");
      if (data.valuation) setSandbox({ valuation: data.valuation, trades: data.trades, marks: data.marks });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "flex-1 rounded-sm px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section className="flex flex-col rounded-sm border border-outline-variant bg-surface p-4">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-on-surface">
          {isTester ? "Paper order" : "Order calculator"}
        </h2>
        {isTester ? (
          <span className="rounded-xs bg-tertiary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-tertiary">
            PLAY MONEY
          </span>
        ) : null}
      </div>

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
          {isTester ? (
            <Row
              label="Sandbox cash"
              value={cash.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              mono
            />
          ) : null}
        </div>

        {isTester && holding ? (
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
              Potential earnings {holding.potentialEarnings >= 0 ? "+" : "−"}$
              {Math.abs(holding.potentialEarnings).toFixed(2)} ({holding.potentialPct.toFixed(2)}%)
            </div>
          </div>
        ) : null}

        {isTester ? (
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
        <MSym name={isTester ? "science" : "lock"} className="mt-px text-sm text-primary" />
        {isTester ? (
          <span>
            Paper only: no money moves and no broker is contacted. Fills use a live server-side quote
            minus a realistic slippage cost, and your positions live in this browser.
          </span>
        ) : (
          <span>
            Manual orders aren&apos;t placed from here. The automated engine executes on paper inside
            your risk caps, keeping the one-chokepoint safety rule intact.{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in as a tester
            </Link>{" "}
            to trade a play-money sandbox by hand.
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
