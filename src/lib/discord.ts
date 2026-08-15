import { env } from "./config";

/**
 * Outbound Discord via a plain webhook — free, no bot process needed.
 * Every send is fail-soft: a Discord outage must never affect trading logic.
 */

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordCard {
  title: string;
  description: string;
  color?: number;
  fields?: EmbedField[];
}

export const COLORS = {
  green: 0x22c55e,
  red: 0xef4444,
  amber: 0xf59e0b,
  slate: 0x64748b,
  violet: 0x8b5cf6,
};

export async function notifyDiscord(card: DiscordCard): Promise<boolean> {
  const url = env.discordWebhook();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "Aegis Trader",
        embeds: [
          {
            title: card.title.slice(0, 250),
            description: card.description.slice(0, 3500),
            color: card.color ?? COLORS.slate,
            fields: (card.fields ?? []).slice(0, 12).map((f) => ({
              name: f.name.slice(0, 250),
              value: f.value.slice(0, 1000),
              inline: f.inline ?? true,
            })),
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
