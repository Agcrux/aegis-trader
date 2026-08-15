import { NextResponse } from "next/server";
import { requireTester } from "@/lib/auth";
import { readSandboxOrFresh, writeSandbox } from "@/lib/paper/cookie";
import { runSandboxEngine } from "@/lib/paper/engine";
import { buildSandboxView } from "@/lib/paper/view";

export const maxDuration = 60;

/** Runs the real strategies and risk rules against the tester's own sandbox. */
export async function POST() {
  let user;
  try {
    user = await requireTester();
  } catch (res) {
    return res as Response;
  }

  const { sandbox, report } = await runSandboxEngine(await readSandboxOrFresh(), user.id);
  await writeSandbox(sandbox);
  const view = await buildSandboxView(sandbox);
  return NextResponse.json({ ok: true, ...report, ...view });
}
