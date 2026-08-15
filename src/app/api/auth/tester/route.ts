import { NextResponse } from "next/server";
import { createSession, getSession } from "@/lib/auth";
import { readSandbox, writeSandbox } from "@/lib/paper/cookie";
import { newSandbox } from "@/lib/paper/sandbox";
import { TESTER_START_CASH } from "@/lib/config";

/**
 * One-click tester sign-in. No credentials, no database, no money: the session
 * only unlocks a paper sandbox stored in the visitor's own browser cookie.
 * Returning testers keep the sandbox they already have.
 */
export async function POST() {
  const existing = await getSession();
  if (existing?.role === "OWNER") {
    return NextResponse.json(
      { error: "You're signed in as an owner. Sign out first to try the tester sandbox." },
      { status: 409 }
    );
  }

  const id = `ts_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
  try {
    await createSession({ id, email: "", name: "Tester", role: "TESTER" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const sandbox = await readSandbox();
  if (!sandbox) await writeSandbox(newSandbox());

  return NextResponse.json({
    ok: true,
    resumed: Boolean(sandbox),
    startingCash: TESTER_START_CASH,
  });
}
