"use client";

import { useState } from "react";
import { DailyEntry, Deal, fmtDate, fmtMoney, todayStr, uid } from "../types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  MoneyInput,
  TextInput,
  parseMoney,
} from "./ui";

interface FormState {
  editingId: string | null;
  date: string;
  deposited: string;
  wagered: string;
  cashout: string;
  notes: string;
}

const blankForm = (): FormState => ({
  editingId: null,
  date: todayStr(),
  deposited: "",
  wagered: "",
  cashout: "",
  notes: "",
});

export default function DailyLog({
  deal,
  onUpdate,
}: {
  deal: Deal;
  onUpdate: (updater: (d: Deal) => Deal) => void;
}) {
  const [form, setForm] = useState<FormState>(blankForm());

  const entries = [...deal.entries].sort((a, b) =>
    a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date) return;
    const entry: DailyEntry = {
      id: form.editingId ?? uid(),
      date: form.date,
      deposited: parseMoney(form.deposited),
      wagered: parseMoney(form.wagered),
      cashout: parseMoney(form.cashout),
      notes: form.notes.trim(),
    };
    onUpdate((d) => ({
      ...d,
      entries: form.editingId
        ? d.entries.map((x) => (x.id === form.editingId ? entry : x))
        : [...d.entries, entry],
    }));
    setForm(blankForm());
  }

  function edit(entry: DailyEntry) {
    setForm({
      editingId: entry.id,
      date: entry.date,
      deposited: entry.deposited ? String(entry.deposited) : "",
      wagered: entry.wagered ? String(entry.wagered) : "",
      cashout: entry.cashout ? String(entry.cashout) : "",
      notes: entry.notes,
    });
  }

  function remove(id: string) {
    onUpdate((d) => ({ ...d, entries: d.entries.filter((x) => x.id !== id) }));
    if (form.editingId === id) setForm(blankForm());
  }

  return (
    <div className="space-y-6">
      <Card
        title={form.editingId ? "Edit entry" : "Log a day"}
        subtitle="Track deposits, wager volume and what you cashed out"
      >
        <form
          onSubmit={submit}
          className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end"
        >
          <Field label="Date">
            <TextInput
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </Field>
          <Field label="Deposited">
            <MoneyInput
              value={form.deposited}
              onChange={(v) => setForm({ ...form, deposited: v })}
            />
          </Field>
          <Field label="Wagered">
            <MoneyInput
              value={form.wagered}
              onChange={(v) => setForm({ ...form, wagered: v })}
            />
          </Field>
          <Field label="Cashed out">
            <MoneyInput
              value={form.cashout}
              onChange={(v) => setForm({ ...form, cashout: v })}
            />
          </Field>
          <Field label="Notes" className="col-span-2 md:col-span-1">
            <TextInput
              value={form.notes}
              placeholder="Optional"
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <div className="flex gap-2 col-span-2 md:col-span-1">
            <Button type="submit" className="flex-1">
              {form.editingId ? "Save" : "Add"}
            </Button>
            {form.editingId && (
              <Button variant="ghost" onClick={() => setForm(blankForm())}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card title="Daily log" subtitle={`${entries.length} entries`}>
        {entries.length === 0 ? (
          <EmptyState>No entries yet — log your first day above.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-roobet-border">
                  <th className="text-left py-2 pr-3 font-medium">Date</th>
                  <th className="text-right py-2 px-3 font-medium">Deposited</th>
                  <th className="text-right py-2 px-3 font-medium">Wagered</th>
                  <th className="text-right py-2 px-3 font-medium">Cashed out</th>
                  <th className="text-right py-2 px-3 font-medium">Day net</th>
                  <th className="text-left py-2 px-3 font-medium">Notes</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {entries.map((e) => {
                  const net = e.cashout - e.deposited;
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-roobet-border/50 hover:bg-white/[0.02]"
                    >
                      <td className="py-2.5 pr-3 text-gray-300 whitespace-nowrap">
                        {fmtDate(e.date)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-300">
                        {fmtMoney(e.deposited)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-300">
                        {fmtMoney(e.wagered)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-300">
                        {fmtMoney(e.cashout)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold ${
                          net > 0
                            ? "text-[#0ca30c]"
                            : net < 0
                              ? "text-[#e66767]"
                              : "text-gray-400"
                        }`}
                      >
                        {fmtMoney(net)}
                      </td>
                      <td className="py-2.5 px-3 text-gray-500 max-w-[180px] truncate">
                        {e.notes || "—"}
                      </td>
                      <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => edit(e)}
                          className="text-roobet-gold text-xs hover:underline mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => remove(e.id)}
                          className="text-red-400 text-xs hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
