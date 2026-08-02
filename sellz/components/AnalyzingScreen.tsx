"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useQuip, QuipLine, stageKeyFor } from "@/components/LoadingQuips";

const ORDER = ["identify", "comps", "retail", "refine"] as const;
const STEP_LABEL: Record<(typeof ORDER)[number], string> = {
  identify: "Identify",
  comps: "Comps",
  retail: "Retail",
  refine: "Refine",
};

/**
 * The full-screen takeover between submitting photos and the review page
 * appearing. Replaces what used to be a plain spinner in the submit button —
 * the pipeline is several sequential calls that can take a while, and a
 * static button gives no sense that anything is actually happening.
 */
export default function AnalyzingScreen({
  stage,
  photoPreview,
  findings = [],
}: {
  stage: string | null;
  photoPreview?: string | null;
  /** What each stage actually turned up, appended as it lands. */
  findings?: string[];
}) {
  const quip = useQuip(stage, true);
  const activeKey = stageKeyFor(stage) ?? "identify";
  const activeIndex = (ORDER as readonly string[]).indexOf(activeKey);

  return (
    <div className="flex min-h-[28rem] items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="relative mx-auto h-28 w-28">
          {/* A pulsing square ring rather than a circular spinner — this is a
              full moment of its own, not a background loading indicator, so
              it gets the app's shape language instead of a generic spinner. */}
          <motion.span
            className="absolute inset-0 border-2 border-brand"
            animate={{ scale: [1, 1.12, 1], opacity: [0.7, 0.15, 0.7] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.span
            className="absolute inset-3 border border-brand/50"
            animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.15, 0.5] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
          />
          <div className="absolute inset-6 flex items-center justify-center overflow-hidden border border-ink-border bg-ink-card">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="" className="h-full w-full object-cover opacity-80" />
            ) : (
              <span className="h-3 w-3 animate-pulse bg-brand" />
            )}
          </div>
        </div>

        <p className="mt-7 text-lg font-bold text-fog">{stage ?? "Working on it…"}</p>
        <QuipLine quip={quip} className="mt-1.5 justify-center text-center" />

        {/* What it has actually found so far. A stage name alone says the
            machine is busy; these say it is getting somewhere, which is what
            makes a long wait tolerable. */}
        {findings.length > 0 && (
          <div className="mt-5 space-y-1">
            <AnimatePresence initial={false}>
              {findings.map((f) => (
                <motion.p
                  key={f}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center gap-1.5 text-xs text-fog/60"
                >
                  <span className="text-brand">✓</span>
                  {f}
                </motion.p>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Where this sits in the pipeline, so the wait reads as progress
            rather than one indeterminate spinner. */}
        <div className="mt-8 flex items-center justify-center gap-1.5">
          {ORDER.map((key, i) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className={
                  "h-1.5 w-6 transition-colors " +
                  (i < activeIndex
                    ? "bg-brand/40"
                    : i === activeIndex
                      ? "bg-brand"
                      : "bg-ink-border")
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-center gap-6 text-xs font-medium text-fog/50">
          {ORDER.map((key) => (
            <span key={key} className={key === activeKey ? "text-brand" : ""}>
              {STEP_LABEL[key]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
