import type { AccountMode, JournalKind } from "@/lib/types";

/** Material Symbols icon (font loaded in the root layout). */
export function MSym({
  name,
  fill = false,
  className = "",
}: {
  name: string;
  fill?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden
    >
      {name}
    </span>
  );
}

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
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
          {title}
        </h2>
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
    <div className={`rounded-sm border border-outline-variant bg-surface p-4 ${className}`}>
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
    tone === "up" ? "text-primary" : tone === "down" ? "text-error" : "text-on-surface";
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
        {label}
      </div>
      <div className={`font-mono text-lg font-semibold ${toneClass}`}>{value}</div>
      {sub ? <div className="text-xs text-on-surface-variant/80">{sub}</div> : null}
    </div>
  );
}

export function ModeBadge({ mode, frozen }: { mode: AccountMode; frozen: boolean }) {
  if (frozen)
    return (
      <span className="rounded-xs bg-error-container/60 px-2 py-0.5 font-mono text-[11px] font-bold text-on-error-container">
        FROZEN
      </span>
    );
  const styles: Record<AccountMode, string> = {
    OFF: "bg-surface-container-high text-on-surface-variant",
    PAPER: "bg-tertiary/15 text-tertiary",
    LIVE: "bg-primary/15 text-primary",
  };
  return (
    <span className={`rounded-xs px-2 py-0.5 font-mono text-[11px] font-bold ${styles[mode]}`}>
      {mode}
    </span>
  );
}

const KIND_STYLES: Record<JournalKind, string> = {
  TRADE: "bg-primary/15 text-primary",
  SKIP: "bg-surface-container-high text-on-surface-variant",
  VETO: "bg-tertiary/15 text-tertiary",
  RISK: "bg-error-container/60 text-on-error-container",
  INFO: "bg-tertiary/10 text-tertiary",
  SYSTEM: "bg-[#4a3b00]/60 text-[#ffde9c]",
};

export function KindBadge({ kind }: { kind: JournalKind }) {
  return (
    <span className={`rounded-xs px-1.5 py-0.5 font-mono text-[10px] font-bold ${KIND_STYLES[kind]}`}>
      {kind}
    </span>
  );
}

export function SetupBanner() {
  return (
    <div className="mb-4 rounded-sm border border-[#4a3b00] bg-[#4a3b00]/30 px-4 py-2.5 text-sm text-[#ffde9c]">
      <strong>Setup incomplete.</strong> No database is connected, so accounts and the engine are
      offline. Market data on this page is live; nothing is simulated or sampled.
    </div>
  );
}

export function Dot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-primary" : "bg-outline-variant"}`} />
  );
}

/** Pulsing live indicator from the terminal design. */
export function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
  );
}
