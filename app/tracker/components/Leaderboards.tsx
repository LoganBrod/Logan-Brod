"use client";

import { useState } from "react";
import {
  Deal,
  Leaderboard,
  LeaderboardFrequency,
  LeaderboardPayout,
  fmtDate,
  fmtMoney,
  todayStr,
  uid,
} from "../types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Meter,
  MoneyInput,
  Select,
  TextInput,
  parseMoney,
} from "./ui";

const FREQ_LABELS: Record<LeaderboardFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  "one-time": "One-time",
};

export default function Leaderboards({
  deal,
  onUpdate,
}: {
  deal: Deal;
  onUpdate: (updater: (d: Deal) => Deal) => void;
}) {
  const [lbForm, setLbForm] = useState({
    editingId: null as string | null,
    name: "",
    prizePool: "",
    frequency: "weekly" as LeaderboardFrequency,
    endDate: "",
  });

  const [payForm, setPayForm] = useState({
    leaderboardId: "",
    date: todayStr(),
    amount: "",
    recipient: "",
    notes: "",
  });

  function submitLb(e: React.FormEvent) {
    e.preventDefault();
    if (!lbForm.name.trim()) return;
    const lb: Leaderboard = {
      id: lbForm.editingId ?? uid(),
      name: lbForm.name.trim(),
      prizePool: parseMoney(lbForm.prizePool),
      frequency: lbForm.frequency,
      endDate: lbForm.endDate,
      notes: "",
    };
    onUpdate((d) => ({
      ...d,
      leaderboards: lbForm.editingId
        ? d.leaderboards.map((x) => (x.id === lbForm.editingId ? lb : x))
        : [...d.leaderboards, lb],
    }));
    setLbForm({ editingId: null, name: "", prizePool: "", frequency: "weekly", endDate: "" });
  }

  function editLb(lb: Leaderboard) {
    setLbForm({
      editingId: lb.id,
      name: lb.name,
      prizePool: lb.prizePool ? String(lb.prizePool) : "",
      frequency: lb.frequency,
      endDate: lb.endDate,
    });
  }

  function removeLb(id: string) {
    onUpdate((d) => ({
      ...d,
      leaderboards: d.leaderboards.filter((x) => x.id !== id),
      payouts: d.payouts.filter((p) => p.leaderboardId !== id),
    }));
  }

  function submitPayout(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseMoney(payForm.amount);
    if (!payForm.leaderboardId || amount <= 0) return;
    const payout: LeaderboardPayout = {
      id: uid(),
      leaderboardId: payForm.leaderboardId,
      date: payForm.date,
      amount,
      recipient: payForm.recipient.trim(),
      notes: payForm.notes.trim(),
    };
    onUpdate((d) => ({ ...d, payouts: [...d.payouts, payout] }));
    setPayForm({ ...payForm, amount: "", recipient: "", notes: "" });
  }

  function removePayout(id: string) {
    onUpdate((d) => ({ ...d, payouts: d.payouts.filter((p) => p.id !== id) }));
  }

  const payouts = [...deal.payouts].sort((a, b) => b.date.localeCompare(a.date));
  const lbName = (id: string) =>
    deal.leaderboards.find((l) => l.id === id)?.name ?? "Unknown";

  return (
    <div className="space-y-6">
      {/* Leaderboard cards */}
      <Card
        title="Leaderboards"
        subtitle="The leaderboards you owe payouts on — track prize pool vs. paid"
      >
        {deal.leaderboards.length === 0 ? (
          <EmptyState>No leaderboards yet — set one up below.</EmptyState>
        ) : (
          <div className="grid md:grid-cols-2 gap-3 mb-5">
            {deal.leaderboards.map((lb) => {
              const paid = deal.payouts
                .filter((p) => p.leaderboardId === lb.id)
                .reduce((s, p) => s + p.amount, 0);
              const remaining = Math.max(0, lb.prizePool - paid);
              return (
                <div
                  key={lb.id}
                  className="bg-roobet-dark border border-roobet-border rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="text-white font-semibold text-sm">
                        {lb.name}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {FREQ_LABELS[lb.frequency]}
                        {lb.endDate ? ` · ends ${fmtDate(lb.endDate)}` : ""}
                      </p>
                    </div>
                    <span className="whitespace-nowrap">
                      <button
                        onClick={() => editLb(lb)}
                        className="text-roobet-gold text-xs hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeLb(lb.id)}
                        className="text-red-400 text-xs hover:underline"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm mt-3 mb-1.5">
                    <span className="text-white font-semibold">
                      {fmtMoney(paid)}{" "}
                      <span className="text-gray-500 font-normal">paid</span>
                    </span>
                    <span className="text-gray-500 text-xs">
                      {fmtMoney(remaining)} remaining of {fmtMoney(lb.prizePool)}
                    </span>
                  </div>
                  <Meter value={paid} max={lb.prizePool} color="#eb6834" />
                </div>
              );
            })}
          </div>
        )}

        <form
          onSubmit={submitLb}
          className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end pt-4 border-t border-roobet-border"
        >
          <Field label="Name">
            <TextInput
              value={lbForm.name}
              placeholder="e.g. Weekly $1K Wager Race"
              onChange={(e) => setLbForm({ ...lbForm, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Prize pool">
            <MoneyInput
              value={lbForm.prizePool}
              onChange={(v) => setLbForm({ ...lbForm, prizePool: v })}
            />
          </Field>
          <Field label="Frequency">
            <Select
              value={lbForm.frequency}
              onChange={(e) =>
                setLbForm({
                  ...lbForm,
                  frequency: e.target.value as LeaderboardFrequency,
                })
              }
            >
              {Object.entries(FREQ_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="End date (opt.)">
            <TextInput
              type="date"
              value={lbForm.endDate}
              onChange={(e) => setLbForm({ ...lbForm, endDate: e.target.value })}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              {lbForm.editingId ? "Save" : "Add"}
            </Button>
            {lbForm.editingId && (
              <Button
                variant="ghost"
                onClick={() =>
                  setLbForm({
                    editingId: null,
                    name: "",
                    prizePool: "",
                    frequency: "weekly",
                    endDate: "",
                  })
                }
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* Payout form */}
      <Card title="Log a payout" subtitle="Record each winner you pay">
        {deal.leaderboards.length === 0 ? (
          <EmptyState>Add a leaderboard first.</EmptyState>
        ) : (
          <form
            onSubmit={submitPayout}
            className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end"
          >
            <Field label="Leaderboard">
              <Select
                value={payForm.leaderboardId}
                onChange={(e) =>
                  setPayForm({ ...payForm, leaderboardId: e.target.value })
                }
                required
              >
                <option value="">Select…</option>
                {deal.leaderboards.map((lb) => (
                  <option key={lb.id} value={lb.id}>
                    {lb.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <TextInput
                type="date"
                value={payForm.date}
                onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
                required
              />
            </Field>
            <Field label="Amount">
              <MoneyInput
                value={payForm.amount}
                onChange={(v) => setPayForm({ ...payForm, amount: v })}
              />
            </Field>
            <Field label="Winner (opt.)">
              <TextInput
                value={payForm.recipient}
                placeholder="Username"
                onChange={(e) =>
                  setPayForm({ ...payForm, recipient: e.target.value })
                }
              />
            </Field>
            <Field label="Notes">
              <TextInput
                value={payForm.notes}
                placeholder="Optional"
                onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
              />
            </Field>
            <Button type="submit">Log payout</Button>
          </form>
        )}
      </Card>

      {/* Payout history */}
      <Card title="Payout history" subtitle={`${payouts.length} payouts`}>
        {payouts.length === 0 ? (
          <EmptyState>No payouts logged yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-roobet-border">
                  <th className="text-left py-2 pr-3 font-medium">Date</th>
                  <th className="text-left py-2 px-3 font-medium">Leaderboard</th>
                  <th className="text-left py-2 px-3 font-medium">Winner</th>
                  <th className="text-right py-2 px-3 font-medium">Amount</th>
                  <th className="text-left py-2 px-3 font-medium">Notes</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {payouts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-roobet-border/50 hover:bg-white/[0.02]"
                  >
                    <td className="py-2.5 pr-3 text-gray-300 whitespace-nowrap">
                      {fmtDate(p.date)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-300">
                      {lbName(p.leaderboardId)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-300">
                      {p.recipient || "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white font-semibold">
                      {fmtMoney(p.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500 max-w-[180px] truncate">
                      {p.notes || "—"}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <button
                        onClick={() => removePayout(p.id)}
                        className="text-red-400 text-xs hover:underline"
                      >
                        Delete
                      </button>
                    </td>
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
