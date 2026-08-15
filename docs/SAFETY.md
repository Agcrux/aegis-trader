# Safety contract

Plain-English promises the code keeps. If any of these is ever untrue, that is a bug to fix
before anything else.

1. **No live money in this build.** Every order routes to the internal simulator, Alpaca's
   paper environment, or OANDA's practice environment. The broker layer rejects LIVE-mode
   orders outright (`src/lib/brokers/index.ts`).
2. **One chokepoint.** No code path places an order without `evaluateEntry`/`evaluateExit`
   approval from `src/lib/risk.ts`.
3. **Personal control only.** Only an account's owner (verified session) can change its mode,
   caps, or Discord link. The other owner sees everything, controls nothing of yours.
4. **The circuit breaker is real.** At the configured drawdown from peak (default and ceiling:
   30%), the account freezes itself, tells Discord why, and stays frozen until its owner types
   RESTART on the dashboard.
5. **Daily brakes.** Daily loss cap and max-trades-per-day are enforced before any entry.
6. **Caps cannot be quietly loosened.** The server clamps every submitted cap to the vision's
   ceilings regardless of what the UI sends.
7. **The 30-day paper gate is server-side.** The LIVE transition is rejected until the account
   has 30 paper days with zero engine errors in the window — and requires typing
   `GO LIVE <account label>`.
8. **Everything is journaled.** Trades, skips, vetoes, freezes, cap edits, mode changes — with
   timestamps and plain-English reasons. Silence is not an option.
9. **Fail-soft ordering.** Discord failures never affect trading; AI-layer failures never
   block the backtested rules (and are disclosed in the journal); data-feed failures skip the
   symbol rather than guess.
10. **Secrets stay yours.** API keys live in Vercel environment variables that owners paste
    themselves. The repo is public; nothing secret is ever committed.
11. **Tester sandboxes are sealed off.** A tester session can only read and write its own cookie
    (`src/lib/paper/*`): no database row, no broker call, no owner data, and no access to the
    real engine, journal, backtests or system settings. Its trades pass through the same risk
    chokepoint and pay the same slippage, so the numbers stay honest — but the money is play
    money, and "potential earnings" is labelled as exactly that everywhere it appears.
12. **Owner sessions need a real secret.** Sessions are signed HS256 cookies. Owner sign-in is
    refused unless `AUTH_SECRET` is set; only tester sandboxes fall back to a key derived from
    the database URL, so a half-configured deployment can never mint an owner session.
