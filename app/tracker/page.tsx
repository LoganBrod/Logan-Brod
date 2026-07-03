"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Deal, TaskDef, TrackerState } from "./types";
import { loadState, saveState } from "./storage";
import Dashboard from "./components/Dashboard";
import DailyLog from "./components/DailyLog";
import Rewards from "./components/Rewards";
import Leaderboards from "./components/Leaderboards";
import TaskBoard from "./components/TaskBoard";
import DealSettings from "./components/DealSettings";

const TABS = [
  "Dashboard",
  "Daily Log",
  "Rewards",
  "Leaderboards",
  "Tasks",
  "Deal Settings",
] as const;
type Tab = (typeof TABS)[number];

export default function TrackerPage() {
  const [state, setState] = useState<TrackerState | null>(null);
  const [tab, setTab] = useState<Tab>("Dashboard");

  // load from localStorage after mount (avoids SSR/client mismatch)
  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  if (!state) {
    return (
      <main className="min-h-screen bg-roobet-dark flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-roobet-gold/30 border-t-roobet-gold rounded-full animate-spin" />
      </main>
    );
  }

  const deal =
    state.deals.find((d) => d.id === state.activeDealId) ?? state.deals[0];

  const updateState = (updater: (s: TrackerState) => TrackerState) =>
    setState((s) => (s ? updater(s) : s));

  const updateDeal = (updater: (d: Deal) => Deal) =>
    updateState((s) => ({
      ...s,
      deals: s.deals.map((d) => (d.id === deal.id ? updater(d) : d)),
    }));

  const updateTasks = (tasks: TaskDef[]) =>
    updateState((s) => ({ ...s, tasks }));

  const toggleTask = (date: string, taskId: string) =>
    updateState((s) => {
      const cur = s.taskLog[date] ?? [];
      const next = cur.includes(taskId)
        ? cur.filter((id) => id !== taskId)
        : [...cur, taskId];
      return { ...s, taskLog: { ...s.taskLog, [date]: next } };
    });

  return (
    <main className="min-h-screen bg-roobet-dark">
      {/* Header */}
      <header className="border-b border-roobet-border bg-roobet-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 mr-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://roobet.com/favicon.ico"
              alt="Roobet"
              width={32}
              height={32}
              className="rounded"
            />
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">
                Deal Tracker
              </h1>
              <p className="text-gray-400 text-xs">
                <Link href="/" className="text-roobet-gold hover:underline">
                  ← Wager leaderboard
                </Link>
              </p>
            </div>
          </div>

          {/* Sheet switcher */}
          <label className="flex items-center gap-2 text-xs text-gray-400">
            Sheet
            <select
              value={deal.id}
              onChange={(e) =>
                updateState((s) => ({ ...s, activeDealId: e.target.value }))
              }
              className="bg-roobet-dark border border-roobet-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-roobet-gold/60"
            >
              {state.deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Tabs */}
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                tab === t
                  ? "border-roobet-gold text-white font-semibold"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {tab === "Dashboard" && (
          <Dashboard deal={deal} tasks={state.tasks} taskLog={state.taskLog} />
        )}
        {tab === "Daily Log" && (
          <DailyLog key={deal.id} deal={deal} onUpdate={updateDeal} />
        )}
        {tab === "Rewards" && (
          <Rewards key={deal.id} deal={deal} onUpdate={updateDeal} />
        )}
        {tab === "Leaderboards" && (
          <Leaderboards key={deal.id} deal={deal} onUpdate={updateDeal} />
        )}
        {tab === "Tasks" && (
          <TaskBoard
            tasks={state.tasks}
            taskLog={state.taskLog}
            onUpdateTasks={updateTasks}
            onToggle={toggleTask}
          />
        )}
        {tab === "Deal Settings" && (
          <DealSettings
            key={deal.id}
            state={state}
            deal={deal}
            onUpdateDeal={updateDeal}
            onUpdateState={updateState}
          />
        )}
      </div>

      <footer className="border-t border-roobet-border py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-600 text-xs">
          <p>
            Data is stored locally in this browser. Export a backup from Deal
            Settings. Gamble responsibly. 18+.
          </p>
        </div>
      </footer>
    </main>
  );
}
