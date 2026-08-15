"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Sandbox actions: run the real strategy engine against the tester's play money,
 * or wipe it back to the starting balance. Both only touch the sandbox cookie.
 */
export default function PaperControls() {
  const router = useRouter();
  const [busy, setBusy] = useState<"engine" | "reset" | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function call(kind: "engine" | "reset") {
    if (kind === "reset" && !confirm("Reset the sandbox back to its starting play money?")) return;
    setBusy(kind);
    setError(null);
    setSummary(null);
    setNotes([]);
    try {
      const res = await fetch(`/api/paper/${kind}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        summary?: string;
        note?: string;
        notes?: string[];
      };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setSummary(data.summary ?? data.note ?? null);
      setNotes(data.notes ?? []);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          className={`${btn} bg-primary text-on-primary hover:bg-primary-container`}
          disabled={busy !== null}
          onClick={() => call("engine")}
        >
          {busy === "engine" ? "Scanning the market…" : "Run strategy engine on my sandbox"}
        </button>
        <button
          className={`${btn} border border-outline-variant text-on-surface-variant hover:bg-surface-container-high`}
          disabled={busy !== null}
          onClick={() => call("reset")}
        >
          Reset sandbox
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-error">{error}</p> : null}
      {summary ? <p className="mt-2 text-xs text-primary">{summary}</p> : null}
      {notes.length ? (
        <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-on-surface-variant">
          {notes.map((n, i) => (
            <li key={i}>· {n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
