import { ensureSchema, getSql, newId } from "./db";
import type { JournalKind } from "./types";
import { COLORS, notifyDiscord } from "./discord";

/**
 * The explainable trade journal — the product's soul per VISION.md.
 * Every entry records WHAT happened, WHEN (timestamped), and WHY in plain
 * English, and mirrors to Discord so both owners' phones see it.
 */

export interface JournalInput {
  accountId: string | null;
  kind: JournalKind;
  symbol?: string | null;
  title: string;
  what: string;
  why: string;
  data?: Record<string, unknown>;
  discord?: boolean;
  accountLabel?: string;
}

const KIND_COLOR: Record<JournalKind, number> = {
  TRADE: COLORS.green,
  SKIP: COLORS.slate,
  VETO: COLORS.violet,
  RISK: COLORS.red,
  INFO: COLORS.slate,
  SYSTEM: COLORS.amber,
};

export async function writeJournal(input: JournalInput): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`INSERT INTO journal (id, account_id, kind, symbol, title, what, why, data)
    VALUES (${newId("jr")}, ${input.accountId}, ${input.kind}, ${input.symbol ?? null},
      ${input.title}, ${input.what}, ${input.why},
      ${input.data ? JSON.stringify(input.data) : null}::jsonb)`;

  if (input.discord) {
    await notifyDiscord({
      title: `${input.kind === "TRADE" ? "" : `[${input.kind}] `}${input.title}`,
      description: `**What:** ${input.what}\n**Why:** ${input.why}`,
      color: KIND_COLOR[input.kind],
      fields: input.accountLabel ? [{ name: "Account", value: input.accountLabel }] : [],
    });
  }
}
