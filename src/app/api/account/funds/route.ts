import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { isSetupIncomplete } from "@/lib/config";
import { setPaperBalance } from "@/lib/account/paperTrade";

export const dynamic = "force-dynamic";

/** Sets the owner's paper cash balance (play money for testing, e.g. $1,000,000). */
export async function POST(req: NextRequest) {
  if (isSetupIncomplete()) {
    return NextResponse.json({ error: "Connect a database first." }, { status: 403 });
  }
  let user;
  try {
    user = await requireOwner();
  } catch (res) {
    return res as Response;
  }
  const body = (await req.json().catch(() => null)) as { balance?: number } | null;
  if (typeof body?.balance !== "number") {
    return NextResponse.json({ error: "balance (number) is required." }, { status: 400 });
  }
  const result = await setPaperBalance(user, body.balance);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, balance: result.balance });
}
