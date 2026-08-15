import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getSql } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { paperGateStatus } from "@/lib/risk";
import { isDemoMode } from "@/lib/config";
import { getErrorsInWindow } from "@/lib/store";
import { writeJournal } from "@/lib/journal";
import { PAPER_GATE_DAYS } from "@/lib/config";
import type { Account, Caps } from "@/lib/types";

/**
 * Mode transitions — the most protected endpoint in the system.
 *  - OFF (kill switch) and back to PAPER: owner, any time.
 *  - LIVE: owner only, typed confirmation phrase, paper gate satisfied
 *    (30 clean days), and unfreezing requires an explicit restart.
 *  - This build additionally has NO live execution path (brokers refuse LIVE),
 *    so LIVE here arms the intent; live endpoints arrive in a later stage.
 */
export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ error: "Demo mode: controls are disabled." }, { status: 403 });
  }
  let user;
  try {
    user = await requireOwner();
  } catch (res) {
    return res as Response;
  }
  const body = (await req.json().catch(() => null)) as {
    accountId?: string;
    action?: "OFF" | "PAPER" | "LIVE" | "UNFREEZE";
    confirmPhrase?: string;
  } | null;
  if (!body?.accountId || !body.action) {
    return NextResponse.json({ error: "accountId and action are required." }, { status: 400 });
  }
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT * FROM accounts WHERE id = ${body.accountId}`) as Array<
    Record<string, unknown>
  >;
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (String(row.owner_user_id) !== user.id) {
    return NextResponse.json(
      { error: "Only this account's owner can change its mode. That rule has no exceptions." },
      { status: 403 }
    );
  }
  const label = String(row.label);

  if (body.action === "OFF") {
    await sql`UPDATE accounts SET mode = 'OFF' WHERE id = ${body.accountId}`;
    await writeJournal({
      accountId: String(row.id),
      kind: "SYSTEM",
      title: `KILL SWITCH — ${label} paused`,
      what: `${user.name} switched ${label} to OFF. No new trades will be placed. Open positions remain and can still be exited when trading resumes.`,
      why: "Owner-initiated pause via dashboard.",
      discord: true,
      accountLabel: label,
    });
    return NextResponse.json({ ok: true, mode: "OFF" });
  }

  if (body.action === "UNFREEZE") {
    if (body.confirmPhrase?.trim().toUpperCase() !== "RESTART") {
      return NextResponse.json(
        { error: 'Type RESTART to confirm you have reviewed why the circuit breaker fired.' },
        { status: 400 }
      );
    }
    await sql`UPDATE accounts SET frozen = false, frozen_reason = NULL, peak_equity = sim_cash, mode = 'PAPER' WHERE id = ${body.accountId}`;
    await writeJournal({
      accountId: String(row.id),
      kind: "SYSTEM",
      title: `Circuit breaker reset — ${label}`,
      what: `${user.name} reviewed the freeze and restarted ${label} in PAPER mode. The drawdown peak was reset to current equity.`,
      why: "Owner confirmed the restart after a circuit-breaker freeze.",
      discord: true,
      accountLabel: label,
    });
    return NextResponse.json({ ok: true, mode: "PAPER" });
  }

  if (body.action === "PAPER") {
    const startPaper = row.paper_started_at ?? new Date().toISOString();
    await sql`UPDATE accounts SET mode = 'PAPER', paper_started_at = ${startPaper} WHERE id = ${body.accountId}`;
    await writeJournal({
      accountId: String(row.id),
      kind: "SYSTEM",
      title: `${label} resumed in PAPER mode`,
      what: `${user.name} set ${label} to PAPER. The engine will trade simulated money on the next tick.`,
      why: "Owner-initiated resume.",
      discord: true,
      accountLabel: label,
    });
    return NextResponse.json({ ok: true, mode: "PAPER" });
  }

  // action === "LIVE"
  const account = {
    paperStartedAt: row.paper_started_at ? String(row.paper_started_at) : null,
    caps: row.caps as Caps,
  } as Account;
  const errors = await getErrorsInWindow(PAPER_GATE_DAYS);
  const gate = paperGateStatus(account, errors);
  if (!gate.satisfied) {
    return NextResponse.json(
      {
        error: `Not yet. ${gate.detail} Real money waits for the full clean month — that was the deal.`,
      },
      { status: 403 }
    );
  }
  const expected = `GO LIVE ${label}`.toUpperCase();
  if (body.confirmPhrase?.trim().toUpperCase() !== expected) {
    return NextResponse.json(
      { error: `Type exactly "${expected}" to confirm. This is your money's final gate.` },
      { status: 400 }
    );
  }
  await sql`UPDATE accounts SET mode = 'LIVE', live_approved_at = now() WHERE id = ${body.accountId}`;
  await writeJournal({
    accountId: String(row.id),
    kind: "SYSTEM",
    title: `${label} ARMED FOR LIVE`,
    what: `${user.name} passed the paper gate (${gate.daysDone} clean days) and typed the confirmation phrase. NOTE: this build contains no live execution path — orders still route to paper/practice environments until the live stage ships and is separately approved.`,
    why: gate.detail,
    discord: true,
    accountLabel: label,
  });
  return NextResponse.json({ ok: true, mode: "LIVE", note: "Live execution ships in a later stage." });
}
