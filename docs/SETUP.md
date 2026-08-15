# Setup guide (click-by-click)

The site works in **demo mode** the moment it deploys. Each numbered section below upgrades it
one notch. You (the owners) do these yourselves — especially anything involving passwords or
API keys.

## 1. Database — turns demo mode into real paper trading (~2 minutes)

1. Open your project in the [Vercel dashboard](https://vercel.com/dashboard) → **Storage** tab.
2. **Create Database** → pick **Neon (Postgres)** → accept the free plan defaults → **Connect**.
   Vercel injects `DATABASE_URL` into the project automatically.
3. **Deployments** tab → ⋯ menu on the latest deployment → **Redeploy**.
4. Visit the site: the demo banner is gone. Tables create themselves on first use.

## 2. Claim the two owner seats (~1 minute each)

1. On the site, open **Join with invite code**.
2. Enter the `INVITE_CODE` (the person who deployed has it — it's in Vercel → Settings →
   Environment Variables), your name, email, and a 10+ character password.
3. Your account appears on the dashboard: PAPER mode, $25 simulated, your caps, your kill
   switch. Seat limit is 2 — after that, joining is closed.

## 3. Discord notifications (~5 minutes, free)

1. Create a private Discord server (or use one you have) → channel `#aegis`.
2. Channel settings → **Integrations → Webhooks → New Webhook** → copy the webhook URL.
3. Vercel → Settings → Environment Variables → add `DISCORD_WEBHOOK_URL` = that URL → Redeploy.
4. Trade cards, freezes, and daily summaries now land in the channel (both phones: install
   Discord, enable notifications for that channel).

## 4. Discord kill switch — /pause, /resume, /status (~10 minutes)

1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New
   Application** → name it "Aegis Trader".
2. Copy **Application ID** and **Public Key** from General Information.
3. Vercel env vars → add `DISCORD_PUBLIC_KEY` = the public key → Redeploy.
4. Back in the Discord app settings → General Information → **Interactions Endpoint URL** →
   `https://YOUR-SITE.vercel.app/api/discord/interactions` → Save (Discord verifies it live).
5. **Bot** tab → Reset Token → copy it (keep it private!). On your computer, in the repo
   folder, run:
   ```
   $env:DISCORD_APP_ID="paste-app-id"; $env:DISCORD_BOT_TOKEN="paste-token"; node scripts/register-discord-commands.mjs
   ```
6. Install the app to your server: Installation tab → Install Link → open it → add to your
   server.
7. Each owner: Discord → Settings → Advanced → enable **Developer Mode**, then right-click
   your own name → **Copy User ID** → paste it on the site under **System → your account →
   Discord kill switch → Link**. Now `/pause` stops *your* account only.

## 5. AI judgment layer (optional, ~pennies per month)

1. Create an API key at [console.anthropic.com](https://console.anthropic.com) (set a $5/month
   spend limit there for peace of mind).
2. Vercel env vars → `ANTHROPIC_API_KEY` = the key → Redeploy.
3. From now on Claude vets every entry and its reasoning appears in each journal entry.

## 6. Broker practice environments (optional now, required before Stage 3)

These make paper fills realistic instead of simulated. **Each owner opens their own accounts
and handles their own keys.**

- **Alpaca (stocks)**: sign up free at [alpaca.markets](https://alpaca.markets) → dashboard →
  **Paper** section → generate API key + secret → Vercel env vars `APCA_API_KEY_ID` and
  `APCA_API_SECRET_KEY`.
- **OANDA (forex)**: register at [oanda.com](https://www.oanda.com) → **fxTrade Practice**
  account → Manage API Access → generate token → Vercel env var `OANDA_TOKEN`.

## 7. The schedulers (already wired)

- GitHub Actions (`.github/workflows/engine-tick.yml`) ticks the engine every 30 minutes
  during US market hours and 2-hourly otherwise. It needs two things in the GitHub repo
  (Settings → Secrets and variables → Actions): secret `CRON_SECRET` (same value as Vercel's)
  and variable `TICK_URL` (your site URL, no trailing slash).
- Vercel cron (vercel.json) fires a daily backup tick and the daily summary.

## Where things go if you're ever stuck

- Site not showing changes → Vercel → Deployments → Redeploy.
- Engine appears idle → System page → Engine runs; then GitHub repo → Actions tab.
- Something scary happened → dashboard kill switch or `/pause` in Discord — then read the
  journal; it will explain itself.
