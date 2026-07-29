"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import StepRail, { type RailStep } from "@/components/StepRail";
import { useToast } from "@/components/Toast";

const field =
  "w-full rounded-lg border border-ink-border bg-ink px-3 py-2 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none transition-colors";

type Step = "niche" | "ebay" | "done";

/**
 * First-run setup. Only two things actually matter before a seller can get
 * value: what they sell (which anchors every prompt) and an eBay connection
 * (which is what makes publishing and real comps possible). Both are
 * skippable — a drafted listing is still useful without either.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>("niche");
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ebayConnected, setEbayConnected] = useState(false);
  const [s, setS] = useState({
    niche: "",
    platforms: "eBay",
    shipping: "",
    style: "honest, detailed, no fluff",
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/ebay/status", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([settings, status]) => {
      if (status?.connected) setEbayConnected(true);
      // Someone who already told us their niche does not need this wizard
      // again — send them where they were trying to go.
      if (settings?.niche?.trim()) {
        router.replace("/new");
        return;
      }
      if (settings) setS((prev) => ({ ...prev, ...pickStrings(settings) }));
      setChecking(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveNiche() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      if (!res.ok) throw new Error("Couldn't save");
      setStep("ebay");
    } catch {
      toast.push("Couldn't save that — try again", "error");
    } finally {
      setSaving(false);
    }
  }

  const rail: RailStep[] = [
    { key: "niche", label: "What you sell", done: step !== "niche" },
    { key: "ebay", label: "Connect eBay", done: ebayConnected },
    { key: "done", label: "First listing" },
  ];

  if (checking) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <div className="h-32 animate-pulse rounded-2xl bg-ink-deep" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-5 py-14">
      <StepRail steps={rail} current={step} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          {step === "niche" && (
            <>
              <PageHeader
                title="What do you sell?"
                subtitle="Every price, title and grade is anchored to this. A sentence is enough."
              />
              <section className="mt-5 rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-fog/50">Your niche</span>
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
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    onClick={saveNiche}
                    disabled={saving || !s.niche.trim()}
                    className="rounded-xl bg-brand px-6 py-3 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-40"
                  >
                    {saving ? "Saving…" : "Next"}
                  </button>
                  <button
                    onClick={() => setStep("ebay")}
                    className="text-xs font-semibold text-fog/50 transition hover:text-fog"
                  >
                    Skip for now →
                  </button>
                </div>
              </section>
            </>
          )}

          {step === "ebay" && (
            <>
              <PageHeader
                title="Connect your eBay account"
                subtitle="So listings can publish, and so pricing can look at what really sold."
              />
              <section className="mt-5 rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
                {ebayConnected ? (
                  <p className="text-sm font-bold text-brand">eBay is already connected.</p>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-fog/70">
                      Linking eBay lets LevoZ publish finished listings, pull in what you already
                      have live, and price against real sales instead of guesswork. You can do this
                      later from the Brain page.
                    </p>
                    <a
                      href="/api/ebay/connect"
                      className="mt-5 inline-block rounded-xl bg-brand px-6 py-3 font-bold text-ink transition hover:bg-brand-dim"
                    >
                      Connect eBay
                    </a>
                  </>
                )}
                <div className="mt-5 border-t border-ink-border pt-4">
                  <button
                    onClick={() => router.push("/new")}
                    className="text-sm font-semibold text-brand hover:underline"
                  >
                    {ebayConnected ? "List your first item →" : "Skip and draft a listing →"}
                  </button>
                </div>
              </section>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Only carry over the string fields this form owns. */
function pickStrings(d: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const k of ["niche", "platforms", "shipping", "style"]) {
    if (typeof d[k] === "string") out[k] = d[k] as string;
  }
  return out;
}
