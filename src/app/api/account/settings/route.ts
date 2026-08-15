import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getSql } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { clampCaps } from "@/lib/risk";
import { isDemoMode } from "@/lib/config";
import { writeJournal } from "@/lib/journal";

/** Owners may edit only their own account's caps; values are clamped server-side. */
export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ error: "Demo mode: settings are read-only." }, { status: 403 });
  }
  let user;
  try {
    user = await requireOwner();
  } catch (res) {
    return res as Response;
  }
  const body = (await req.json().catch(() => null)) as {
    accountId?: string;
    caps?: Record<string, unknown>;
    discordUserId?: string;
  } | null;
  if (!body?.accountId) {
    return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  }
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT id, owner_user_id, label FROM accounts WHERE id = ${body.accountId}`) as Array<{
    id: string;
    owner_user_id: string;
    label: string;
  }>;
  const account = rows[0];
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (account.owner_user_id !== user.id) {
    return NextResponse.json(
      { error: "Only this account's owner can change its settings." },
      { status: 403 }
    );
  }

  if (body.caps) {
    const caps = clampCaps(body.caps);
    await sql`UPDATE accounts SET caps = ${JSON.stringify(caps)}::jsonb WHERE id = ${account.id}`;
    await writeJournal({
      accountId: account.id,
      kind: "SYSTEM",
      title: `Caps updated — ${account.label}`,
      what: `New limits: max ${caps.maxPositionPct}% per position, ${caps.maxPositions} positions, ${caps.dailyLossPct}% daily stop, ${caps.freezeDrawdownPct}% freeze, ${caps.maxTradesPerDay} trades/day.`,
      why: `Changed by owner ${user.name}. Server clamps every value to the vision's ceilings.`,
      discord: true,
      accountLabel: account.label,
    });
    return NextResponse.json({ ok: true, caps });
  }

  if (typeof body.discordUserId === "string") {
    const id = body.discordUserId.trim().slice(0, 32);
    await sql`UPDATE accounts SET discord_user_id = ${id || null} WHERE id = ${account.id}`;
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
}
