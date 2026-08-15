"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Caps } from "@/lib/types";

/** Client-side interactive controls. Every mutation re-fetches server data on success. */

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(url: string, body?: unknown) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        note?: string;
        summary?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return false;
      }
      if (data.note || data.summary) setNote(data.note ?? data.summary ?? null);
      router.refresh();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, note, run, setError };
}

const btn =
  "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";
const btnGhost = `${btn} border border-zinc-700 text-zinc-300 hover:bg-zinc-800`;
const btnDanger = `${btn} bg-rose-600/90 text-white hover:bg-rose-600`;
const btnPrimary = `${btn} bg-emerald-600/90 text-white hover:bg-emerald-600`;

export function Feedback({ error, note }: { error: string | null; note: string | null }) {
  if (!error && !note) return null;
  return (
    <p className={`mt-2 text-xs ${error ? "text-rose-400" : "text-emerald-400"}`}>
      {error ?? note}
    </p>
  );
}

export function RunNowButton({ disabled }: { disabled: boolean }) {
  const { busy, error, note, run } = useAction();
  return (
    <div>
      <button
        className={btnGhost}
        disabled={disabled || busy}
        onClick={() => run("/api/engine/tick")}
        title={disabled ? "Disabled in demo mode" : "Run one engine cycle now"}
      >
        {busy ? "Running…" : "Run engine now"}
      </button>
      <Feedback error={error} note={note} />
    </div>
  );
}

export function ModeControls({
  accountId,
  label,
  mode,
  frozen,
  isOwner,
  demo,
}: {
  accountId: string;
  label: string;
  mode: string;
  frozen: boolean;
  isOwner: boolean;
  demo: boolean;
}) {
  const { busy, error, note, run } = useAction();
  const [phrase, setPhrase] = useState("");
  const disabled = demo || !isOwner || busy;

  if (!isOwner && !demo) {
    return (
      <p className="text-xs text-zinc-500">
        Only {label}&apos;s owner can control this account — full transparency, personal brakes.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {frozen ? (
          <>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder='Type RESTART'
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            />
            <button
              className={btnDanger}
              disabled={disabled}
              onClick={() => run("/api/account/mode", { accountId, action: "UNFREEZE", confirmPhrase: phrase })}
            >
              Reset circuit breaker
            </button>
          </>
        ) : (
          <>
            {mode !== "OFF" ? (
              <button
                className={btnDanger}
                disabled={disabled}
                onClick={() => run("/api/account/mode", { accountId, action: "OFF" })}
              >
                ⏸ Kill switch
              </button>
            ) : (
              <button
                className={btnPrimary}
                disabled={disabled}
                onClick={() => run("/api/account/mode", { accountId, action: "PAPER" })}
              >
                ▶ Resume paper
              </button>
            )}
          </>
        )}
      </div>
      {!frozen && mode !== "LIVE" ? (
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer select-none">Go-live (after the paper month)</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={`Type: GO LIVE ${label}`}
              className="w-56 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            />
            <button
              className={btnGhost}
              disabled={disabled}
              onClick={() => run("/api/account/mode", { accountId, action: "LIVE", confirmPhrase: phrase })}
            >
              Request live
            </button>
          </div>
          <p className="mt-1">
            Blocked until 30 clean paper days. This build routes all orders to paper/practice
            environments regardless — live execution ships as its own later stage.
          </p>
        </details>
      ) : null}
      <Feedback error={error} note={note} />
    </div>
  );
}

export function CapsEditor({
  accountId,
  caps,
  isOwner,
  demo,
}: {
  accountId: string;
  caps: Caps;
  isOwner: boolean;
  demo: boolean;
}) {
  const { busy, error, note, run } = useAction();
  const [form, setForm] = useState<Caps>(caps);
  const disabled = demo || !isOwner || busy;

  const fields: Array<{ key: keyof Caps; label: string; hint: string }> = [
    { key: "maxPositionPct", label: "Max % per position", hint: "of equity" },
    { key: "maxPositions", label: "Max open positions", hint: "count" },
    { key: "dailyLossPct", label: "Daily loss stop %", hint: "pauses for the day" },
    { key: "freezeDrawdownPct", label: "Freeze at drawdown %", hint: "master breaker (≤30)" },
    { key: "maxTradesPerDay", label: "Max trades per day", hint: "count" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {fields.map((f) => (
          <label key={f.key} className="block text-xs text-zinc-500">
            {f.label}
            <input
              type="number"
              value={form[f.key]}
              step="1"
              min="0"
              disabled={disabled}
              onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 disabled:opacity-50"
            />
            <span className="text-[10px] text-zinc-600">{f.hint}</span>
          </label>
        ))}
      </div>
      <div className="mt-3">
        <button
          className={btnGhost}
          disabled={disabled}
          onClick={() => run("/api/account/settings", { accountId, caps: form })}
        >
          {busy ? "Saving…" : "Save limits"}
        </button>
        <Feedback error={error} note={note} />
      </div>
    </div>
  );
}

export function DiscordLinkForm({
  accountId,
  current,
  isOwner,
  demo,
}: {
  accountId: string;
  current: string | null;
  isOwner: boolean;
  demo: boolean;
}) {
  const { busy, error, note, run } = useAction();
  const [id, setId] = useState(current ?? "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="Your Discord user ID"
        disabled={demo || !isOwner}
        className="w-48 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm disabled:opacity-50"
      />
      <button
        className={btnGhost}
        disabled={demo || !isOwner || busy}
        onClick={() => run("/api/account/settings", { accountId, discordUserId: id })}
      >
        Link
      </button>
      <Feedback error={error} note={note} />
    </div>
  );
}

export function BacktestButton({ demo }: { demo: boolean }) {
  const { busy, error, note, run } = useAction();
  return (
    <div>
      <button className={btnPrimary} disabled={demo || busy} onClick={() => run("/api/backtest/run")}>
        {busy ? "Testing ~5 years of history…" : "Run backtests"}
      </button>
      <Feedback error={error} note={note} />
    </div>
  );
}

/** One-click entry to the paper sandbox: no credentials, no money, real prices. */
export function TesterButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/tester", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "Could not start a tester sandbox.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <button onClick={start} disabled={busy} className={`${btnPrimary} w-full`}>
        {busy ? "Opening sandbox…" : "Continue as tester"}
      </button>
      {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}

export function AuthForm({ kind }: { kind: "login" | "join" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "", name: "", inviteCode: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const input =
    "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200";
  return (
    <form onSubmit={submit} className="space-y-3">
      {kind === "join" ? (
        <>
          <input
            className={input}
            placeholder="Invite code"
            value={form.inviteCode}
            onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
            required
          />
          <input
            className={input}
            placeholder="Your name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </>
      ) : null}
      <input
        className={input}
        type="email"
        placeholder="Email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        required
      />
      <input
        className={input}
        type="password"
        placeholder={kind === "join" ? "Password (10+ characters)" : "Password"}
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
        required
      />
      <button className={`${btnPrimary} w-full`} disabled={busy}>
        {busy ? "…" : kind === "join" ? "Create owner account" : "Sign in"}
      </button>
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </form>
  );
}
