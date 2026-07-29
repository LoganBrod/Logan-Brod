"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Playful filler lines for the listing pipeline's real stages. The pipeline
 * runs as several sequential model/API calls that together take a while —
 * this is what keeps the wait from reading as "is it stuck?" without lying
 * about what's happening. The heading above these is always the real stage
 * ("Checking comparable eBay sales…"); these are just company while it runs.
 */
const STAGE_QUIPS: Record<string, string[]> = {
  identify: [
    "Squinting at the tag…",
    "Zooming in on the stitching…",
    "Arguing internally about the brand…",
    "Checking for flaws you might've missed…",
    "Reading every label twice…",
  ],
  comps: [
    "Digging through eBay's sold history…",
    "Asking the top-rated sellers for gossip…",
    "Cross-referencing a hundred listings…",
    "Politely ignoring anyone with bad feedback…",
    "Consulting the group chat…",
  ],
  retail: [
    "Googling what this cost new…",
    "Time-traveling to the release date…",
    "Checking the original price tag…",
    "Asking someone who was there…",
  ],
  refine: [
    "Sharpening the title…",
    "Trimming the fluff…",
    "Making sure the numbers add up…",
    "Reading it back one more time…",
  ],
};

const GENERAL_QUIPS = [
  "Consulting genies…",
  "Bribing the algorithm…",
  "Double-checking with a magnifying glass…",
  "Counting pixels…",
  "Measuring vibes…",
  "Summoning the comps…",
  "Whispering to the eBay gods…",
  "Doing the math, carefully…",
  "Polishing the photos…",
  "Waking up the appraiser…",
];

/** Maps the real stage strings from app/new/page.tsx onto a quip pool. */
export function stageKeyFor(stage: string | null): keyof typeof STAGE_QUIPS | null {
  if (!stage) return null;
  const s = stage.toLowerCase();
  if (s.includes("identif")) return "identify";
  if (s.includes("comparable") || s.includes("ebay sales")) return "comps";
  if (s.includes("sold for new") || s.includes("retail")) return "retail";
  if (s.includes("refin")) return "refine";
  return null;
}

function pickQuip(stage: string | null, last: string | null): string {
  const key = stageKeyFor(stage);
  const pool = [...(key ? STAGE_QUIPS[key] : []), ...GENERAL_QUIPS];
  // Avoid repeating the line that's still fading out.
  const options = pool.length > 1 ? pool.filter((q) => q !== last) : pool;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Rotates a fun line every `intervalMs` while `active`, biased by stage.
 *
 * The first render must be identical on the server and the client, or
 * hydration fails outright — so the initial quip is the fixed first line of
 * the pool, never `Math.random()`. The random rotation only starts inside the
 * effect, which never runs during SSR, so there is nothing for the client to
 * disagree with the server about.
 */
export function useQuip(stage: string | null, active: boolean, intervalMs = 1700): string {
  const [quip, setQuip] = useState<string>(GENERAL_QUIPS[0]);

  useEffect(() => {
    if (!active) return;
    setQuip((prev) => pickQuip(stage, prev));
    const t = setInterval(() => {
      setQuip((prev) => pickQuip(stage, prev));
    }, intervalMs);
    return () => clearInterval(t);
    // Deliberately not re-keyed on the quip itself — only the stage and the
    // ticking interval should reset the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, active, intervalMs]);

  return quip;
}

/** The quip line itself: each new one slides up and fades past the last. */
export function QuipLine({ quip, className }: { quip: string; className?: string }) {
  return (
    <div className={"relative h-5 overflow-hidden " + (className ?? "")}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={quip}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-0 text-sm text-fog/45"
        >
          {quip}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
