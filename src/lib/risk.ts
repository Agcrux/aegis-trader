import type { Account, Position, SignalCandidate } from "./types";
import {
  CAP_CEILINGS,
  FUTURES_UNLOCK_EQUITY,
  MIN_ORDER_NOTIONAL,
  OPTIONS_UNLOCK_EQUITY,
  PAPER_GATE_DAYS,
} from "./config";

/**
 * The single chokepoint every trade candidate must pass. No code path may
 * place an order without a RiskVerdict.allowed === true from here.
 * See docs/SAFETY.md for the plain-English contract behind each rule.
 */

export interface RiskContext {
  account: Account;
  equity: number;
  cash: number;
  openPositions: Position[];
  tradesToday: number;
  dayPnlPct: number; // % change vs. today's first snapshot
  price: number;
}

export interface RiskVerdict {
  allowed: boolean;
  blocks: string[];
  notionalUsd: number;
  qty: number;
}

export function evaluateEntry(c: RiskContext, s: SignalCandidate): RiskVerdict {
  const blocks: string[] = [];
  const { account, equity } = c;
  const caps = account.caps;

  if (account.mode === "OFF") blocks.push("Account mode is OFF — trading is paused by its owner.");
  if (account.frozen)
    blocks.push(`Account is FROZEN: ${account.frozenReason ?? "circuit breaker tripped"}.`);

  // Dormant legs — arithmetic reality from VISION.md, not a missing feature.
  if (s.leg === "OPTIONS") {
    blocks.push(
      equity < OPTIONS_UNLOCK_EQUITY
        ? `Options leg is dormant until this account reaches $${OPTIONS_UNLOCK_EQUITY.toLocaleString()} (covered calls need 100-share lots).`
        : "Options leg is unlocked by equity but its executor ships in a later stage."
    );
  }
  if (s.leg === "FUTURES") {
    blocks.push(
      equity < FUTURES_UNLOCK_EQUITY
        ? `Futures leg is dormant until this account reaches $${FUTURES_UNLOCK_EQUITY.toLocaleString()} (overnight margin requirements).`
        : "Futures leg is unlocked by equity but its executor ships in a later stage."
    );
  }

  if (c.dayPnlPct <= -caps.dailyLossPct)
    blocks.push(
      `Daily loss cap hit (${c.dayPnlPct.toFixed(2)}% ≤ -${caps.dailyLossPct}%) — no new trades until tomorrow.`
    );
  if (c.tradesToday >= caps.maxTradesPerDay)
    blocks.push(`Max trades per day reached (${caps.maxTradesPerDay}).`);
  if (c.openPositions.length >= caps.maxPositions)
    blocks.push(`Max open positions reached (${caps.maxPositions}).`);

  // Position sizing: strength-scaled, capped by maxPositionPct and by available cash.
  const capNotional = (caps.maxPositionPct / 100) * equity;
  const target = Math.min(capNotional * Math.max(0.5, Math.min(1, s.strength)), c.cash);
  const notionalUsd = Math.floor(target * 100) / 100;

  if (notionalUsd < MIN_ORDER_NOTIONAL)
    blocks.push(
      `Sized order ($${notionalUsd.toFixed(2)}) is below the $${MIN_ORDER_NOTIONAL} minimum — cash available: $${c.cash.toFixed(2)}.`
    );

  const qty = c.price > 0 ? notionalUsd / c.price : 0;
  return { allowed: blocks.length === 0, blocks, notionalUsd, qty };
}

/** Exits are only blocked when the account has no such position; safety rails never trap a position. */
export function evaluateExit(c: RiskContext, s: SignalCandidate): RiskVerdict {
  const pos = c.openPositions.find((p) => p.leg === s.leg && p.symbol === s.symbol);
  if (!pos) return { allowed: false, blocks: ["No open position to exit."], notionalUsd: 0, qty: 0 };
  return {
    allowed: true,
    blocks: [],
    notionalUsd: pos.qty * c.price,
    qty: pos.qty,
  };
}

export interface FreezeCheck {
  shouldFreeze: boolean;
  reason: string;
}

/** Master circuit breaker: freeze at freezeDrawdownPct below peak equity. */
export function drawdownCheck(account: Account, equity: number): FreezeCheck {
  const peak = Math.max(account.peakEquity, equity);
  const ddPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
  if (!account.frozen && ddPct >= account.caps.freezeDrawdownPct) {
    return {
      shouldFreeze: true,
      reason: `Equity $${equity.toFixed(2)} is ${ddPct.toFixed(1)}% below peak $${peak.toFixed(
        2
      )} — the ${account.caps.freezeDrawdownPct}% circuit breaker freezes this account until its owner reviews and restarts it.`,
    };
  }
  return { shouldFreeze: false, reason: "" };
}

/** Server-side clamp so no request can loosen caps beyond the vision's ceilings. */
export function clampCaps(input: Partial<Record<keyof typeof CAP_CEILINGS, unknown>>) {
  const clamp = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Number(v);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  };
  return {
    maxPositionPct: clamp(input.maxPositionPct, 1, CAP_CEILINGS.maxPositionPct, 20),
    maxPositions: Math.round(clamp(input.maxPositions, 1, CAP_CEILINGS.maxPositions, 5)),
    dailyLossPct: clamp(input.dailyLossPct, 0.5, CAP_CEILINGS.dailyLossPct, 5),
    freezeDrawdownPct: clamp(input.freezeDrawdownPct, 5, CAP_CEILINGS.freezeDrawdownPct, 30),
    maxTradesPerDay: Math.round(clamp(input.maxTradesPerDay, 1, CAP_CEILINGS.maxTradesPerDay, 6)),
  };
}

export interface PaperGate {
  daysDone: number;
  daysRequired: number;
  cleanErrors: number;
  satisfied: boolean;
  detail: string;
}

/** The 30-days-clean gate the user set: time served + zero engine errors in the window. */
export function paperGateStatus(account: Account, errorsInWindow: number): PaperGate {
  const started = account.paperStartedAt ? new Date(account.paperStartedAt).getTime() : null;
  const daysDone = started ? Math.floor((Date.now() - started) / 86400000) : 0;
  const satisfied = daysDone >= PAPER_GATE_DAYS && errorsInWindow === 0;
  return {
    daysDone,
    daysRequired: PAPER_GATE_DAYS,
    cleanErrors: errorsInWindow,
    satisfied,
    detail: satisfied
      ? `Paper gate satisfied: ${daysDone} days on paper with 0 engine errors in the last ${PAPER_GATE_DAYS} days.`
      : `Paper gate not yet satisfied: ${daysDone}/${PAPER_GATE_DAYS} days served${
          errorsInWindow > 0 ? `, ${errorsInWindow} engine error(s) in the window (must be 0)` : ""
        }.`,
  };
}
