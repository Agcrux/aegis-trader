import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ensureSchema, getSql, newId } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { DEFAULT_CAPS, env, isDemoMode, MAX_OWNERS } from "@/lib/config";
import { writeJournal } from "@/lib/journal";

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json(
      { error: "Demo mode: connect a database before creating owner accounts." },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => null)) as {
    inviteCode?: string;
    email?: string;
    name?: string;
    password?: string;
  } | null;
  if (!body?.inviteCode || !body.email || !body.name || !body.password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  const expected = env.inviteCode();
  if (!expected || body.inviteCode.trim() !== expected) {
    return NextResponse.json({ error: "Invalid invite code." }, { status: 403 });
  }
  if (body.password.length < 10) {
    return NextResponse.json(
      { error: "Password must be at least 10 characters." },
      { status: 400 }
    );
  }

  await ensureSchema();
  const sql = getSql();
  const countRows = (await sql`SELECT count(*)::int AS n FROM users`) as Array<{ n: number }>;
  if ((countRows[0]?.n ?? 0) >= MAX_OWNERS) {
    return NextResponse.json(
      { error: `This system is limited to ${MAX_OWNERS} owners and both seats are taken.` },
      { status: 403 }
    );
  }
  const email = body.email.trim().toLowerCase();
  const existing = (await sql`SELECT id FROM users WHERE email = ${email}`) as Array<{
    id: string;
  }>;
  if (existing.length) {
    return NextResponse.json({ error: "That email is already registered." }, { status: 409 });
  }

  const userId = newId("us");
  const accountId = newId("ac");
  const hash = await bcrypt.hash(body.password, 10);
  const name = body.name.trim().slice(0, 60);
  await sql.transaction((txn) => [
    txn`INSERT INTO users (id, email, name, password_hash) VALUES (${userId}, ${email}, ${name}, ${hash})`,
    txn`INSERT INTO accounts (id, owner_user_id, label, mode, caps, paper_started_at)
      VALUES (${accountId}, ${userId}, ${name + "'s account"}, 'PAPER', ${JSON.stringify(DEFAULT_CAPS)}::jsonb, now())`,
  ]);
  await writeJournal({
    accountId,
    kind: "SYSTEM",
    title: `Account created for ${name}`,
    what: `${name} joined as an owner. Their paper account starts with $25 of simulated cash in PAPER mode.`,
    why: "Every account begins the 30-day clean paper month; only its owner can ever change its mode.",
    discord: true,
    accountLabel: name + "'s account",
  });
  await createSession({ id: userId, email, name });
  return NextResponse.json({ ok: true });
}
