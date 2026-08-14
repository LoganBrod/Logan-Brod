"use client";

/**
 * How to photograph a wardrobe, shown rather than described.
 *
 * What was here was one sentence and a button: "Photograph what's in your
 * wardrobe — several pieces per photo is fine." Every word of that is true and
 * it still left the actual question unanswered, which is *how much* to put in
 * frame and *what happens next*. People either photograph one jumper and stop,
 * or photograph a wardrobe door and get nothing back.
 *
 * So it is three steps, numbered — legitimately, because this is a sequence and
 * the order matters — with the upload control living inside step two rather
 * than floating above the explanation of it. Step three completes itself once
 * there is something to show, so the walkthrough is also the progress bar.
 */

const STEPS = [
  {
    title: "Lay a few pieces out",
    body: "On the bed, on the floor, over a chair — anywhere they are not overlapping. Four or five at a time reads better than a whole rail at once.",
  },
  {
    title: "Photograph them",
    body: "Several pieces per photo is fine, and several photos at once is fine. It reads every garment it can see in each one.",
  },
  {
    title: "Check what it read",
    body: "Each piece comes back named — a colour, a material, a season. Anything it got wrong you can remove, and anything it missed you can add.",
  },
] as const;

/** A flat-lay of three garment shapes, drawn rather than photographed. */
function LayFlat() {
  return (
    <svg viewBox="0 0 96 56" aria-hidden className="h-12 w-full" fill="none">
      {[6, 36, 66].map((x, i) => (
        <rect
          key={x}
          x={x}
          y={10 + i * 2}
          width="24"
          height="34"
          rx="2"
          className="fill-room-sunk stroke-room-line"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

/** A lens, open. */
function Lens() {
  return (
    <svg viewBox="0 0 96 56" aria-hidden className="h-12 w-full" fill="none">
      <rect x="26" y="14" width="44" height="30" rx="3" className="stroke-room-line" strokeWidth="1.5" />
      <circle cx="48" cy="29" r="9" className="stroke-room-ink/50" strokeWidth="1.5" />
      <rect x="40" y="9" width="16" height="6" rx="2" className="fill-room-line" />
    </svg>
  );
}

/** Three tags on a rail — what comes back. */
function Tags() {
  return (
    <svg viewBox="0 0 96 56" aria-hidden className="h-12 w-full" fill="none">
      <line x1="10" y1="16" x2="86" y2="16" className="stroke-room-line" strokeWidth="1.5" />
      {[20, 44, 68].map((x) => (
        <g key={x}>
          <path d={`M${x + 4} 16 v4`} className="stroke-room-line" strokeWidth="1.5" />
          <rect
            x={x}
            y="20"
            width="9"
            height="22"
            rx="1.5"
            className="fill-room-sunk stroke-room-line"
            strokeWidth="1"
          />
        </g>
      ))}
    </svg>
  );
}

const ART = [LayFlat, Lens, Tags];

export default function WardrobeWalkthrough({
  /** Where step two's control goes — the real upload button, not a copy of it. */
  uploadControl,
  /** Once anything has been catalogued, step three is no longer hypothetical. */
  cataloguedCount,
}: {
  uploadControl: React.ReactNode;
  cataloguedCount: number;
}) {
  return (
    <ol className="grid gap-px overflow-hidden rounded-sm border border-room-line bg-room-line sm:grid-cols-3">
      {STEPS.map((step, index) => {
        const Art = ART[index];
        // Step three is the only one that can be finished, because it is the
        // only one the app can see the result of.
        const done = index === 2 && cataloguedCount > 0;
        return (
          <li key={step.title} className="flex flex-col gap-3 bg-room-panel px-5 py-5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11px] tabular-nums text-room-faint">
                {index + 1}
              </span>
              <h3 className="text-sm font-semibold tracking-[-0.01em] text-room-ink">
                {step.title}
              </h3>
              {done && (
                <span className="ml-auto text-[11px] font-medium text-accent">
                  {cataloguedCount} read
                </span>
              )}
            </div>

            <Art />

            <p className="text-[13px] leading-relaxed text-room-muted">{step.body}</p>

            {index === 1 && <div className="mt-auto pt-1">{uploadControl}</div>}
          </li>
        );
      })}
    </ol>
  );
}
