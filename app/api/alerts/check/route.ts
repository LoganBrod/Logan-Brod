import { NextResponse } from "next/server";
import { checkRule, formatAlertMessage, listRules, type CheckOutcome } from "@/lib/alerts";
import { redisConfigured } from "@/lib/redis";
import { sendDiscordAlert, discordConfigured } from "@/lib/discord";

// Called by Vercel Cron (see vercel.json) and by the "Run check now" button on /alerts.
// When CRON_SECRET is set, Vercel sends it as a Bearer token on cron requests; a request
// that presents an Authorization header must match it. Requests without the header
// (manual runs from the UI) are allowed — firing is rate-limited by per-rule cooldowns.

export const maxDuration = 60;

export interface CheckResponse {
  checked: number;
  fired: number;
  notified: number;
  outcomes: CheckOutcome[];
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!redisConfigured()) {
    return NextResponse.json(
      { error: "Redis is not configured — add Upstash Redis to the Vercel project first." },
      { status: 503 }
    );
  }

  try {
    const rules = await listRules();
    const outcomes: CheckOutcome[] = [];
    let notified = 0;

    // Sequential to stay friendly to third-party rate limits (Reddit, balldontlie).
    for (const rule of rules) {
      const outcome = await checkRule(rule);
      outcomes.push(outcome);

      if (outcome.fired && discordConfigured()) {
        const ok = await sendDiscordAlert(formatAlertMessage(outcome)).catch(() => false);
        if (ok) notified++;
      }
    }

    const fired = outcomes.filter((o) => o.fired).length;
    return NextResponse.json(
      { checked: outcomes.length, fired, notified, outcomes } satisfies CheckResponse,
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
