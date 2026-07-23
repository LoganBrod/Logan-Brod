"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import PageHeader from "../components/PageHeader";
import Badge from "../components/Badge";
import type { RulesResponse, RuleWithState } from "../api/alerts/rules/route";
import type { CheckResponse } from "../api/alerts/check/route";

type RuleType = "buzz_spike" | "nba_breakout";

const TYPE_LABEL: Record<RuleType, string> = {
  buzz_spike: "Buzz Spike",
  nba_breakout: "NBA Breakout",
};

export default function AlertsPage() {
  const [data, setData] = useState<RulesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState<RuleType>("buzz_spike");
  const [player, setPlayer] = useState("");
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);

  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts/rules", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json as RulesResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createRule = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!player.trim()) return;
      setSaving(true);
      setError(null);
      try {
        const body: Record<string, unknown> = { type, player: player.trim() };
        const n = Number(threshold);
        if (Number.isFinite(n) && n > 0) {
          if (type === "buzz_spike") body.spikePct = n;
          else body.deltaThreshold = n;
        }
        const res = await fetch("/api/alerts/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        setPlayer("");
        setThreshold("");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create rule");
      } finally {
        setSaving(false);
      }
    },
    [type, player, threshold, load]
  );

  const deleteRule = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const res = await fetch(`/api/alerts/rules?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete rule");
      }
    },
    [load]
  );

  const runCheck = useCallback(async () => {
    setChecking(true);
    setCheckResult(null);
    setError(null);
    try {
      const res = await fetch("/api/alerts/check", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setCheckResult(json as CheckResponse);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  }, [load]);

  const configured = data?.configured;

  return (
    <div className="flex">
      <Sidebar active="/alerts" />

      <main className="flex-1 min-w-0">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <PageHeader
            eyebrow="Watch Rules"
            title="Alerts"
            subtitle="A daily Vercel Cron job evaluates your rules and pings Discord when one trips. Buzz spikes fire when today's Reddit mentions beat the trailing average by your percentage; NBA breakouts fire when a player's last-10 PPG delta crosses your threshold."
          />

          {/* Setup status */}
          {configured && (!configured.redis || !configured.discord) && (
            <div className="bg-ink-card border border-ink-gold/40 rounded-2xl p-5 mb-8 text-sm">
              <p className="text-ink-gold font-semibold uppercase tracking-widest text-xs mb-2">
                Setup needed
              </p>
              {!configured.redis && (
                <p className="text-gray-400">
                  <span className="text-white font-medium">Storage:</span> add Upstash Redis to the
                  Vercel project (Storage → Marketplace → Upstash) — rules can&apos;t be saved until
                  then.
                </p>
              )}
              {!configured.discord && (
                <p className="text-gray-400 mt-1">
                  <span className="text-white font-medium">Notifications:</span> create a Discord
                  webhook (Server Settings → Integrations → Webhooks) and set{" "}
                  <code className="text-ink-gold">DISCORD_WEBHOOK_URL</code>. Without it, tripped
                  alerts only show here.
                </p>
              )}
            </div>
          )}

          {/* Create rule */}
          <form
            onSubmit={createRule}
            className="bg-ink-card border border-ink-border rounded-2xl p-6 mb-8 card-glow grid gap-4 md:grid-cols-[1fr_2fr_1fr_auto]"
          >
            <div className="flex flex-col gap-1">
              <label className="text-gray-500 text-xs uppercase tracking-widest">Alert type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as RuleType)}
                className="bg-ink-bg border border-ink-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ink-gold"
              >
                <option value="buzz_spike">Buzz spike</option>
                <option value="nba_breakout">NBA breakout</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-500 text-xs uppercase tracking-widest">Player</label>
              <input
                value={player}
                onChange={(e) => setPlayer(e.target.value)}
                placeholder="e.g. Anthony Edwards"
                className="bg-ink-bg border border-ink-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ink-gold"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-500 text-xs uppercase tracking-widest">
                {type === "buzz_spike" ? "Spike % (default 100)" : "Δ PPG (default 5)"}
              </label>
              <input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder={type === "buzz_spike" ? "100" : "5"}
                inputMode="numeric"
                className="bg-ink-bg border border-ink-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ink-gold"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !player.trim() || !configured?.redis}
              className="self-end bg-ink-gold text-ink-bg font-semibold rounded-lg px-4 py-2 text-sm hover:brightness-95 disabled:opacity-50 transition"
            >
              {saving ? "Adding…" : "Add Rule"}
            </button>
          </form>

          {error && (
            <div className="bg-red-900/20 border border-ink-red rounded-xl p-4 text-ink-red text-sm mb-6">
              {error}
            </div>
          )}

          {/* Rules list */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-gray-500 text-xs uppercase tracking-widest">
              Active Rules {data ? `(${data.rules.length})` : ""}
            </h2>
            <button
              onClick={runCheck}
              disabled={checking || !configured?.redis || (data?.rules.length ?? 0) === 0}
              className="text-ink-gold text-xs uppercase tracking-widest font-semibold hover:underline disabled:opacity-40"
            >
              {checking ? "Checking…" : "Run Check Now"}
            </button>
          </div>

          {checkResult && (
            <div className="bg-ink-card border border-ink-border rounded-xl p-4 mb-6 text-sm">
              <p className="text-white">
                Checked {checkResult.checked} rule{checkResult.checked === 1 ? "" : "s"} —{" "}
                <span className={checkResult.fired > 0 ? "text-ink-green" : "text-gray-400"}>
                  {checkResult.fired} fired
                </span>
                {checkResult.fired > 0 && (
                  <span className="text-gray-500"> · {checkResult.notified} sent to Discord</span>
                )}
              </p>
              {checkResult.outcomes.some((o) => o.error) && (
                <ul className="text-ink-red text-xs mt-2 space-y-1">
                  {checkResult.outcomes
                    .filter((o) => o.error)
                    .map((o) => (
                      <li key={o.ruleId}>
                        {o.player}: {o.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {loading ? (
            <p className="text-gray-500 text-center py-12">Loading…</p>
          ) : (data?.rules.length ?? 0) === 0 ? (
            <p className="text-gray-500 text-center py-12">
              No rules yet. Add one above to start tracking.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {data!.rules.map((r: RuleWithState) => (
                <div
                  key={r.rule.id}
                  className="bg-ink-card border border-ink-border rounded-xl p-4 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-medium">{r.rule.player}</p>
                      <Badge
                        label={TYPE_LABEL[r.rule.type]}
                        tone={r.rule.type === "buzz_spike" ? "gold" : "positive"}
                      />
                      <span className="text-gray-600 text-xs">
                        {r.rule.type === "buzz_spike"
                          ? `spike ≥ ${r.rule.spikePct}% over trailing avg`
                          : `Δ PPG ≥ ${r.rule.deltaThreshold}`}
                      </span>
                    </div>
                    {r.lastValue && <p className="text-gray-500 text-xs mt-1">{r.lastValue}</p>}
                    <p className="text-gray-600 text-xs mt-1">
                      {r.lastCheckedAt
                        ? `Last checked ${new Date(r.lastCheckedAt).toLocaleString()}`
                        : "Not checked yet"}
                      {r.lastFiredAt && (
                        <span className="text-ink-green">
                          {" "}
                          · last fired {new Date(r.lastFiredAt).toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteRule(r.rule.id)}
                    className="text-gray-600 hover:text-ink-red text-xs uppercase tracking-widest shrink-0 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="border-t border-ink-border py-6 mt-12">
          <div className="max-w-5xl mx-auto px-6 text-center text-gray-600 text-xs">
            <p>
              Cron runs once daily on Vercel (Hobby plan minimum). Informational only, not
              investment advice.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
