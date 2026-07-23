import { NextResponse } from "next/server";
import { addRule, getRuleState, listRules, removeRule, type AlertRule } from "@/lib/alerts";
import { redisConfigured } from "@/lib/redis";
import { discordConfigured } from "@/lib/discord";

export interface RuleWithState {
  rule: AlertRule;
  lastCheckedAt?: string;
  lastFiredAt?: string;
  lastValue?: string;
}

export interface RulesResponse {
  configured: { redis: boolean; discord: boolean };
  rules: RuleWithState[];
}

export async function GET() {
  const configured = { redis: redisConfigured(), discord: discordConfigured() };
  if (!configured.redis) {
    return NextResponse.json({ configured, rules: [] } satisfies RulesResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const rules = await listRules();
    const withState: RuleWithState[] = await Promise.all(
      rules.map(async (rule) => {
        const state = await getRuleState(rule.id).catch(() => null);
        return {
          rule,
          lastCheckedAt: state?.lastCheckedAt,
          lastFiredAt: state?.lastFiredAt,
          lastValue: state?.lastValue,
        };
      })
    );
    return NextResponse.json({ configured, rules: withState } satisfies RulesResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!redisConfigured()) {
    return NextResponse.json(
      { error: "Redis is not configured — add Upstash Redis to the Vercel project first." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const type = body.type;
  const player = typeof body.player === "string" ? body.player.trim() : "";
  if (!player) {
    return NextResponse.json({ error: "player is required" }, { status: 400 });
  }

  const base = { id: crypto.randomUUID(), player, createdAt: new Date().toISOString() };
  let rule: AlertRule;

  if (type === "buzz_spike") {
    const spikePct = Number(body.spikePct);
    rule = {
      ...base,
      type: "buzz_spike",
      spikePct: Number.isFinite(spikePct) && spikePct > 0 ? spikePct : 100,
    };
  } else if (type === "nba_breakout") {
    const deltaThreshold = Number(body.deltaThreshold);
    rule = {
      ...base,
      type: "nba_breakout",
      deltaThreshold: Number.isFinite(deltaThreshold) && deltaThreshold > 0 ? deltaThreshold : 5,
    };
  } else {
    return NextResponse.json(
      { error: 'type must be "buzz_spike" or "nba_breakout"' },
      { status: 400 }
    );
  }

  try {
    await addRule(rule);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }

  try {
    const removed = await removeRule(id);
    if (!removed) return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
