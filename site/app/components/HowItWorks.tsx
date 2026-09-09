import Reveal from "./Reveal";

/**
 * Three steps, with a picture of each.
 *
 * What stood here was four paragraphs about how the thing thinks - true, and
 * the wrong question. Somebody who has scrolled past the upload form is not
 * asking how it judges a photograph; they are asking what they are meant to
 * do. So: photograph, upload, keep. Three pictures and about twenty words.
 *
 * The pictures are drawn from the app's own parts rather than illustrated or
 * stocked. Each panel is the real garment photography arranged the way that
 * step actually looks - snapshots on a table, two thumbnails in a drop zone,
 * pieces hanging from a rail - so it stays in the site's palette, follows the
 * theme, and cannot go stale against a redesign the way a screenshot does.
 * The cut-outs come with their own hangers, which is why the third one can
 * simply hang them on a line.
 */

/** One garment, cut out, at the size a panel needs. */
function Piece({ name, className, alt = "" }: { name: string; className?: string; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/garments-sm/${name}.webp`}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      loading="lazy"
      decoding="async"
      className={`select-none object-contain ${className ?? ""}`}
    />
  );
}

/** Photographs on a table: three tiles, each turned a little, as they fall. */
function PanelPhotograph() {
  return (
    <div className="relative h-full w-full">
      {[
        // Pulled inside the panel rather than bled off it: rotated, a tile at
        // the very edge is clipped along one side and reads as a mistake.
        { name: "garment-jacket-teal", style: "left-[4%] top-[18%] w-[34%] -rotate-6" },
        { name: "garment-knit-amber", style: "left-[33%] top-[9%] w-[35%] rotate-2 z-10" },
        { name: "garment-shirt", style: "left-[62%] top-[18%] w-[34%] rotate-6" },
      ].map((tile) => (
        <div
          key={tile.name}
          className={`absolute aspect-[3/4] overflow-hidden rounded-[6px] bg-white p-2 shadow-[0_8px_18px_rgba(10,10,12,0.22)] ${tile.style}`}
        >
          <Piece name={tile.name} className="h-full w-full" />
        </div>
      ))}
    </div>
  );
}

/** The form, as it looks with two pictures in it and a price set. */
function PanelUpload() {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 px-[12%]">
      <div className="flex gap-2 rounded-[8px] border border-dashed border-room-line bg-room-panel p-2.5">
        {["garment-pants-clay", "garment-shirt-cobalt"].map((name) => (
          <div key={name} className="aspect-[3/4] w-1/4 overflow-hidden rounded-[4px] bg-white">
            <Piece name={name} className="h-full w-full p-1" />
          </div>
        ))}
        <div className="flex aspect-[3/4] w-1/4 items-center justify-center rounded-[4px] border border-room-line text-room-faint">
          <span aria-hidden className="text-lg leading-none">+</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-room-line bg-room-panel px-2.5 py-1 font-mono text-[10px] tabular-nums text-room-muted">
          $40 – $220
        </span>
        <span className="rounded-sm bg-room-ink px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-room-on-ink">
          Build
        </span>
      </div>
    </div>
  );
}

/** What comes back: pieces on a rail, and the code it is kept under. */
function PanelKeep() {
  return (
    <div className="relative h-full w-full">
      {/* The rail. The cut-outs carry their own hangers, so they only have to
          be placed for their hooks to cross it. */}
      <div aria-hidden className="absolute inset-x-[8%] top-[20%] h-px bg-room-line" />
      <div className="absolute inset-x-[8%] top-[16%] flex items-start justify-between">
        <Piece name="garment-jacket-plum" className="w-[28%]" />
        <Piece name="garment-knit-moss" className="w-[28%]" />
        <Piece name="garment-pants-indigo" className="w-[28%]" />
      </div>
      <span className="absolute bottom-[10%] left-1/2 -translate-x-1/2 rounded-sm border border-room-line bg-room-panel px-3 py-1 font-mono text-[10px] tracking-[0.25em] text-room-muted">
        K7M2QP
      </span>
    </div>
  );
}

const STEPS = [
  {
    title: "Photograph what you like",
    body: "Three or four pieces you own, or wish you did. Pictures, never keywords.",
    panel: <PanelPhotograph />,
  },
  {
    title: "Upload them, say what you'd spend",
    body: "That is the whole form. It reads the photographs and writes its own searches.",
    panel: <PanelUpload />,
  },
  {
    title: "Keep the clozet it builds",
    body: "Real listings, still for sale. Save one and it gets a code you can come back to.",
    panel: <PanelKeep />,
  },
];

export default function HowItWorks() {
  return (
    <section aria-label="How to use Clozet" className="mt-24 border-t border-room-line pt-16">
      <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-room-ink">
        Three steps, about two minutes.
      </h2>

      <ol className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <Reveal delay={index * 0.06}>
              <div className="panel aspect-[4/3] overflow-hidden">
                {step.panel}
              </div>
              <div className="mt-4 flex items-baseline gap-3">
                <span className="font-mono text-[12px] tabular-nums text-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-room-ink">
                  {step.title}
                </h3>
              </div>
              <p className="mt-2 pl-8 text-[13.5px] leading-relaxed text-room-muted">{step.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
