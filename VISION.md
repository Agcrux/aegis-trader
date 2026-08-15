# Aegis Trader — Project Vision

> AI-readable master spec. A fresh session reading this file should understand the entire
> project without the owners re-explaining anything. Keep it updated when decisions change.

## 1. Goal and honest framing

Two US-based owners (family) want an AI-assisted system that trades for them with the goal of
being **profitable after all costs within 12 months** — measured against the honest benchmark
of just buying and holding SPY. Everyone involved understands: no system guarantees profits,
most retail strategies lose after costs, and the first months are about **proving the machine,
not the income**. The system is built to say so out loud when the numbers are bad.

**Not financial advice. The software executes widely known systematic rules; owners make all
money decisions.**

## 2. The people and the legal structure

- Exactly **2 owner seats** (user + one family member/friend), both in the US, both 18+.
- **Own accounts, shared system**: each owner has their own brokerage/practice accounts and
  their own $25 starting capital ("prove it first, then deposit more"). No pooled money —
  pooling would raise investment-adviser registration issues; if ever wanted, consult a
  securities lawyer first.
- Full transparency: both owners see both accounts. **Control is personal**: only an account's
  owner can change its mode, caps, or kill switch. No exceptions, including the operator.

## 3. What it trades (decided)

| Leg | Status at $25/account | Detail |
|---|---|---|
| US stocks & ETFs | **Active day one** | Fractional swing trades (days–weeks), zero-commission venue |
| Spot forex (majors) | **Active day one** | Swing trend-following, spread-only cost model |
| Options income | **Built dormant** | Auto-unlocks per account at **$2,000** equity (covered calls / cash-secured puts need 100-share lots). Executor ships in a later stage |
| Futures | **Built dormant** | Auto-unlocks per account at **$5,000** equity (overnight margin). Executor ships in a later stage |

Watchlist: SPY QQQ IWM DIA XLK XLE XLF XLV GLD TLT AAPL MSFT NVDA AMZN GOOGL META.
FX: EURUSD GBPUSD USDJPY AUDUSD. Crypto: explicitly out of scope.

## 4. How decisions are made (decided)

**Quant signals + AI judgment layer:**
1. Deterministic daily-bar strategies generate candidates:
   - `trend_momentum` — hold the top-3 momentum names (63-day return) that are above a rising
     trend filter; rotate out on trend break.
   - `rsi2_meanrev` — buy 2-day-RSI<10 dips on broad ETFs above their 200-day average; exit
     RSI>65.
   - `fx_trend` — long majors when 20-day SMA > 50-day SMA; exit on cross-back. Long-or-flat.
2. The **risk engine** (single chokepoint, `src/lib/risk.ts`) applies caps/gates — nothing
   trades without its approval.
3. **Claude (Haiku tier) vets** each surviving entry, may veto, and writes the plain-English
   rationale. Fail-open: if the AI layer is down, backtested rules proceed alone and the
   journal says so. A veto is always respected. (Optional: off until ANTHROPIC_API_KEY is set.)
4. Every decision — including "no trade" and every block/veto — is **journaled with what /
   when / why** and mirrored to Discord.

## 5. Guardrails (decided; enforced in code)

- Modes per account: `OFF → PAPER → LIVE`. Everyone starts in PAPER.
- **Paper gate: 30 clean days** (zero engine errors in the window) before LIVE is even
  accepted, then the owner must type `GO LIVE <label>`. **This build contains no live
  execution path at all** — brokers refuse LIVE orders; the live stage ships separately and
  gets its own approval.
- Default caps (owner-editable, server-clamped): max 20%/position, 5 positions, 5% daily loss
  stop, **30% drawdown freeze** (master circuit breaker — the vision's ceiling), 6 trades/day.
- Dormant-leg thresholds as in §3. Backtest gate: a strategy must beat buy-and-hold SPY over
  ~5 years net of costs (Strategy Lab) before it earns standing for real money.
- Kill switch: dashboard button + Discord `/pause` (per-owner via linked Discord user ID).

## 6. Architecture (decided)

- **Next.js (React) on Vercel** — phone-first dashboard + all API routes. Public repo:
  `github.com/Agcrux/aegis-trader`.
- **Neon Postgres** (Vercel Marketplace free tier) — schema auto-bootstraps; without
  DATABASE_URL the site runs in read-only **demo mode** with sample data.
- **Engine** = serverless tick (`/api/engine/tick`), triggered by **GitHub Actions cron**
  (free, every 30 min in market hours + 2-hourly) with Vercel cron as daily backup. Secured by
  CRON_SECRET.
- **Data**: Stooq daily CSV (free, keyless) for stocks + FX + 5-year backtests.
- **Brokers**: internal simulator by default (instant fills + slippage haircut); Alpaca
  **paper** and OANDA **practice** adapters activate when owners add their own keys. Live
  endpoints intentionally absent in v1.
- **Discord**: webhook for cards/summaries; HTTP-interactions endpoint for slash commands (no
  bot process).
- **Auth**: 2-seat invite-code registration, bcrypt + signed-JWT session cookie.
- **Cost**: $0/month design (free tiers everywhere); optional Claude vetting = pennies.

## 7. Working agreements

- Owners handle their own credentials/API keys — the AI assistant never touches them.
- Plain-language explanations; the operator may not be technical.
- Honest reporting always: failures, drawdowns, and "the index fund is winning" included.
- Scale-up = explicit owner deposits at milestones, never automatic.

## 8. Roadmap

- **Stage 1 (this build)**: everything above, paper-only. → Deploy, connect DB, both owners
  join, engine runs on schedule, 30-day paper month begins.
- Stage 2: reconciliation against Alpaca/OANDA paper fills; richer FX data; news feed into the
  AI vet; weekly deep review (Sonnet-tier) posted to Discord.
- Stage 3: live-execution stage (small real money) — new broker endpoints, per-order broker-side
  protective stops, deposit milestones; requires the paper month + explicit owner approval.
- Stage 4: options-income executor (auto-unlocks ≥$2k); later futures (≥$5k).
