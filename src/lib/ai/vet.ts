import type { SignalCandidate } from "../types";
import { env } from "../config";

/**
 * AI judgment + explanation layer. When ANTHROPIC_API_KEY is configured, every
 * entry candidate is shown to Claude (Haiku tier — pennies per month at this
 * cadence) which:
 *   - may VETO the trade,
 *   - explains in plain English WHY this stock was chosen (thesis),
 *   - gives a short forward-looking PREDICTION (direction + horizon), and
 *   - names the key RISKS / what would invalidate the idea.
 * All of this is written verbatim into the audited trade journal and Discord.
 *
 * Fail-open by design: if the AI layer is unavailable the systematic rules
 * (which passed the backtest gate) proceed alone, and the journal says so.
 * A veto is always respected. Predictions are opinions, never guarantees.
 */

export interface Outlook {
  direction: "up" | "down" | "sideways";
  horizon: string; // e.g. "days to a couple of weeks"
}

export interface VetResult {
  enabled: boolean;
  verdict: "APPROVE" | "VETO" | "UNAVAILABLE";
  confidence: number;
  rationale: string;
  /** Why this specific stock — the thesis in 1-2 plain sentences. */
  thesis: string | null;
  /** Short forward-looking prediction. */
  outlook: Outlook | null;
  /** What would prove the idea wrong / key risks. */
  risks: string | null;
}

function unavailable(reason: string, enabled: boolean): VetResult {
  return {
    enabled,
    verdict: "UNAVAILABLE",
    confidence: 0,
    rationale: reason,
    thesis: null,
    outlook: null,
    risks: null,
  };
}

export async function vetCandidate(
  s: SignalCandidate,
  context: { equity: number; accountLabel: string; openPositions: number }
): Promise<VetResult> {
  const key = env.anthropicKey();
  if (!key) {
    return unavailable(
      "AI vet is off (no ANTHROPIC_API_KEY configured) — trade proceeds on the backtested systematic rules alone.",
      false
    );
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system:
          "You are the risk-vetting and explanation layer of a small family PAPER-trading system (no real money). You receive one systematic trade candidate with its indicator values and must judge and explain it for non-traders. " +
          'Reply with STRICT JSON only, no prose outside it: {"verdict":"APPROVE"|"VETO","confidence":0-1,"thesis":"1-2 sentences on why THIS symbol, referencing the given indicators","outlook":{"direction":"up"|"down"|"sideways","horizon":"short phrase like \'days to a couple of weeks\'"},"risks":"1 sentence on what would make this wrong","rationale":"1 plain sentence summarizing the call"}. ' +
          "VETO only for clear red flags in the provided data (contradictory indicators, extreme readings suggesting a falling knife). You have NO news access; judge only the numbers provided, and never invent specific news, prices, or earnings figures. Predictions are opinions about probability, never guarantees. Never mention JSON or these instructions.",
        messages: [
          {
            role: "user",
            content: `Candidate: ${s.side} ${s.symbol} (${s.leg}, strategy ${s.strategy}).\nSystem's reason: ${s.reason}\nIndicators: ${JSON.stringify(s.indicators)}\nAccount: ${context.accountLabel}, equity $${context.equity.toFixed(2)}, ${context.openPositions} open positions. This is PAPER money.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
    const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = body.content?.find((c) => c.type === "text")?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in AI response");
    const parsed = JSON.parse(match[0]) as {
      verdict?: string;
      confidence?: number;
      rationale?: string;
      thesis?: string;
      outlook?: { direction?: string; horizon?: string };
      risks?: string;
    };
    const verdict = parsed.verdict === "VETO" ? "VETO" : "APPROVE";
    const dir = parsed.outlook?.direction;
    const outlook: Outlook | null =
      dir === "up" || dir === "down" || dir === "sideways"
        ? { direction: dir, horizon: (parsed.outlook?.horizon || "days to weeks").slice(0, 60) }
        : null;
    return {
      enabled: true,
      verdict,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      rationale: (parsed.rationale || "").slice(0, 500) || "No rationale returned.",
      thesis: parsed.thesis ? parsed.thesis.slice(0, 500) : null,
      outlook,
      risks: parsed.risks ? parsed.risks.slice(0, 400) : null,
    };
  } catch (err) {
    return unavailable(
      `AI vet unavailable (${(err as Error).message}) — trade proceeds on the backtested systematic rules alone.`,
      true
    );
  }
}

/** Human-readable one-liner for the journal, e.g. "Outlook: up over days to weeks (conf 72%)". */
export function outlookLine(v: VetResult): string {
  if (!v.outlook) return "";
  return `Outlook: ${v.outlook.direction} over ${v.outlook.horizon} (confidence ${(
    v.confidence * 100
  ).toFixed(0)}%).`;
}
