/**
 * One-time script: registers the /status, /pause, /resume slash commands for
 * your Discord application. Run it yourself with YOUR bot credentials:
 *
 *   DISCORD_APP_ID=xxx DISCORD_BOT_TOKEN=yyy node scripts/register-discord-commands.mjs
 *
 * (Windows PowerShell:  $env:DISCORD_APP_ID="xxx"; $env:DISCORD_BOT_TOKEN="yyy"; node scripts/register-discord-commands.mjs)
 */

const appId = process.env.DISCORD_APP_ID;
const token = process.env.DISCORD_BOT_TOKEN;
if (!appId || !token) {
  console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN environment variables first.");
  process.exit(1);
}

const commands = [
  { name: "status", description: "Show every account's mode, cash, and freeze state" },
  { name: "pause", description: "KILL SWITCH: stop all new trading on YOUR linked account" },
  { name: "resume", description: "Resume paper trading on YOUR linked account" },
];

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: "PUT",
  headers: {
    authorization: `Bot ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(commands),
});

if (!res.ok) {
  console.error(`Failed: HTTP ${res.status}`, await res.text());
  process.exit(1);
}
console.log("Registered commands:", (await res.json()).map((c) => `/${c.name}`).join(" "));
