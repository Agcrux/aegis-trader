import { NextRequest, NextResponse } from "next/server";
import { env, isDemoMode } from "@/lib/config";
import { getAccounts, getEquitySeries, getJournal } from "@/lib/store";
import { notifyDiscord, COLORS } from "@/lib/discord";

export const maxDuration = 30;

/** Daily digest to Discord — combined equity, per-account status, today's activity. */
export async function POST(req: NextRequest) {
  if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });
  const secret = env.cronSecret();
  const authorized =
    secret &&
    (req.headers.get("x-cron-secret") === secret ||
      req.headers.get("authorization") === `Bearer ${secret}`);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await getAccounts();
  const journal = await getJournal(50);
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = journal.filter((j) => j.ts.slice(0, 10) === today);
  const tradesToday = todayEntries.filter((j) => j.kind === "TRADE").length;

  const lines: string[] = [];
  let combined = 0;
  let combinedStart = 0;
  for (const a of accounts) {
    const series = await getEquitySeries(a.id);
    const equity = series.length ? series[series.length - 1].equity : a.simCash;
    combined += equity;
    combinedStart += a.startingEquity;
    const ret = a.startingEquity > 0 ? ((equity - a.startingEquity) / a.startingEquity) * 100 : 0;
    lines.push(
      `**${a.label}** — $${equity.toFixed(2)} (${ret >= 0 ? "+" : ""}${ret.toFixed(1)}% since start) · mode ${a.mode}${a.frozen ? " · FROZEN" : ""}`
    );
  }
  const combRet = combinedStart > 0 ? ((combined - combinedStart) / combinedStart) * 100 : 0;

  await notifyDiscord({
    title: `Daily summary — ${today}`,
    description: [
      `Combined paper equity **$${combined.toFixed(2)}** (${combRet >= 0 ? "+" : ""}${combRet.toFixed(1)}% since start).`,
      `${tradesToday} trade(s) today, ${todayEntries.filter((j) => j.kind === "SKIP").length} skip(s), ${todayEntries.filter((j) => j.kind === "VETO").length} AI veto(es).`,
      "",
      ...lines,
    ].join("\n"),
    color: combRet >= 0 ? COLORS.green : COLORS.amber,
  });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
