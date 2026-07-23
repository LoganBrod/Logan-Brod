// Discord webhook notifications. Create a webhook in your server
// (Server Settings → Integrations → Webhooks) and set DISCORD_WEBHOOK_URL.

export function discordConfigured(): boolean {
  return Boolean(process.env.DISCORD_WEBHOOK_URL);
}

export async function sendDiscordAlert(content: string): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, username: "Card Tools Alerts" }),
    cache: "no-store",
  });

  return res.ok;
}
