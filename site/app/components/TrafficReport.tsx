"use client";

import { useCallback, useEffect, useState } from "react";
import { FUNNEL } from "@/lib/analyticsEvents";

interface DayTraffic {
  day: string;
  views: number;
  visitors: number;
  new: number;
  returning: number;
  sources: Record<string, number>;
  paths: Record<string, number>;
  events: Record<string, number>;
}

interface Report {
  days: DayTraffic[];
  totals: Omit<DayTraffic, "day">;
  campaigns: Array<{ tag: string; hits: number }>;
}

/** Where the key is held between reloads. Session, not local: it dies with the tab. */
const STORE = "clozet-admin-key";

const SOURCE_LABEL: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  reddit: "Reddit",
  x: "X",
  facebook: "Facebook",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  google: "Google",
  search: "Other search",
  direct: "Direct / app",
  other: "Somewhere else",
};

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "–");

/** A row with a bar behind the number. No chart library for eight rows of data. */
function Bar({ label, value, of }: { label: string; value: number; of: number }) {
  const width = of > 0 ? Math.max(1.5, (value / of) * 100) : 0;
  return (
    <li className="relative isolate flex items-center justify-between gap-4 px-3 py-2 text-[13px]">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 -z-10 rounded-sm bg-accent/10"
        style={{ width: `${width}%` }}
      />
      <span className="truncate text-room-ink">{label}</span>
      <span className="shrink-0 tabular-nums text-room-muted">
        {value.toLocaleString()} <span className="text-room-faint">· {pct(value, of)}</span>
      </span>
    </li>
  );
}

function Table({
  title,
  rows,
  labels,
  empty,
}: {
  title: string;
  rows: Record<string, number>;
  labels?: Record<string, string>;
  empty: string;
}) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);

  return (
    <section className="panel px-5 py-5">
      <h2 className="label mb-3">{title}</h2>
      {entries.length ? (
        <ul className="-mx-3">
          {entries.map(([name, value]) => (
            <Bar key={name} label={labels?.[name] ?? name} value={value} of={total} />
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-room-faint">{empty}</p>
      )}
    </section>
  );
}

/**
 * The traffic report.
 *
 * The key is typed rather than stored in the app: this page is reachable by
 * anybody, and the thing that protects the numbers is the same bearer secret
 * the query report uses. Kept in sessionStorage so a reload doesn't ask again
 * and closing the tab forgets it.
 */
export default function TrafficReport() {
  const [key, setKey] = useState("");
  const [typed, setTyped] = useState("");
  const [days, setDays] = useState(14);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setKey(saved);
    } catch {
      // A browser refusing session storage just means typing it again.
    }
  }, []);

  const load = useCallback(async () => {
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/traffic?days=${days}`, {
        headers: { authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        setError("That key isn't right — or ADMIN_SECRET isn't set on the deployment.");
        setReport(null);
        return;
      }
      if (!res.ok) {
        setError(`The report answered ${res.status}.`);
        return;
      }
      setReport((await res.json()) as Report);
    } catch {
      setError("Couldn't reach the report.");
    } finally {
      setBusy(false);
    }
  }, [key, days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!key) {
    return (
      <form
        className="panel max-w-md px-7 py-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (!typed.trim()) return;
          try {
            sessionStorage.setItem(STORE, typed.trim());
          } catch {
            // Not being able to remember it is not a reason to refuse it.
          }
          setKey(typed.trim());
        }}
      >
        <label htmlFor="admin-key" className="label mb-2 block">
          Admin key
        </label>
        <input
          id="admin-key"
          type="password"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          className="field w-full"
          placeholder="ADMIN_SECRET"
        />
        <p className="mt-2 text-xs text-room-faint">
          The same value as <code>ADMIN_SECRET</code> on the Railway service. Held for this tab
          only.
        </p>
        <button type="submit" className="btn-primary mt-6">
          Show me
        </button>
      </form>
    );
  }

  const totals = report?.totals;
  /** Visits, falling back to pageviews on the day the HyperLogLog has nothing. */
  const top = totals ? totals.visitors || totals.views : 0;
  const funnelTop = totals ? (totals.events["quiz_start"] ?? 0) || top : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 14, 30, 90].map((span) => (
          <button
            key={span}
            type="button"
            onClick={() => setDays(span)}
            className={`rounded-sm px-3.5 py-1.5 text-[13px] transition-colors duration-200 ease-out ${
              days === span ? "bg-accent text-white" : "bg-room-sunk text-room-muted hover:text-room-ink"
            }`}
          >
            {span} days
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="btn-ghost ml-auto text-[12px]">
          {busy ? "Reading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p role="alert" className="panel px-5 py-4 text-[13px] text-room-ink">
          {error}{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              try {
                sessionStorage.removeItem(STORE);
              } catch {
                /* nothing to forget */
              }
              setKey("");
            }}
          >
            Use a different key
          </button>
        </p>
      )}

      {totals && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Visits", value: totals.visitors, note: "distinct per day, then summed" },
              { label: "Pageviews", value: totals.views, note: "every page, every visit" },
              { label: "Been here before", value: totals.returning, note: "arrived carrying a Clozet cookie" },
              { label: "Clozets built", value: totals.events["run_done"] ?? 0, note: "runs that finished" },
            ].map((tile) => (
              <div key={tile.label} className="panel px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-room-faint">{tile.label}</p>
                <p className="mt-1.5 text-[24px] font-semibold tabular-nums text-room-ink">
                  {tile.value.toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-room-faint">{tile.note}</p>
              </div>
            ))}
          </section>

          {/* The one that answers "is this working". Each step as a share of
              the one above it, because the absolute numbers are small at the
              start and the drop-off is the thing worth reading. */}
          <section className="panel px-5 py-5">
            <h2 className="label mb-1">The funnel</h2>
            <p className="mb-4 text-[12px] text-room-faint">
              Against visits, and each step against the one before it. Where the fall is
              steepest is what to fix.
            </p>
            <ul className="-mx-3">
              {FUNNEL.map((step, index) => {
                // The top of the funnel is visits, not pageviews. One person
                // reading four pages is one person who might start the quiz,
                // and measuring against pageviews makes every step below look
                // like a collapse that never happened.
                const value = step.event === "visit" ? top : (totals.events[step.event] ?? 0);
                const previous =
                  index === 0
                    ? value
                    : FUNNEL[index - 1].event === "visit"
                      ? top
                      : (totals.events[FUNNEL[index - 1].event] ?? 0);
                return (
                  <li
                    key={step.event}
                    className="relative isolate flex items-center justify-between gap-4 px-3 py-2.5 text-[13px]"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 -z-10 rounded-sm bg-accent/10"
                      style={{ width: `${top > 0 ? Math.max(1.5, (Math.min(value, top) / top) * 100) : 0}%` }}
                    />
                    <span className="text-room-ink">{step.label}</span>
                    <span className="shrink-0 tabular-nums text-room-muted">
                      {value.toLocaleString()}
                      {index > 0 && (
                        <span className="text-room-faint"> · {pct(value, previous)} of previous</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {(totals.events["quiz_skip"] ?? 0) > 0 && (
              <p className="mt-3 border-t border-room-line pt-3 text-[12px] text-room-faint">
                {(totals.events["quiz_skip"] ?? 0).toLocaleString()} skipped the quiz
                {funnelTop > 0 && ` · ${pct(totals.events["quiz_skip"] ?? 0, funnelTop)} of those who started it`}.
              </p>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Table
              title="Where they came from"
              rows={totals.sources}
              labels={SOURCE_LABEL}
              empty="Nothing recorded yet. Sources are counted on the first page of a visit."
            />
            <Table title="What they looked at" rows={totals.paths} empty="No pageviews yet." />
          </div>

          {report!.campaigns.length > 0 && (
            <Table
              title="Campaign tags, today"
              rows={Object.fromEntries(report!.campaigns.map((c) => [c.tag, c.hits]))}
              empty="No tagged links yet."
            />
          )}

          <section className="panel px-5 py-5">
            <h2 className="label mb-3">By day</h2>
            <ul className="-mx-3">
              {[...report!.days].reverse().map((day) => {
                const peak = Math.max(...report!.days.map((d) => d.views), 1);
                return (
                  <li
                    key={day.day}
                    className="relative isolate flex items-center justify-between gap-4 px-3 py-1.5 text-[13px]"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 -z-10 rounded-sm bg-accent/10"
                      style={{ width: `${Math.max(0, (day.views / peak) * 100)}%` }}
                    />
                    <span className="tabular-nums text-room-ink">{day.day}</span>
                    <span className="shrink-0 tabular-nums text-room-muted">
                      {day.visitors.toLocaleString()} visits
                      <span className="text-room-faint"> · {day.views.toLocaleString()} views</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {!totals && !error && <p className="text-[13px] text-room-faint">Reading…</p>}
    </div>
  );
}
