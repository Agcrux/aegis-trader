# Aegis Trader

**Live:** https://aegis-trader-two.vercel.app
*(Note: the similarly named `aegis-trader.vercel.app` is an unrelated third-party site.)*

A guardrails-first, explainable paper-trading system for two family accounts. Systematic swing
strategies scan US stocks/ETFs and major forex pairs; an optional Claude judgment layer vets
every entry; and **every decision is journaled with what, when, and why** — mirrored to
Discord. Hard spending caps, a drawdown circuit breaker, a 30-day paper gate, and a kill
switch in each owner's pocket.

**Honesty first:** nothing here is financial advice, and no system — AI included — can
guarantee trading profits. This build trades **simulated/practice money only**; there is no
live-execution code path at all. The full agreed design lives in [VISION.md](VISION.md), the
promises the code keeps in [docs/SAFETY.md](docs/SAFETY.md).

## What's inside

- **ProTrader Terminal UI on Vercel** — charcoal + neon-green trading terminal (ported from
  `design/landing-reference.html`): a public **live Markets** terminal (real-time index cards,
  live chart, order calculator, market movers), plus phone-first accounts, positions, searchable
  journal, performance vs. buy-and-hold SPY, strategy lab, system health & controls
- **Live, real-time market data** — keyless Yahoo Finance chart API (~30s cache) for quotes,
  charts, and live position marks; Stooq daily data for indicators and backtests. No demo/sample
  data — when no database is connected the app shows a "setup incomplete" state with empty real
  data while market widgets stay live
- **Engine as serverless ticks** — triggered by GitHub Actions cron (free) + Vercel cron
  backup; internal simulator fills, with Alpaca **paper** / OANDA **practice** adapters that
  activate when owners add their own keys
- **Risk engine chokepoint** — per-account caps, daily loss stop, 30% drawdown freeze,
  dormant options/futures legs with equity unlock thresholds
- **Neon Postgres** (free tier) — schema bootstraps itself; without it the site runs a
  read-only demo with sample data
- **Discord** — webhook trade cards + `/status` `/pause` `/resume` slash commands
- **Strategy lab** — ~5-year backtests net of costs vs. SPY; strategies must beat
  doing-nothing to earn standing

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll be in demo mode. Copy `.env.example` to `.env.local` and
fill values to go real; [docs/SETUP.md](docs/SETUP.md) is the click-by-click guide.

## Deploy

Deployed on Vercel from this repo. Setup order: Neon database → owners join with the invite
code → Discord webhook → (optional) Anthropic key → broker practice keys. Again:
[docs/SETUP.md](docs/SETUP.md).

## The rules this system lives by

1. Backtests gate strategies (beat buy-and-hold over ~5 years, net of costs, or no standing).
2. 30 clean days of paper trading before LIVE is even accepted — then the owner must type it.
3. Only an account's owner controls it. Full visibility for both; personal brakes.
4. Every trade explains itself in writing, at the moment it happens.
5. If the index fund is winning, the daily summary says so.
