import type { AccountMode, JournalKind } from "@/lib/types";

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down" | "neutral";
}) {
  const toneClass =
    tone === "up" ? "text-emerald-400" : tone === "down" ? "text-rose-400" : "text-zinc-100";
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
      {sub ? <div className="text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

export function ModeBadge({ mode, frozen }: { mode: AccountMode; frozen: boolean }) {
  if (frozen)
    return (
      <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-400">
        FROZEN
      </span>
    );
  const styles: Record<AccountMode, string> = {
    OFF: "bg-zinc-500/15 text-zinc-400",
    PAPER: "bg-sky-500/15 text-sky-400",
    LIVE: "bg-emerald-500/15 text-emerald-400",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[mode]}`}>
      {mode}
    </span>
  );
}

const KIND_STYLES: Record<JournalKind, string> = {
  TRADE: "bg-emerald-500/15 text-emerald-400",
  SKIP: "bg-zinc-500/15 text-zinc-400",
  VETO: "bg-violet-500/15 text-violet-400",
  RISK: "bg-rose-500/15 text-rose-400",
  INFO: "bg-sky-500/15 text-sky-400",
  SYSTEM: "bg-amber-500/15 text-amber-400",
};

export function KindBadge({ kind }: { kind: JournalKind }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${KIND_STYLES[kind]}`}>
      {kind}
    </span>
  );
}

export function DemoBanner() {
  return (
    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
      <strong>Demo mode.</strong> You&apos;re looking at sample data — no database is connected
      yet, so nothing here is real and all controls are disabled. See the README&apos;s setup
      steps to bring it to life.
    </div>
  );
}

export function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-400" : "bg-zinc-600"}`}
    />
  );
}
