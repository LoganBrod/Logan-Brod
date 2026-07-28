"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Reveal from "@/components/Reveal";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

interface Playbook {
  updatedAt: string;
  summary: string;
  listingGuidelines: string;
  pricingGuidelines: string;
  avoid: string;
  experiments?: { id: string; hypothesis: string; instruction: string }[];
  experimentResults?: string;
}

interface SeedListing {
  id: string;
  description: string;
  source?: string;
  stats?: string;
}

const field =
  "w-full rounded-lg border border-ink-border bg-ink px-2 py-1.5 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none transition-colors";

export default function BrainPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="The Brain"
        subtitle="Every grade, diagnosis, and draft listing traces back to what's set here."
      />
      <SellerPanel />
      <Suspense fallback={null}>
        <IntegrationsPanel />
      </Suspense>
      <AutomationPanel />
      <BrainPanel />
    </div>
  );
}

interface EbayStatus {
  configured: boolean;
  connected: boolean;
  env?: string;
  connectedAt?: string;
}

function IntegrationsPanel() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<EbayStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    return fetch("/api/ebay/status", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Status check failed (HTTP ${r.status})`);
        return r.json();
      })
      .then((d: EbayStatus) => {
        setStatus(d);
        setLoadError(null);
        return d;
      })
      .catch((err) => {
        setLoadError(
          err instanceof Error ? err.message : "Couldn't reach the eBay status endpoint"
        );
        return undefined;
      });
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (searchParams.get("ebay") === "connected") {
      toast.push("eBay account connected");
      load();
      router.replace("/brain");
    }
    const err = searchParams.get("ebayError");
    if (err) {
      toast.push(decodeURIComponent(err), "error");
      router.replace("/brain");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/ebay/disconnect", { method: "POST" });
      if (!res.ok) throw new Error(`Disconnect failed (HTTP ${res.status})`);
      // Re-check before claiming success. Previously this reported
      // "disconnected" even when the server hadn't actually cleared anything.
      const fresh = await load();
      if (fresh?.connected) {
        toast.push("eBay still shows as connected, try again", "error");
      } else {
        toast.push("eBay disconnected");
      }
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Disconnect failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Reveal index={2}>
      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <h2 className="text-lg font-extrabold text-fog">Integrations</h2>
        <p className="mt-1 text-sm text-fog/60">
          Connect eBay to auto-pull views and sold price/date instead of typing them in.
        </p>
        {loadError && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {loadError}
          </p>
        )}
        {!status ? (
          <p className="mt-4 text-xs text-fog/40">Checking eBay connection…</p>
        ) : (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-ink p-4">
          <div className="min-w-0">
            <p className="font-semibold text-fog">eBay</p>
            {!status.configured ? (
              <p className="mt-0.5 text-xs text-fog/40">
                Not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RUNAME in .env.local
              </p>
            ) : status.connected ? (
              <p className="mt-0.5 text-xs text-brand">
                Connected ({status.env})
                {status.connectedAt && ` · since ${new Date(status.connectedAt).toLocaleDateString()}`}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-fog/40">Not connected</p>
            )}
          </div>
          {status.configured &&
            (status.connected ? (
              <button
                onClick={disconnect}
                disabled={busy}
                className="shrink-0 rounded-lg bg-ink-border px-4 py-2 text-sm font-semibold text-fog transition hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : (
              <a
                href="/api/ebay/connect"
                className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim"
              >
                Connect eBay account
              </a>
            ))}
        </div>
        )}

        {status?.connected && <InventoryLocationPanel />}
      </section>
    </Reveal>
  );
}

interface LocationSummary {
  merchantLocationKey: string;
  name?: string;
  postalCode?: string;
  country?: string;
}

/**
 * eBay refuses to publish an offer without an inventory location, and unlike
 * business policies there is no page on eBay to create one — it exists only
 * through the API. So it has to be creatable from here.
 */
function InventoryLocationPanel() {
  const toast = useToast();
  const [locations, setLocations] = useState<LocationSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    country: "US",
    postalCode: "",
    city: "",
    stateOrProvince: "",
    name: "Home",
  });

  function load() {
    fetch("/api/ebay/location", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLocations(d.locations ?? []))
      .catch(() => setLocations([]));
  }

  useEffect(load, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ebay/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create the location");
      toast.push("Inventory location created");
      setOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the location");
    } finally {
      setBusy(false);
    }
  }

  const has = (locations?.length ?? 0) > 0;

  return (
    <div className="mt-3 rounded-xl bg-ink p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-fog">Inventory location</p>
          {locations === null ? (
            <p className="mt-0.5 text-xs text-fog/40">Checking…</p>
          ) : has ? (
            <p className="mt-0.5 text-xs text-brand">
              {locations!
                .map((l) => [l.name, l.postalCode, l.country].filter(Boolean).join(" · "))
                .join(", ")}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-fog/40">
              Required before eBay will publish. There is no page on eBay for this, so create it
              here.
            </p>
          )}
        </div>
        {locations !== null && !has && (
          <button
            onClick={() => setOpen(!open)}
            className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim"
          >
            {open ? "Cancel" : "Add location"}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3 text-sm">
              <p className="text-xs text-fog/40">
                eBay needs either a postal code or a city and state, plus the country. A street
                address isn&apos;t required — this is just where stock ships from.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs text-fog/50">Country (2 letters)</span>
                  <input
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
                    maxLength={2}
                    className={field}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-fog/50">Postal / ZIP code</span>
                  <input
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                    placeholder="e.g. 55401"
                    className={field}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-fog/50">City (if no postal code)</span>
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className={field}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-fog/50">State / province</span>
                  <input
                    value={form.stateOrProvince}
                    onChange={(e) => setForm({ ...form, stateOrProvince: e.target.value })}
                    className={field}
                  />
                </label>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={create}
                disabled={busy}
                className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create location"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SellerPanel() {
  const toast = useToast();
  const [s, setS] = useState({ niche: "", platforms: "", shipping: "", style: "" });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Couldn't load settings (HTTP ${r.status})`);
        return r.json();
      })
      .then((d) => {
        setS({ niche: d.niche, platforms: d.platforms, shipping: d.shipping, style: d.style });
        setLoaded(true);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Couldn't load settings")
      );
  }, []);

  async function save() {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    if (res.ok) toast.push("Saved");
    else toast.push(`Save failed (HTTP ${res.status})`, "error");
  }

  return (
    <Reveal>
      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <h2 className="text-lg font-extrabold text-fog">What do you sell?</h2>
        <p className="mt-1 text-sm text-fog/60">
          Every graded and generated listing is anchored to this.
        </p>
        {loadError && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {loadError}
          </p>
        )}
        {!loaded && !loadError && (
          <p className="mt-4 text-xs text-fog/40">Loading…</p>
        )}
        {loaded && (
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-fog/50">Niche</span>
            <textarea
              rows={2}
              value={s.niche}
              onChange={(e) => setS({ ...s, niche: e.target.value })}
              placeholder="e.g. Y2K and vintage streetwear: Nike, Carhartt, band tees, sizes M-XL"
              className={field}
            />
          </label>
          <label className="space-y-1">
            <span className="text-fog/50">Platforms</span>
            <input
              value={s.platforms}
              onChange={(e) => setS({ ...s, platforms: e.target.value })}
              className={field}
            />
          </label>
          <label className="space-y-1">
            <span className="text-fog/50">Shipping</span>
            <input
              value={s.shipping}
              onChange={(e) => setS({ ...s, shipping: e.target.value })}
              placeholder="e.g. free US shipping, ships next day"
              className={field}
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-fog/50">Shop style</span>
            <input
              value={s.style}
              onChange={(e) => setS({ ...s, style: e.target.value })}
              className={field}
            />
          </label>
        </div>
        )}
        {loaded && (
          <div className="mt-4">
            <button
              onClick={save}
              className="rounded-lg bg-brand px-6 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim active:scale-95"
            >
              Save
            </button>
          </div>
        )}
      </section>
    </Reveal>
  );
}

type AutomationLevel = "manual" | "semi" | "auto";

interface AutoApplyRules {
  maxPriceDrop: number;
  maxPriceDropPct: number;
  autoRetitle: boolean;
  autoRelist: boolean;
  requireReviewForRewrite: boolean;
  minConfidence: number;
}

interface AutomationState {
  automationLevel: AutomationLevel;
  autoApplyRules: AutoApplyRules;
  relistEnabled: boolean;
  defaultRelistDays: number;
}

const DEFAULT_RULES: AutoApplyRules = {
  maxPriceDrop: 5,
  maxPriceDropPct: 10,
  autoRetitle: true,
  autoRelist: true,
  requireReviewForRewrite: true,
  minConfidence: 60,
};

const LEVELS: { key: AutomationLevel; label: string; blurb: string }[] = [
  {
    key: "manual",
    label: "Manual",
    blurb: "Every change waits for you. Nothing reaches eBay unapproved.",
  },
  {
    key: "semi",
    label: "Semi-auto",
    blurb: "Small, confident changes apply themselves. Everything else queues.",
  },
  {
    key: "auto",
    label: "Full auto",
    blurb: "The Brain applies any change it is confident about, unattended.",
  },
];

/**
 * Controls how much the Brain is allowed to change on live eBay listings
 * without being asked. These settings spend real money, so the panel states
 * plainly what each level does rather than leaning on the labels.
 */
function AutomationPanel() {
  const toast = useToast();
  const [s, setS] = useState<AutomationState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Couldn't load settings (HTTP ${r.status})`);
        return r.json();
      })
      .then((d) =>
        setS({
          automationLevel: d.automationLevel ?? "manual",
          autoApplyRules: { ...DEFAULT_RULES, ...(d.autoApplyRules ?? {}) },
          relistEnabled: Boolean(d.relistEnabled),
          defaultRelistDays: d.defaultRelistDays ?? 10,
        })
      )
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Couldn't load automation settings")
      );
  }, []);

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`);
      toast.push("Automation settings saved");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  const rules = s?.autoApplyRules ?? DEFAULT_RULES;
  const setRules = (patch: Partial<AutoApplyRules>) =>
    s && setS({ ...s, autoApplyRules: { ...s.autoApplyRules, ...patch } });

  return (
    <Reveal index={3}>
      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <h2 className="text-lg font-extrabold text-fog">Automation</h2>
        <p className="mt-1 text-sm text-fog/60">
          How much the Brain can change on your live listings without asking.
        </p>

        {loadError && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {loadError}
          </p>
        )}
        {!s && !loadError && <p className="mt-4 text-xs text-fog/40">Loading…</p>}

        {s && (
          <div className="mt-4 space-y-5">
            <div className="grid gap-2 sm:grid-cols-3">
              {LEVELS.map((l) => {
                const active = s.automationLevel === l.key;
                return (
                  <button
                    key={l.key}
                    onClick={() => setS({ ...s, automationLevel: l.key })}
                    className={
                      "rounded-xl border p-3 text-left transition " +
                      (active
                        ? "border-brand bg-brand/10"
                        : "border-ink-border bg-ink hover:border-brand/40")
                    }
                  >
                    <span
                      className={
                        "block text-sm font-bold " + (active ? "text-brand" : "text-fog")
                      }
                    >
                      {l.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-fog/50">
                      {l.blurb}
                    </span>
                  </button>
                );
              })}
            </div>

            {s.automationLevel === "auto" && (
              <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
                Full auto ignores the limits below. Any change the Brain scores above its
                confidence threshold goes straight to your live listings, including large price
                moves and full rewrites. Semi-auto is the safer default.
              </p>
            )}

            {s.automationLevel === "semi" && (
              <div className="space-y-3 rounded-xl border border-ink-border bg-ink p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
                  Limits for automatic changes
                </h3>
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-fog/50">Max price change ($)</span>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={rules.maxPriceDrop}
                      onChange={(e) => setRules({ maxPriceDrop: Number(e.target.value) })}
                      className={`${field} bg-ink-card`}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-fog/50">Max price change (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={rules.maxPriceDropPct}
                      onChange={(e) => setRules({ maxPriceDropPct: Number(e.target.value) })}
                      className={`${field} bg-ink-card`}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-fog/50">Min confidence</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={rules.minConfidence}
                      onChange={(e) => setRules({ minConfidence: Number(e.target.value) })}
                      className={`${field} bg-ink-card`}
                    />
                  </label>
                </div>
                <p className="text-xs text-fog/40">
                  Both caps must pass, and they apply to raises as well as drops. Anything larger
                  waits for your approval.
                </p>

                <div className="space-y-2 pt-1">
                  <Toggle
                    checked={rules.autoRetitle}
                    onChange={(v) => setRules({ autoRetitle: v })}
                    label="Apply new titles automatically"
                  />
                  <Toggle
                    checked={rules.requireReviewForRewrite}
                    onChange={(v) => setRules({ requireReviewForRewrite: v })}
                    label="Always review full description rewrites"
                  />
                  <Toggle
                    checked={rules.autoRelist}
                    onChange={(v) => setRules({ autoRelist: v })}
                    label="Apply relist proposals automatically"
                  />
                </div>
              </div>
            )}

            <div className="space-y-3 rounded-xl border border-ink-border bg-ink p-4">
              <Toggle
                checked={s.relistEnabled}
                onChange={(v) => setS({ ...s, relistEnabled: v })}
                label="Cycle stale listings on a schedule"
              />
              {s.relistEnabled && (
                <>
                  <label className="block max-w-[12rem] space-y-1 text-sm">
                    <span className="text-fog/50">Relist after (days)</span>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={s.defaultRelistDays}
                      onChange={(e) =>
                        setS({ ...s, defaultRelistDays: Number(e.target.value) })
                      }
                      className={`${field} bg-ink-card`}
                    />
                  </label>
                  <p className="text-xs leading-relaxed text-fog/40">
                    Relisting ends the listing and puts it back up fresh, which{" "}
                    <span className="text-fog/60">loses its watchers</span> and can cost an
                    insertion fee once you are past your free allotment. Cycling the same item
                    repeatedly can also fall foul of eBay&apos;s search-manipulation rules, so
                    keep the interval generous. Only listings published through LevoZ can be
                    cycled — anything listed in the eBay app has no offer to withdraw.
                  </p>
                </>
              )}
            </div>

            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-brand px-6 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim active:scale-95 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </section>
    </Reveal>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 text-left text-sm"
    >
      <span
        className={
          "relative h-5 w-9 shrink-0 rounded-full transition-colors " +
          (checked ? "bg-brand" : "bg-ink-border")
        }
      >
        <span
          className={
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform " +
            (checked ? "translate-x-[1.125rem]" : "translate-x-0.5")
          }
        />
      </span>
      <span className="text-fog/70">{label}</span>
    </button>
  );
}

type PlaybookTab = "guidelines" | "avoid" | "experiments";
const PLAYBOOK_TABS: { key: PlaybookTab; label: string }[] = [
  { key: "guidelines", label: "Guidelines" },
  { key: "avoid", label: "Avoid" },
  { key: "experiments", label: "Experiments" },
];

function BrainPanel() {
  const toast = useToast();
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [tab, setTab] = useState<PlaybookTab>("guidelines");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeds, setSeeds] = useState<SeedListing[]>([]);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedDesc, setSeedDesc] = useState("");
  const [seedStats, setSeedStats] = useState("");
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/evolve").then((r) => r.json()).then(setPlaybook).catch(() => {});
    fetch("/api/seeds").then((r) => r.json()).then(setSeeds).catch(() => {});
  }, []);

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/evolve", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setPlaybook(data);
      toast.push("Playbook updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function addSeed() {
    setSeedError(null);
    const res = await fetch("/api/seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: seedDesc, stats: seedStats }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSeedError(data.error ?? "Couldn't add reference");
      return;
    }
    setSeeds(data);
    setSeedDesc("");
    setSeedStats("");
  }

  async function removeSeed(id: string) {
    const res = await fetch(`/api/seeds?id=${id}`, { method: "DELETE" });
    if (res.ok) setSeeds(await res.json());
  }

  return (
    <Reveal index={1}>
      <section className="rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-fog">
              Performance <span className="text-brand">· learns why things sell</span>
            </h2>
            <p className="text-sm text-fog/60">
              Import listings with outcomes, sold and stuck, then analyze.
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={analyze}
            disabled={analyzing}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : "Analyze sales"}
          </motion.button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-4 rounded-xl border border-ink-border bg-ink p-3 text-sm">
          <button
            onClick={() => setSeedOpen(!seedOpen)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="font-semibold text-fog">
              Pre-feed the Brain{" "}
              <span className="text-xs font-normal text-fog/40">
                · {seeds.length} reference listing{seeds.length === 1 ? "" : "s"}
              </span>
            </span>
            <span className="text-fog/40">{seedOpen ? "▲" : "▼"}</span>
          </button>
          <AnimatePresence initial={false}>
            {seedOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-fog/40">
                    Describe listings in your niche that sold well to bootstrap the
                    playbook before you have your own data.
                  </p>
                  <textarea
                    value={seedDesc}
                    onChange={(e) => setSeedDesc(e.target.value)}
                    rows={2}
                    maxLength={600}
                    placeholder="e.g. 'Vintage Carhartt Detroit L, title led with brand+model+size, 12 photos incl. flaws close-up, priced $95 (comps 80-110), sold in 3 days with 8 watchers.'"
                    className={`${field} bg-ink-card`}
                  />
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={seedStats}
                      onChange={(e) => setSeedStats(e.target.value)}
                      placeholder="Stats (optional), e.g. sold in 3 days"
                      className={`${field} min-w-0 flex-1 bg-ink-card`}
                    />
                    <button
                      onClick={addSeed}
                      disabled={seedDesc.trim().length < 10}
                      className="rounded-lg bg-brand px-4 py-1.5 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  {seedError && <p className="text-xs text-red-400">{seedError}</p>}
                  {seeds.length > 0 && (
                    <ul className="space-y-1.5">
                      {seeds.map((s) => (
                        <li key={s.id} className="flex items-start gap-2 text-xs">
                          <span className="min-w-0 flex-1 text-fog/70">
                            {s.description}
                            {s.stats && <span className="text-brand"> · {s.stats}</span>}
                          </span>
                          <button
                            onClick={() => removeSeed(s.id)}
                            className="shrink-0 text-fog/40 hover:text-red-400"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {playbook && (
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-xl border border-brand/20 bg-ink p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
                Why things sell (and don't)
              </h3>
              <p className="mt-1 text-fog/80">{playbook.summary}</p>
            </div>

            <div className="flex w-fit gap-1 rounded-lg border border-ink-border bg-ink p-1">
              {PLAYBOOK_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={
                    "relative rounded-md px-3 py-1.5 text-xs font-semibold transition-colors " +
                    (tab === t.key ? "text-ink" : "text-fog/60 hover:text-fog")
                  }
                >
                  {tab === t.key && (
                    <motion.span
                      layoutId="brain-tab-pill"
                      className="absolute inset-0 rounded-md bg-brand"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{t.label}</span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
              >
                {tab === "guidelines" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-ink p-3">
                      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
                        Listings
                      </h3>
                      <p className="mt-1 whitespace-pre-wrap text-fog/70">
                        {playbook.listingGuidelines}
                      </p>
                    </div>
                    <div className="rounded-xl bg-ink p-3">
                      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
                        Pricing
                      </h3>
                      <p className="mt-1 whitespace-pre-wrap text-fog/70">
                        {playbook.pricingGuidelines}
                      </p>
                    </div>
                  </div>
                )}

                {tab === "avoid" && (
                  <div className="rounded-xl bg-ink p-3">
                    <p className="whitespace-pre-wrap text-fog/70">{playbook.avoid}</p>
                  </div>
                )}

                {tab === "experiments" && (
                  <div className="space-y-3">
                    {playbook.experiments && playbook.experiments.length > 0 ? (
                      <div className="rounded-xl border border-brand/30 bg-ink p-3">
                        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
                          🧪 Running experiments
                        </h3>
                        <ul className="mt-1 space-y-1.5">
                          {playbook.experiments.map((e) => (
                            <li key={e.id} className="text-fog/80">
                              {e.hypothesis}
                              <span className="block text-xs text-fog/40">
                                Variant listings: "{e.instruction}"
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs text-fog/40">
                          Generated listings rotate between these variants and a
                          control group. The next analysis declares winners.
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-fog/40">
                        No experiments running yet. Analyze again once you have a
                        few more outcomes.
                      </p>
                    )}
                    {playbook.experimentResults && (
                      <div className="rounded-xl bg-ink p-3">
                        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-fog/50">
                          Last experiment results
                        </h3>
                        <p className="mt-1 whitespace-pre-wrap text-fog/70">
                          {playbook.experimentResults}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <p className="text-xs text-fog/40">
              Last analyzed {new Date(playbook.updatedAt).toLocaleString()}
            </p>
          </div>
        )}
      </section>
    </Reveal>
  );
}
