"use client";

import {
  Deal,
  TaskDef,
  TrackerState,
  cumulativeProfitSeries,
  dealStats,
  fmtDate,
  fmtMoney,
  todayStr,
} from "../types";
import { Card, Meter, StatTile } from "./ui";
import ProfitChart from "./ProfitChart";

export default function Dashboard({
  deal,
  tasks,
  taskLog,
}: {
  deal: Deal;
  tasks: TaskDef[];
  taskLog: TrackerState["taskLog"];
}) {
  const stats = dealStats(deal);
  const series = cumulativeProfitSeries(deal);
  const today = todayStr();

  const todayCashout = deal.entries
    .filter((e) => e.date === today)
    .reduce((s, e) => s + e.cashout, 0);
  const doneToday = (taskLog[today] ?? []).filter((id) =>
    tasks.some((t) => t.id === id)
  ).length;

  const rewardTotals = deal.rewardTypes
    .map((rt) => ({
      rt,
      total: deal.rewards
        .filter((r) => r.rewardTypeId === rt.id)
        .reduce((s, r) => s + r.amount, 0),
    }))
    .filter((x) => x.total > 0);

  return (
    <div className="space-y-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1">
          <StatTile
            label="Net Profit"
            value={fmtMoney(stats.netProfit)}
            sub="cashouts − deposits − leaderboards"
            tone={stats.netProfit >= 0 ? "good" : "bad"}
            hero
          />
        </div>
        <StatTile label="Cashed Out" value={fmtMoney(stats.totalCashout)} />
        <StatTile label="Deposited" value={fmtMoney(stats.totalDeposited)} />
        <StatTile
          label="Rewards Received"
          value={fmtMoney(stats.totalRewards)}
          sub="bonus + lossback value"
        />
        <StatTile
          label="Leaderboards Paid"
          value={fmtMoney(stats.totalPayouts)}
        />
      </div>

      {/* Today strip */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card title="Today's cashout" subtitle={fmtDate(today)}>
          {deal.dailyCashoutTarget > 0 ? (
            <>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-white font-bold text-lg">
                  {fmtMoney(todayCashout)}
                </span>
                <span className="text-gray-500 text-sm">
                  of {fmtMoney(deal.dailyCashoutTarget)} daily allowance
                </span>
              </div>
              <Meter
                value={todayCashout}
                max={deal.dailyCashoutTarget}
                color={todayCashout >= deal.dailyCashoutTarget ? "#0ca30c" : "#3987e5"}
              />
            </>
          ) : (
            <p className="text-gray-500 text-sm">
              {todayCashout > 0
                ? `${fmtMoney(todayCashout)} cashed out today.`
                : "Nothing cashed out yet today."}{" "}
              Set a daily cashout allowance in Deal Settings to track it here.
            </p>
          )}
        </Card>

        <Card title="Today's tasks">
          {tasks.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No tasks yet — add some in the Tasks tab.
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-white font-bold text-lg">
                  {doneToday} / {tasks.length}
                </span>
                <span className="text-gray-500 text-sm">completed</span>
              </div>
              <Meter
                value={doneToday}
                max={tasks.length}
                color={doneToday >= tasks.length ? "#0ca30c" : "#3987e5"}
              />
            </>
          )}
        </Card>
      </div>

      {/* Profit chart */}
      <Card
        title="Cumulative net profit"
        subtitle={`${stats.daysLogged} day${stats.daysLogged === 1 ? "" : "s"} logged · total wagered ${fmtMoney(stats.totalWagered)}`}
      >
        <ProfitChart series={series} />
      </Card>

      {/* Rewards + leaderboard summaries */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card title="Rewards breakdown">
          {rewardTotals.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No rewards claimed yet. Log deposit bonuses and lossback in the
              Rewards tab.
            </p>
          ) : (
            <ul className="space-y-2">
              {rewardTotals.map(({ rt, total }) => (
                <li
                  key={rt.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-300">{rt.name}</span>
                  <span className="text-white font-semibold">
                    {fmtMoney(total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Leaderboard obligations">
          {deal.leaderboards.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No leaderboards set up. Add them in the Leaderboards tab.
            </p>
          ) : (
            <ul className="space-y-3">
              {deal.leaderboards.map((lb) => {
                const paid = deal.payouts
                  .filter((p) => p.leaderboardId === lb.id)
                  .reduce((s, p) => s + p.amount, 0);
                return (
                  <li key={lb.id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-300">{lb.name}</span>
                      <span className="text-white font-semibold">
                        {fmtMoney(paid)}
                        <span className="text-gray-500 font-normal">
                          {" "}
                          / {fmtMoney(lb.prizePool)}
                        </span>
                      </span>
                    </div>
                    <Meter value={paid} max={lb.prizePool} color="#eb6834" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
