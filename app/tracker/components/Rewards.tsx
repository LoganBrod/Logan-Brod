"use client";

import { useState } from "react";
import {
  Deal,
  RewardEntry,
  RewardFrequency,
  RewardKind,
  RewardType,
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
  MoneyInput,
  Select,
  TextInput,
  parseMoney,
} from "./ui";

const FREQ_LABELS: Record<RewardFrequency, string> = {
  "per-deposit": "Per deposit",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  "one-time": "One-time",
};

const KIND_LABELS: Record<RewardKind, string> = {
  "deposit-bonus": "Deposit bonus",
  lossback: "Lossback",
  custom: "Custom",
};

export default function Rewards({
  deal,
  onUpdate,
}: {
  deal: Deal;
  onUpdate: (updater: (d: Deal) => Deal) => void;
}) {
  // --- reward type form ---
  const [typeForm, setTypeForm] = useState({
    editingId: null as string | null,
    name: "",
    kind: "custom" as RewardKind,
    percent: "",
    frequency: "weekly" as RewardFrequency,
    notes: "",
  });

  // --- claim form ---
  const [claim, setClaim] = useState({
    date: todayStr(),
    rewardTypeId: "",
    amount: "",
    notes: "",
  });

  function submitType(e: React.FormEvent) {
    e.preventDefault();
    if (!typeForm.name.trim()) return;
    const pct = parseFloat(typeForm.percent);
    const rt: RewardType = {
      id: typeForm.editingId ?? uid(),
      name: typeForm.name.trim(),
      kind: typeForm.kind,
      percent: Number.isFinite(pct) && pct > 0 ? pct : null,
      frequency: typeForm.frequency,
      notes: typeForm.notes.trim(),
    };
    onUpdate((d) => ({
      ...d,
      rewardTypes: typeForm.editingId
        ? d.rewardTypes.map((x) => (x.id === typeForm.editingId ? rt : x))
        : [...d.rewardTypes, rt],
    }));
    setTypeForm({
      editingId: null,
      name: "",
      kind: "custom",
      percent: "",
      frequency: "weekly",
      notes: "",
    });
  }

  function editType(rt: RewardType) {
    setTypeForm({
      editingId: rt.id,
      name: rt.name,
      kind: rt.kind,
      percent: rt.percent != null ? String(rt.percent) : "",
      frequency: rt.frequency,
      notes: rt.notes,
    });
  }

  function removeType(id: string) {
    onUpdate((d) => ({
      ...d,
      rewardTypes: d.rewardTypes.filter((x) => x.id !== id),
      rewards: d.rewards.filter((r) => r.rewardTypeId !== id),
    }));
  }

  function submitClaim(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseMoney(claim.amount);
    if (!claim.rewardTypeId || amount <= 0) return;
    const entry: RewardEntry = {
      id: uid(),
      date: claim.date,
      rewardTypeId: claim.rewardTypeId,
      amount,
      notes: claim.notes.trim(),
    };
    onUpdate((d) => ({ ...d, rewards: [...d.rewards, entry] }));
    setClaim({ ...claim, amount: "", notes: "" });
  }

  function removeClaim(id: string) {
    onUpdate((d) => ({ ...d, rewards: d.rewards.filter((r) => r.id !== id) }));
  }

  const claims = [...deal.rewards].sort((a, b) => b.date.localeCompare(a.date));
  const typeName = (id: string) =>
    deal.rewardTypes.find((t) => t.id === id)?.name ?? "Unknown";

  return (
    <div className="space-y-6">
      {/* Reward types */}
      <Card
        title="Reward types"
        subtitle="The rewards this deal includes — deposit bonuses, lossback, or anything custom"
      >
        {deal.rewardTypes.length === 0 ? (
          <EmptyState>No reward types — add one below.</EmptyState>
        ) : (
          <ul className="space-y-2 mb-5">
            {deal.rewardTypes.map((rt) => {
              const total = deal.rewards
                .filter((r) => r.rewardTypeId === rt.id)
                .reduce((s, r) => s + r.amount, 0);
              return (
                <li
                  key={rt.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-roobet-dark border border-roobet-border rounded-xl px-4 py-3"
                >
                  <span className="text-white font-semibold text-sm">
                    {rt.name}
                  </span>
                  <span className="text-xs text-gray-500 bg-roobet-card border border-roobet-border rounded-full px-2 py-0.5">
                    {KIND_LABELS[rt.kind]}
                  </span>
                  <span className="text-xs text-gray-500 bg-roobet-card border border-roobet-border rounded-full px-2 py-0.5">
                    {FREQ_LABELS[rt.frequency]}
                  </span>
                  {rt.percent != null && (
                    <span className="text-xs text-roobet-gold bg-roobet-card border border-roobet-border rounded-full px-2 py-0.5">
                      {rt.percent}%
                    </span>
                  )}
                  <span className="ml-auto text-sm text-gray-300">
                    {fmtMoney(total)}{" "}
                    <span className="text-gray-600 text-xs">claimed</span>
                  </span>
                  <span className="whitespace-nowrap">
                    <button
                      onClick={() => editType(rt)}
                      className="text-roobet-gold text-xs hover:underline mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeType(rt.id)}
                      className="text-red-400 text-xs hover:underline"
                    >
                      Delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <form
          onSubmit={submitType}
          className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end pt-4 border-t border-roobet-border"
        >
          <Field label="Name" className="col-span-2">
            <TextInput
              value={typeForm.name}
              placeholder="e.g. Reload Bonus"
              onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Kind">
            <Select
              value={typeForm.kind}
              onChange={(e) =>
                setTypeForm({ ...typeForm, kind: e.target.value as RewardKind })
              }
            >
              {Object.entries(KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Percent (opt.)">
            <TextInput
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g. 10"
              value={typeForm.percent}
              onChange={(e) =>
                setTypeForm({ ...typeForm, percent: e.target.value })
              }
            />
          </Field>
          <Field label="Frequency">
            <Select
              value={typeForm.frequency}
              onChange={(e) =>
                setTypeForm({
                  ...typeForm,
                  frequency: e.target.value as RewardFrequency,
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
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              {typeForm.editingId ? "Save" : "Add type"}
            </Button>
            {typeForm.editingId && (
              <Button
                variant="ghost"
                onClick={() =>
                  setTypeForm({
                    editingId: null,
                    name: "",
                    kind: "custom",
                    percent: "",
                    frequency: "weekly",
                    notes: "",
                  })
                }
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* Claim log */}
      <Card
        title="Claim a reward"
        subtitle="Log each bonus or lossback as you receive it"
      >
        {deal.rewardTypes.length === 0 ? (
          <EmptyState>Add a reward type first.</EmptyState>
        ) : (
          <form
            onSubmit={submitClaim}
            className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end"
          >
            <Field label="Date">
              <TextInput
                type="date"
                value={claim.date}
                onChange={(e) => setClaim({ ...claim, date: e.target.value })}
                required
              />
            </Field>
            <Field label="Reward">
              <Select
                value={claim.rewardTypeId}
                onChange={(e) =>
                  setClaim({ ...claim, rewardTypeId: e.target.value })
                }
                required
              >
                <option value="">Select…</option>
                {deal.rewardTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount">
              <MoneyInput
                value={claim.amount}
                onChange={(v) => setClaim({ ...claim, amount: v })}
              />
            </Field>
            <Field label="Notes">
              <TextInput
                value={claim.notes}
                placeholder="Optional"
                onChange={(e) => setClaim({ ...claim, notes: e.target.value })}
              />
            </Field>
            <Button type="submit">Log reward</Button>
          </form>
        )}
      </Card>

      <Card title="Reward history" subtitle={`${claims.length} claims`}>
        {claims.length === 0 ? (
          <EmptyState>No rewards logged yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-roobet-border">
                  <th className="text-left py-2 pr-3 font-medium">Date</th>
                  <th className="text-left py-2 px-3 font-medium">Reward</th>
                  <th className="text-right py-2 px-3 font-medium">Amount</th>
                  <th className="text-left py-2 px-3 font-medium">Notes</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {claims.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-roobet-border/50 hover:bg-white/[0.02]"
                  >
                    <td className="py-2.5 pr-3 text-gray-300 whitespace-nowrap">
                      {fmtDate(r.date)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-300">
                      {typeName(r.rewardTypeId)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white font-semibold">
                      {fmtMoney(r.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500 max-w-[200px] truncate">
                      {r.notes || "—"}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <button
                        onClick={() => removeClaim(r.id)}
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
