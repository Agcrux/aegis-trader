import { NextRequest, NextResponse } from "next/server";
import { verifyKey } from "discord-interactions";
import { ensureSchema, getSql } from "@/lib/db";
import { env, isDemoMode } from "@/lib/config";
import { writeJournal } from "@/lib/journal";

export const maxDuration = 15;

/**
 * Discord slash-command endpoint (HTTP interactions — no bot process needed).
 * Commands: /status, /pause, /resume. Pause/resume act only on the account
 * whose owner linked their Discord user ID on the System page — the kill
 * switch stays personal, matching the legal structure.
 */
export async function POST(req: NextRequest) {
  const publicKey = env.discordPublicKey();
  if (!publicKey) return NextResponse.json({ error: "Not configured" }, { status: 501 });

  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  const rawBody = await req.text();
  const valid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!valid) return new NextResponse("Bad request signature", { status: 401 });

  const interaction = JSON.parse(rawBody) as {
    type: number;
    data?: { name?: string };
    member?: { user?: { id?: string; username?: string } };
    user?: { id?: string; username?: string };
  };

  // PING
  if (interaction.type === 1) return NextResponse.json({ type: 1 });

  const reply = (content: string) =>
    NextResponse.json({ type: 4, data: { content, flags: 64 } }); // ephemeral

  if (interaction.type !== 2) return reply("Unsupported interaction.");
  if (isDemoMode()) return reply("Demo mode — connect a database first.");

  const command = interaction.data?.name ?? "";
  const discordUser = interaction.member?.user ?? interaction.user;
  const discordId = discordUser?.id ?? "";

  await ensureSchema();
  const sql = getSql();

  if (command === "status") {
    const rows = (await sql`SELECT label, mode, frozen, sim_cash FROM accounts ORDER BY created_at`) as Array<{
      label: string;
      mode: string;
      frozen: boolean;
      sim_cash: string;
    }>;
    if (!rows.length) return reply("No accounts yet.");
    return reply(
      rows
        .map(
          (r) =>
            `**${r.label}** — mode ${r.mode}${r.frozen ? " (FROZEN)" : ""}, cash $${Number(r.sim_cash).toFixed(2)}`
        )
        .join("\n")
    );
  }

  if (command === "pause" || command === "resume") {
    if (!discordId) return reply("Could not identify your Discord user.");
    const rows = (await sql`SELECT id, label, frozen FROM accounts WHERE discord_user_id = ${discordId}`) as Array<{
      id: string;
      label: string;
      frozen: boolean;
    }>;
    const account = rows[0];
    if (!account) {
      return reply(
        "No account is linked to your Discord user. Open the dashboard → System → paste your Discord user ID into your account's settings."
      );
    }
    if (command === "resume" && account.frozen) {
      return reply(
        `${account.label} is FROZEN by its circuit breaker — restarting requires the dashboard (System page) so you see why it fired.`
      );
    }
    const mode = command === "pause" ? "OFF" : "PAPER";
    await sql`UPDATE accounts SET mode = ${mode} WHERE id = ${account.id}`;
    await writeJournal({
      accountId: account.id,
      kind: "SYSTEM",
      title: `${command === "pause" ? "KILL SWITCH via Discord" : "Resumed via Discord"} — ${account.label}`,
      what: `${discordUser?.username ?? "Owner"} used /${command} in Discord. Mode is now ${mode}.`,
      why: "Owner-issued chat command from their linked Discord user.",
      discord: true,
      accountLabel: account.label,
    });
    return reply(
      command === "pause"
        ? `⏸️ ${account.label} paused. No new trades. Use /resume or the dashboard to restart.`
        : `▶️ ${account.label} resumed in PAPER mode.`
    );
  }

  return reply("Unknown command.");
}
