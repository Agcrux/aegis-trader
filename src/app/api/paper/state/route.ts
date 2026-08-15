import { NextRequest, NextResponse } from "next/server";
import { requireTester } from "@/lib/auth";
import { readSandboxOrFresh } from "@/lib/paper/cookie";
import { buildSandboxView } from "@/lib/paper/view";

/** Current sandbox valuation for client widgets. Never cached — it's per-visitor. */
export async function GET(req: NextRequest) {
  try {
    await requireTester();
  } catch (res) {
    return res as Response;
  }
  const extra = (req.nextUrl.searchParams.get("symbol") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const view = await buildSandboxView(await readSandboxOrFresh(), extra);
  return NextResponse.json(view, { headers: { "cache-control": "no-store" } });
}
