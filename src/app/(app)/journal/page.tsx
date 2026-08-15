import { Card, KindBadge, Section } from "@/components/ui";
import { getJournal } from "@/lib/store";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
              {j.data ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(j.data)
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
                      >
                        {k}: {String(v)}
                      </span>
                    ))}
                </div>
              ) : null}
            </Card>
          ))
        )}
      </div>
    </Section>
  );
}
