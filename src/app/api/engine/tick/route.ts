import { NextRequest, NextResponse } from "next/server";
import { runEngineTick } from "@/lib/engine/tick";
import { env, isDemoMode } from "@/lib/config";
import { getSession } from "@/lib/auth";

export const maxDuration = 60;

/**
 * Engine trigger. Accepts:
 *  - GitHub Actions cron:  x-cron-secret header
 *  - Vercel cron:          Authorization: Bearer <CRON_SECRET> (added automatically)
 *  - A signed-in owner:    "Run now" button on the dashboard
 */
async function authorize(req: NextRequest): Promise<string | null> {
  const secret = env.cronSecret();
  if (secret) {
    if (req.headers.get("x-cron-secret") === secret) return "github-cron";
    if (req.headers.get("authorization") === `Bearer ${secret}`) return "vercel-cron";
  }
  const user = await getSession();
  if (user) return `manual:${user.name}`;
  return null;
}

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      summary: "Demo mode — engine is idle until a database is connected.",
    });
  }
  const trigger = await authorize(req);
  if (!trigger) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await runEngineTick(trigger);
  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
