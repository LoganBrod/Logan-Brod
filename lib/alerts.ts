// Alert engine: rule storage in Redis, per-rule evaluators, Discord notifications.
// Designed so new rule types (deal alerts, market-dip alerts, …) can be added by
// extending the AlertRule union and the evaluate() switch.

import { getJson, setJson, deleteKey } from "./redis";
import { searchRedditMentions } from "./reddit";
import { getPlayerTrend } from "./nba";

const RULES_KEY = "alerts:rules";
const stateKey = (id: string) => `alerts:state:${id}`;

export interface BuzzSpikeRule {
  id: string;
  type: "buzz_spike";
  player: string;
  // Fire when today's mention count is at least (1 + spikePct/100) × the trailing daily average.
  spikePct: number;
  createdAt: string;
}

export interface NbaBreakoutRule {
  id: string;
  type: "nba_breakout";
  player: string;
  // Fire when last-10-games PPG minus season PPG crosses this threshold upward.
  deltaThreshold: number;
  createdAt: string;
}

export type AlertRule = BuzzSpikeRule | NbaBreakoutRule;

interface RuleState {
  // buzz_spike: rolling daily mention counts (newest last, max 14 days)
  history?: Array<{ date: string; count: number }>;
  // nba_breakout: whether the delta was above threshold on the last check
  aboveThreshold?: boolean;
  lastFiredAt?: string;
  lastCheckedAt?: string;
  lastValue?: string;
}

export interface CheckOutcome {
  ruleId: string;
  type: AlertRule["type"];
  player: string;
  fired: boolean;
  detail: string;
  error?: string;
}

const BUZZ_COOLDOWN_MS = 48 * 60 * 60 * 1000;
const MIN_MENTIONS_TO_FIRE = 5;
const MIN_HISTORY_DAYS = 3;

export async function listRules(): Promise<AlertRule[]> {
  return (await getJson<AlertRule[]>(RULES_KEY)) ?? [];
}

export async function addRule(rule: AlertRule): Promise<void> {
  const rules = await listRules();
  rules.push(rule);
  await setJson(RULES_KEY, rules);
}

export async function removeRule(id: string): Promise<boolean> {
  const rules = await listRules();
  const next = rules.filter((r) => r.id !== id);
  if (next.length === rules.length) return false;
  await setJson(RULES_KEY, next);
  await deleteKey(stateKey(id)).catch(() => {});
  return true;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function evaluateBuzzSpike(rule: BuzzSpikeRule, state: RuleState): Promise<CheckOutcome> {
  const mentions = await searchRedditMentions(`"${rule.player}"`, 100, "day");
  const count = mentions.length;
  const today = todayUtc();

  const history = (state.history ?? []).filter((h) => h.date !== today);
  const priorAvg =
    history.length > 0 ? history.reduce((sum, h) => sum + h.count, 0) / history.length : 0;

  state.history = [...history, { date: today, count }].slice(-14);
  state.lastValue = `${count} mentions today vs ${priorAvg.toFixed(1)}/day trailing avg`;

  const cooledDown =
    !state.lastFiredAt || Date.now() - new Date(state.lastFiredAt).getTime() > BUZZ_COOLDOWN_MS;

  const fired =
    history.length >= MIN_HISTORY_DAYS &&
    count >= MIN_MENTIONS_TO_FIRE &&
    count >= priorAvg * (1 + rule.spikePct / 100) &&
    cooledDown;

  return {
    ruleId: rule.id,
    type: rule.type,
    player: rule.player,
    fired,
    detail:
      history.length < MIN_HISTORY_DAYS
        ? `${state.lastValue} — building baseline (${history.length}/${MIN_HISTORY_DAYS} days)`
        : state.lastValue,
  };
}

async function evaluateNbaBreakout(rule: NbaBreakoutRule, state: RuleState): Promise<CheckOutcome> {
  const trend = await getPlayerTrend(rule.player);
  if (!trend) {
    return {
      ruleId: rule.id,
      type: rule.type,
      player: rule.player,
      fired: false,
      detail: "No stats found for this player",
      error: "player_not_found",
    };
  }

  const delta = trend.recentAvgPts - trend.priorAvgPts;
  const above = delta >= rule.deltaThreshold;
  const wasAbove = state.aboveThreshold ?? false;

  state.lastValue = `${trend.name}: last ${trend.recentGames} games ${trend.recentAvgPts.toFixed(1)} PPG vs ${trend.priorAvgPts.toFixed(1)} season (${delta >= 0 ? "+" : ""}${delta.toFixed(1)})`;
  state.aboveThreshold = above;

  // Fire on the upward transition only, so a sustained hot streak pings once.
  const fired = above && !wasAbove;

  return { ruleId: rule.id, type: rule.type, player: rule.player, fired, detail: state.lastValue };
}

export async function checkRule(rule: AlertRule): Promise<CheckOutcome> {
  const state = (await getJson<RuleState>(stateKey(rule.id))) ?? {};

  let outcome: CheckOutcome;
  try {
    outcome =
      rule.type === "buzz_spike"
        ? await evaluateBuzzSpike(rule, state)
        : await evaluateNbaBreakout(rule, state);
  } catch (err) {
    return {
      ruleId: rule.id,
      type: rule.type,
      player: rule.player,
      fired: false,
      detail: "Check failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  state.lastCheckedAt = new Date().toISOString();
  if (outcome.fired) state.lastFiredAt = state.lastCheckedAt;
  await setJson(stateKey(rule.id), state);

  return outcome;
}

export async function getRuleState(id: string): Promise<RuleState | null> {
  return getJson<RuleState>(stateKey(id));
}

export function formatAlertMessage(outcome: CheckOutcome): string {
  const emoji = outcome.type === "buzz_spike" ? "📈" : "🏀";
  const title = outcome.type === "buzz_spike" ? "Buzz spike" : "NBA breakout";
  return `${emoji} **${title}: ${outcome.player}**\n${outcome.detail}`;
}
