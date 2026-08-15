import { Card, Dot, Section } from "@/components/ui";
import { CapsEditor, DiscordLinkForm } from "@/components/controls";
import { getAccounts, getEngineRuns, getHealth } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { fmtDateTime, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const demo = isDemoMode();
  const [health, runs, accounts, user] = await Promise.all([
    getHealth(),
    getEngineRuns(15),
    getAccounts(),
    getSession(),
  ]);

  const checks: Array<{ ok: boolean; label: string; hint: string }> = [
    { ok: health.db, label: "Database", hint: health.db ? "Connected" : "Add DATABASE_URL (Neon free tier) — required for real paper trading" },
    { ok: health.dataFeed, label: "Market data (Stooq)", hint: health.dataFeed ? "Reachable" : "Feed unreachable right now" },
    { ok: health.discordWebhook, label: "Discord notifications", hint: health.discordWebhook ? "Webhook configured" : "Add DISCORD_WEBHOOK_URL for trade cards on your phones" },
    { ok: health.discordInteractions, label: "Discord kill switch", hint: health.discordInteractions ? "Slash commands configured" : "Add DISCORD_PUBLIC_KEY to enable /pause, /resume, /status" },
    { ok: health.aiVet, label: "AI judgment layer", hint: health.aiVet ? "Claude vets every entry" : "Add ANTHROPIC_API_KEY to enable AI vetting (optional, pennies/month)" },
    { ok: health.alpacaKeys, label: "Alpaca (stocks paper)", hint: health.alpacaKeys ? "Keys configured — paper orders route to Alpaca" : "No keys — internal simulator handles stock fills (fine for the paper month)" },
    { ok: health.oandaKeys, label: "OANDA (FX practice)", hint: health.oandaKeys ? "Token configured" : "No token — internal simulator handles FX fills (fine for the paper month)" },
  ];

  return (
    <>
      <Section title="Health">
        <Card>
          <div className="divide-y divide-zinc-800">
            {checks.map((c) => (
              <div key={c.label} className="flex items-center gap-3 py-2.5">
                <Dot ok={c.ok} />
                <div>
                  <div className="text-sm text-zinc-200">{c.label}</div>
                  <div className="text-xs text-zinc-500">{c.hint}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      <Section title="Your account limits">
        <div className="space-y-4">
          {accounts.map((a) => {
            const isOwner = demo ? false : user?.id === a.ownerUserId;
            return (
              <Card key={a.id}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold text-zinc-100">{a.label}</span>
                  {isOwner ? (
                    <span className="text-xs text-emerald-500">yours</span>
                  ) : (
                    <span className="text-xs text-zinc-600">view only</span>
                  )}
                </div>
                <CapsEditor accountId={a.id} caps={a.caps} isOwner={isOwner} demo={demo} />
                <div className="mt-4 border-t border-zinc-800 pt-3">
                  <div className="mb-1 text-xs text-zinc-500">
                    Discord kill switch — link your Discord user ID so /pause and /resume act on
                    your account only:
                  </div>
                  <DiscordLinkForm
                    accountId={a.id}
                    current={a.discordUserId}
                    isOwner={isOwner}
                    demo={demo}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section title="Engine runs">
        <Card>
          {runs.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No runs yet. GitHub Actions triggers the engine on schedule, or press &quot;Run
              engine now&quot; on the dashboard.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800 text-sm">
              {runs.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div>
                    <span
                      className={`mr-2 text-xs font-bold ${r.status === "OK" ? "text-emerald-400" : "text-rose-400"}`}
                    >
                      {r.status}
                    </span>
                    <span className="text-zinc-300">{r.summary}</span>
                    <div className="text-xs text-zinc-600">
                      {fmtDateTime(r.ts)} · {(r.durationMs / 1000).toFixed(1)}s · via {r.trigger}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-600">{timeAgo(r.ts)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Section>
    </>
  );
}
