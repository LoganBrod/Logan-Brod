"use client";

import { useRef, useState } from "react";
import { Deal, TrackerState, fmtDate, newDeal, uid } from "../types";
import { exportState, parseImportedState } from "../storage";
import {
  Button,
  Card,
  Field,
  MoneyInput,
  TextInput,
  parseMoney,
} from "./ui";

export default function DealSettings({
  state,
  deal,
  onUpdateDeal,
  onUpdateState,
}: {
  state: TrackerState;
  deal: Deal;
  onUpdateDeal: (updater: (d: Deal) => Deal) => void;
  onUpdateState: (updater: (s: TrackerState) => TrackerState) => void;
}) {
  const [cashoutTarget, setCashoutTarget] = useState(
    deal.dailyCashoutTarget ? String(deal.dailyCashoutTarget) : ""
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState(false);

  function newSheet() {
    const name = window.prompt("Name for the new sheet:", "New Deal");
    if (!name) return;
    const d = newDeal(name.trim());
    onUpdateState((s) => ({
      ...s,
      deals: [...s.deals, d],
      activeDealId: d.id,
    }));
  }

  function duplicateSheet() {
    // copies the deal terms (rewards + leaderboards) into a fresh sheet with empty logs
    const copy: Deal = {
      ...newDeal(`${deal.name} (copy)`),
      platform: deal.platform,
      dailyCashoutTarget: deal.dailyCashoutTarget,
      notes: deal.notes,
      rewardTypes: deal.rewardTypes.map((rt) => ({ ...rt, id: uid() })),
      leaderboards: deal.leaderboards.map((lb) => ({ ...lb, id: uid() })),
    };
    onUpdateState((s) => ({
      ...s,
      deals: [...s.deals, copy],
      activeDealId: copy.id,
    }));
  }

  function deleteSheet() {
    if (state.deals.length <= 1) return;
    if (
      !window.confirm(
        `Delete "${deal.name}" and all its logged data? This cannot be undone.`
      )
    ) {
      return;
    }
    onUpdateState((s) => {
      const deals = s.deals.filter((d) => d.id !== deal.id);
      return { ...s, deals, activeDealId: deals[0].id };
    });
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = parseImportedState(String(reader.result));
      if (!imported) {
        setImportError(true);
        return;
      }
      if (
        window.confirm(
          "Importing replaces ALL current sheets and tasks with the file's data. Continue?"
        )
      ) {
        setImportError(false);
        onUpdateState(() => imported);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-6">
      <Card
        title="Deal information"
        subtitle="The terms of this sheet's deal"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Deal name">
            <TextInput
              value={deal.name}
              onChange={(e) =>
                onUpdateDeal((d) => ({ ...d, name: e.target.value }))
              }
            />
          </Field>
          <Field label="Platform">
            <TextInput
              value={deal.platform}
              onChange={(e) =>
                onUpdateDeal((d) => ({ ...d, platform: e.target.value }))
              }
            />
          </Field>
          <Field label="Daily cashout allowance">
            <MoneyInput
              value={cashoutTarget}
              onChange={(v) => {
                setCashoutTarget(v);
                const n = parseMoney(v);
                onUpdateDeal((d) => ({ ...d, dailyCashoutTarget: n }));
              }}
            />
          </Field>
          <Field label="Start date">
            <TextInput
              type="date"
              value={deal.startDate}
              onChange={(e) =>
                onUpdateDeal((d) => ({ ...d, startDate: e.target.value }))
              }
            />
          </Field>
          <Field label="End date (opt.)">
            <TextInput
              type="date"
              value={deal.endDate}
              onChange={(e) =>
                onUpdateDeal((d) => ({ ...d, endDate: e.target.value }))
              }
            />
          </Field>
          <Field label="Notes" className="col-span-2 md:col-span-1">
            <TextInput
              value={deal.notes}
              placeholder="Contact, terms, links…"
              onChange={(e) =>
                onUpdateDeal((d) => ({ ...d, notes: e.target.value }))
              }
            />
          </Field>
        </div>
        <p className="text-gray-600 text-xs mt-4">
          Reward types are managed in the Rewards tab; leaderboard obligations
          in the Leaderboards tab. Changes save automatically.
        </p>
      </Card>

      <Card
        title="Sheets"
        subtitle="Each sheet is its own deal with separate terms, logs and leaderboards"
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={duplicateSheet}>
              Duplicate terms
            </Button>
            <Button onClick={newSheet}>New sheet</Button>
          </div>
        }
      >
        <ul className="space-y-2">
          {state.deals.map((d) => (
            <li
              key={d.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 border rounded-xl px-4 py-3 ${
                d.id === deal.id
                  ? "bg-roobet-dark border-roobet-gold/50"
                  : "bg-roobet-dark border-roobet-border"
              }`}
            >
              <span className="text-white font-semibold text-sm">{d.name}</span>
              {d.id === deal.id && (
                <span className="text-xs text-roobet-gold bg-roobet-card border border-roobet-border rounded-full px-2 py-0.5">
                  Active
                </span>
              )}
              <span className="text-gray-500 text-xs">
                {d.platform} · started {fmtDate(d.startDate)} ·{" "}
                {d.entries.length} entries
              </span>
              <span className="ml-auto whitespace-nowrap">
                {d.id !== deal.id && (
                  <button
                    onClick={() =>
                      onUpdateState((s) => ({ ...s, activeDealId: d.id }))
                    }
                    className="text-roobet-gold text-xs hover:underline"
                  >
                    Switch to
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {state.deals.length > 1 && (
          <div className="mt-4 pt-4 border-t border-roobet-border">
            <Button variant="danger" onClick={deleteSheet}>
              Delete “{deal.name}”
            </Button>
          </div>
        )}
      </Card>

      <Card
        title="Backup"
        subtitle="Data lives in this browser's storage — export regularly to keep a copy"
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => exportState(state)}>
            Export all data (JSON)
          </Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            Import from file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            onChange={onImportFile}
            className="hidden"
          />
        </div>
        {importError && (
          <p className="text-red-400 text-xs mt-3">
            That file couldn&apos;t be read as tracker data.
          </p>
        )}
      </Card>
    </div>
  );
}
