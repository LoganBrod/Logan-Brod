"use client";

import { useState } from "react";
import { TaskDef, TrackerState, fmtDate, todayStr, uid } from "../types";
import { Button, Card, EmptyState, TextInput } from "./ui";

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

export default function TaskBoard({
  tasks,
  taskLog,
  onUpdateTasks,
  onToggle,
}: {
  tasks: TaskDef[];
  taskLog: TrackerState["taskLog"];
  onUpdateTasks: (tasks: TaskDef[]) => void;
  onToggle: (date: string, taskId: string) => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [newTask, setNewTask] = useState("");

  const done = new Set(taskLog[date] ?? []);
  const today = todayStr();
  const last7 = Array.from({ length: 7 }, (_, i) => shiftDate(today, i - 6));

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    const name = newTask.trim();
    if (!name) return;
    onUpdateTasks([...tasks, { id: uid(), name }]);
    setNewTask("");
  }

  return (
    <div className="space-y-6">
      <Card
        title="Daily task board"
        subtitle="Your routine — check things off as you go"
        actions={
          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={() => setDate(shiftDate(date, -1))}>
              ‹
            </Button>
            <span className="text-sm text-gray-300 px-2 whitespace-nowrap">
              {date === today ? "Today" : fmtDate(date)}
            </span>
            <Button
              variant="ghost"
              onClick={() => setDate(shiftDate(date, 1))}
              disabled={date >= today}
            >
              ›
            </Button>
          </div>
        }
      >
        {tasks.length === 0 ? (
          <EmptyState>No tasks yet — add your first one below.</EmptyState>
        ) : (
          <ul className="space-y-2 mb-5">
            {tasks.map((t) => {
              const checked = done.has(t.id);
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 bg-roobet-dark border border-roobet-border rounded-xl px-4 py-3"
                >
                  <button
                    onClick={() => onToggle(date, t.id)}
                    aria-pressed={checked}
                    aria-label={`${t.name}: ${checked ? "done" : "not done"}`}
                    className={`w-6 h-6 rounded-md border flex items-center justify-center text-sm font-bold transition-colors ${
                      checked
                        ? "bg-[#0ca30c] border-[#0ca30c] text-roobet-dark"
                        : "border-gray-600 text-transparent hover:border-roobet-gold"
                    }`}
                  >
                    ✓
                  </button>
                  <span
                    className={`flex-1 text-sm ${
                      checked ? "text-gray-500 line-through" : "text-white"
                    }`}
                  >
                    {t.name}
                  </span>
                  <button
                    onClick={() =>
                      onUpdateTasks(tasks.filter((x) => x.id !== t.id))
                    }
                    className="text-red-400 text-xs hover:underline"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={addTask} className="flex gap-2 pt-4 border-t border-roobet-border">
          <TextInput
            value={newTask}
            placeholder="Add a task — e.g. Clip best moments"
            onChange={(e) => setNewTask(e.target.value)}
          />
          <Button type="submit">Add</Button>
        </form>
      </Card>

      {/* 7-day history */}
      <Card title="Last 7 days" subtitle="Completion history per task">
        {tasks.length === 0 ? (
          <EmptyState>Add tasks to see your streak.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-roobet-border">
                  <th className="text-left py-2 pr-3 font-medium">Task</th>
                  {last7.map((d) => (
                    <th key={d} className="py-2 px-2 font-medium text-center">
                      {fmtDate(d).split(",")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b border-roobet-border/50">
                    <td className="py-2.5 pr-3 text-gray-300">{t.name}</td>
                    {last7.map((d) => {
                      const ok = (taskLog[d] ?? []).includes(t.id);
                      return (
                        <td key={d} className="py-2.5 px-2 text-center">
                          <span
                            className={`inline-block w-3 h-3 rounded-full ${
                              ok ? "bg-[#0ca30c]" : "bg-roobet-border"
                            }`}
                            title={`${t.name} — ${fmtDate(d)}: ${ok ? "done" : "not done"}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
