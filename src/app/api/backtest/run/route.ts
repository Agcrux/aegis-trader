import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { BACKTEST_STRATEGIES, runBacktest } from "@/lib/backtest";
import { ensureSchema, getSql, newId } from "@/lib/db";
import { isDemoMode } from "@/lib/config";
import { writeJournal } from "@/lib/journal";

export const maxDuration = 60;

/** Runs all three strategy backtests and stores the latest results. Owner-triggered. */
export async function POST() {
  if (isDemoMode()) {
    return NextResponse.json(
      { error: "Demo mode: backtests need a database to store results." },
      { status: 403 }
    );
  }
  let user;
  try {
    user = await requireOwner();
  } catch (res) {
    return res as Response;
  }
  await ensureSchema();
  const sql = getSql();

  const results = [];
  const failures: string[] = [];
  for (const strategy of BACKTEST_STRATEGIES) {
    try {
      const bt = await runBacktest(strategy);
      await sql`INSERT INTO backtests (id, strategy, market, years, params, result, passed)
        VALUES (${newId("bt")}, ${bt.strategy}, ${bt.market}, ${bt.years},
          ${JSON.stringify(bt.params)}::jsonb, ${JSON.stringify(bt.result)}::jsonb, ${bt.passed})`;
      results.push(bt);
    } catch (err) {
      failures.push(`${strategy}: ${(err as Error).message}`);
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  await writeJournal({
    accountId: null,
    kind: "SYSTEM",
    title: `Backtests run by ${user.name}`,
    what: `${results.length} strategies tested over ~5 years; ${passedCount} passed the beat-buy-and-hold gate.${failures.length ? ` Failures: ${failures.join("; ")}` : ""}`,
    why: "Strategies that fail the multi-year gate are advisory-only: the engine reports their signals in the journal context but the risk chokepoint reduces their standing (v1 keeps all three running on paper for evidence-gathering — live promotion in a later stage will require the gate).",
    discord: true,
  });

  return NextResponse.json({ ok: true, results, failures });
}
