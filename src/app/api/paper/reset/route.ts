import { NextResponse } from "next/server";
import { requireTester } from "@/lib/auth";
import { writeSandbox } from "@/lib/paper/cookie";
import { newSandbox } from "@/lib/paper/sandbox";
import { buildSandboxView } from "@/lib/paper/view";
import { TESTER_START_CASH } from "@/lib/config";

/** Wipes the sandbox back to its starting play money. Only the cookie changes. */
export async function POST() {
  try {
    await requireTester();
  } catch (res) {
    return res as Response;
  }
  const fresh = newSandbox();
  await writeSandbox(fresh);
  const view = await buildSandboxView(fresh);
  return NextResponse.json({
    ok: true,
    note: `Sandbox reset to $${TESTER_START_CASH.toLocaleString("en-US")} of play money.`,
    ...view,
  });
}
