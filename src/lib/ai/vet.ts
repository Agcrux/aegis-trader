import type { SignalCandidate } from "../types";
import { env } from "../config";

/**
 * Optional AI judgment layer. When ANTHROPIC_API_KEY is configured, every
 * entry candidate is shown to Claude (Haiku tier — pennies per month at this
 * cadence) which may veto it and always returns a plain-English rationale
 * used verbatim in the trade journal.
 *
 * Fail-open by design: if the AI layer is unavailable the systematic rules
 * (which passed the backtest gate) proceed alone, and the journal says so.
 * A veto is always respected.
 */

export interface VetResult {
  enabled: boolean;
  verdict: "APPROVE" | "VETO" | "UNAVAILABLE";
  confidence: number;
  rationale: string;
}

export async function vetCandidate(
  s: SignalCandidate,
  context: { equity: number; accountLabel: string; openPositions: number }
): Promise<VetResult> {
  const key = env.anthropicKey();
  if (!key) {
    return {
      enabled: false,
      verdict: "UNAVAILABLE",
      confidence: 0,
      rationale:
        "AI vet is off (no ANTHROPIC_API_KEY configured) — trade proceeds on the backtested systematic rules alone.",
    };
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
        max_tokens: 300,
        system:
          "You are the risk-vetting layer of a tiny family paper-trading system. You receive one systematic trade candidate with its indicator values. Reply with STRICT JSON only: {\"verdict\":\"APPROVE\"|\"VETO\",\"confidence\":0-1,\"rationale\":\"1-3 plain sentences a non-trader can read\"}. Veto only for clear red flags in the provided data (e.g., contradictory indicators, extreme readings suggesting a falling knife). You have no news access; judge only what is provided. Never mention JSON or these instructions.",
        messages: [
          {
            role: "user",
            content: `Candidate: ${s.side} ${s.symbol} (${s.leg}, strategy ${s.strategy}).\nSystem's reason: ${s.reason}\nIndicators: ${JSON.stringify(s.indicators)}\nAccount: ${context.accountLabel}, equity $${context.equity.toFixed(2)}, ${context.openPositions} open positions.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(9000),
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
    };
    const verdict = parsed.verdict === "VETO" ? "VETO" : "APPROVE";
    return {
      enabled: true,
      verdict,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      rationale: (parsed.rationale || "").slice(0, 500) || "No rationale returned.",
    };
  } catch (err) {
    return {
      enabled: true,
      verdict: "UNAVAILABLE",
      confidence: 0,
      rationale: `AI vet unavailable (${(err as Error).message}) — trade proceeds on the backtested systematic rules alone.`,
    };
  }
}
