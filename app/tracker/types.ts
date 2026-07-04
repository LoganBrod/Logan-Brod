// Data model for the Roobet deal tracker. Everything is stored client-side
// in localStorage (see storage.ts) — one TrackerState holds multiple deal
// "sheets" plus the global daily task board.

export type RewardKind = "deposit-bonus" | "lossback" | "custom";
export type RewardFrequency =
  | "per-deposit"
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "one-time";
export type LeaderboardFrequency = "weekly" | "biweekly" | "monthly" | "one-time";

export interface RewardType {
  id: string;
  name: string;
  kind: RewardKind;
  /** e.g. 10 for a 10% lossback / 100% deposit match; null when not % based */
  percent: number | null;
  frequency: RewardFrequency;
  notes: string;
}

export interface RewardEntry {
  id: string;
  date: string; // yyyy-mm-dd
  rewardTypeId: string;
  amount: number;
  notes: string;
}

export interface Leaderboard {
  id: string;
  name: string;
  /** total obligation you pay out per cycle */
  prizePool: number;
  frequency: LeaderboardFrequency;
  endDate: string; // yyyy-mm-dd, "" when open-ended
  notes: string;
}

export interface LeaderboardPayout {
  id: string;
  leaderboardId: string;
  date: string;
  amount: number;
  recipient: string;
  notes: string;
}

export interface DailyEntry {
  id: string;
  date: string;
  deposited: number;
  wagered: number;
  cashout: number;
  notes: string;
}

/** A "sheet" — one deal with its own terms, logs and leaderboards. */
export interface Deal {
  id: string;
  name: string;
  platform: string;
  startDate: string;
  endDate: string;
  dailyCashoutTarget: number;
  notes: string;
  rewardTypes: RewardType[];
  leaderboards: Leaderboard[];
  entries: DailyEntry[];
  rewards: RewardEntry[];
  payouts: LeaderboardPayout[];
  createdAt: number;
}

export interface TaskDef {
  id: string;
  name: string;
}

export interface TrackerState {
  version: 1;
  deals: Deal[];
  activeDealId: string;
  tasks: TaskDef[];
  /** date (yyyy-mm-dd) -> ids of tasks completed that day */
  taskLog: Record<string, string[]>;
}

// ---------- helpers ----------

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtDate(d: string): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------- defaults ----------

export function defaultRewardTypes(): RewardType[] {
  return [
    {
      id: uid(),
      name: "Deposit Bonus",
      kind: "deposit-bonus",
      percent: 100,
      frequency: "per-deposit",
      notes: "",
    },
    {
      id: uid(),
      name: "Weekly Lossback",
      kind: "lossback",
      percent: 10,
      frequency: "weekly",
      notes: "",
    },
  ];
}

export function newDeal(name: string): Deal {
  return {
    id: uid(),
    name,
    platform: "Roobet",
    startDate: todayStr(),
    endDate: "",
    dailyCashoutTarget: 0,
    notes: "",
    rewardTypes: defaultRewardTypes(),
    leaderboards: [],
    entries: [],
    rewards: [],
    payouts: [],
    createdAt: Date.now(),
  };
}

export function defaultState(): TrackerState {
  const deal = newDeal("Roobet Deal");
  return {
    version: 1,
    deals: [deal],
    activeDealId: deal.id,
    tasks: [
      { id: uid(), name: "Stream" },
      { id: uid(), name: "Scout highrollers" },
      { id: uid(), name: "Post X content" },
    ],
    taskLog: {},
  };
}

// ---------- derived stats ----------

export interface DealStats {
  totalCashout: number;
  totalDeposited: number;
  totalWagered: number;
  totalRewards: number;
  totalPayouts: number;
  /** cash in hand: cashouts − deposits − leaderboard payouts */
  netProfit: number;
  daysLogged: number;
}

export function dealStats(deal: Deal): DealStats {
  const totalCashout = deal.entries.reduce((s, e) => s + e.cashout, 0);
  const totalDeposited = deal.entries.reduce((s, e) => s + e.deposited, 0);
  const totalWagered = deal.entries.reduce((s, e) => s + e.wagered, 0);
  const totalRewards = deal.rewards.reduce((s, r) => s + r.amount, 0);
  const totalPayouts = deal.payouts.reduce((s, p) => s + p.amount, 0);
  return {
    totalCashout,
    totalDeposited,
    totalWagered,
    totalRewards,
    totalPayouts,
    netProfit: totalCashout - totalDeposited - totalPayouts,
    daysLogged: new Set(deal.entries.map((e) => e.date)).size,
  };
}

export interface SeriesPoint {
  date: string;
  value: number;
}

/** Cumulative net profit by date (cashouts − deposits − payouts). */
export function cumulativeProfitSeries(deal: Deal): SeriesPoint[] {
  const byDate = new Map<string, number>();
  for (const e of deal.entries) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.cashout - e.deposited);
  }
  for (const p of deal.payouts) {
    byDate.set(p.date, (byDate.get(p.date) ?? 0) - p.amount);
  }
  const dates = Array.from(byDate.keys()).sort();
  let running = 0;
  return dates.map((date) => {
    running += byDate.get(date)!;
    return { date, value: running };
  });
}
