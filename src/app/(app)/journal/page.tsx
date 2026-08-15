import { Card, KindBadge, Section } from "@/components/ui";
import OwnerOnlyNotice from "@/components/paper/OwnerOnlyNotice";
import { getJournal } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type Outlet = { name: string; url: string };
type Related = { symbol: string; name: string };

/** Renders the structured extras (prediction, news links, related tickers) plus raw indicator pills. */
function JournalExtras({ data }: { data: Record<string, unknown> }) {
  const outlets = Array.isArray(data.newsOutlets) ? (data.newsOutlets as Outlet[]) : [];
  const related = Array.isArray(data.relatedSymbols) ? (data.relatedSymbols as Related[]) : [];
  const prediction = data.prediction as { direction?: string; horizon?: string } | undefined;
  const skip = new Set(["newsOutlets", "relatedSymbols", "prediction", "note"]);
  const pills = Object.entries(data).filter(
    ([k, v]) => !skip.has(k) && (typeof v === "string" || typeof v === "number")
  );

  return (
    <div className="mt-2.5 space-y-2">
      {prediction?.direction ? (
        <div className="text-xs text-on-surface-variant">
          <span className="font-semibold text-on-surface-variant/70">Prediction: </span>
          <span
            className={
              prediction.direction === "up"
                ? "text-primary"
                : prediction.direction === "down"
                  ? "text-error"
                  : "text-on-surface"
            }
          >
            {prediction.direction === "up" ? "▲ " : prediction.direction === "down" ? "▼ " : ""}
            {prediction.direction}
          </span>{" "}
          over {prediction.horizon ?? "days to weeks"}
        </div>
      ) : null}

      {outlets.length ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-semibold text-on-surface-variant/70">News:</span>
          {outlets.map((o) => (
            <a
              key={o.name}
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
            >
              {o.name}
            </a>
          ))}
        </div>
      ) : null}

      {related.length ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-semibold text-on-surface-variant/70">Also watch:</span>
          {related.map((r) => (
            <span
              key={r.symbol}
              title={r.name}
              className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant"
            >
              {r.symbol}
            </span>
          ))}
        </div>
      ) : null}

      {pills.length ? (
        <div className="flex flex-wrap gap-1.5">
          {pills.slice(0, 8).map(([k, v]) => (
            <span
              key={k}
              className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant"
            >
              {k}: {String(v)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session?.role === "TESTER") return <OwnerOnlyNotice surface="Trade journal" />;

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.toLowerCase() : "";
  const kind = typeof params.kind === "string" ? params.kind : "";

  const all = await getJournal(300);
  const entries = all.filter((j) => {
    if (kind && j.kind !== kind) return false;
    if (!q) return true;
    return [j.title, j.what, j.why, j.symbol ?? "", j.accountLabel ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const kinds = ["", "TRADE", "VETO", "SKIP", "RISK", "SYSTEM"];

  return (
    <Section title={`Trade journal (${entries.length})`}>
      <form className="mb-4 flex gap-2" action="/journal" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search symbol, reason, account…"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
        />
        <select
          name="kind"
          defaultValue={kind}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-300"
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k || "All kinds"}
            </option>
          ))}
        </select>
        <button className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
          Filter
        </button>
      </form>

      <div className="space-y-2">
        {entries.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500">No journal entries match.</p>
          </Card>
        ) : (
          entries.map((j) => (
            <Card key={j.id}>
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <KindBadge kind={j.kind} />
                {j.symbol ? (
                  <span className="font-mono font-semibold text-zinc-300">{j.symbol}</span>
                ) : null}
                <span>{fmtDateTime(j.ts)}</span>
                {j.accountLabel ? <span>· {j.accountLabel}</span> : null}
              </div>
              <div className="text-sm font-semibold text-zinc-100">{j.title}</div>
              <p className="mt-1 text-sm text-zinc-300">{j.what}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                <span className="font-semibold text-zinc-500">Why: </span>
                {j.why}
              </p>
              {j.data ? <JournalExtras data={j.data} /> : null}
            </Card>
          ))
        )}
      </div>
    </Section>
  );
}
