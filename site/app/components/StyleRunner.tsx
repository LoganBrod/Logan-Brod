"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Closet, ClosetContents } from "@/lib/closet";
import type { CuratedItem } from "@/lib/curate";
import type { StyleProfile } from "@/lib/schemas";
import type { ProductListing, SourceReport } from "@/lib/sources/types";
import { encodePhotos } from "@/lib/image";
import { MAX_PHOTOS, describeRejections, selectPhotos } from "@/lib/photos";
import { PICKS_PER_BATCH, appendPicks, planBatches } from "@/lib/batching";
import { LETTER_SIZES, type Sizes } from "@/lib/sizing";
import ClosetStage, { prefersReducedMotion, type StagePhase } from "./ClosetStage";
import JudgePanel from "./JudgePanel";

type Stage = "idle" | "preparing" | "analyzing" | "shopping" | "curating" | "saving";

/**
 * The on-screen sequence, deliberately separate from the pipeline's `Stage`.
 * The two run at different speeds — the build animation is ~2.8s and a full run
 * is far longer — so the closet waits at `open` until results land.
 */
type Phase = "form" | "exiting" | "building" | "open" | "filled";

/** Long enough for the form to clear frame before the wardrobe starts. */
const EXIT_MS = 480;

/** An emptied number field means "no preference", not zero. */
function numberOrUndefined(value: string): number | undefined {
  const n = Number(value);
  return value.trim() && Number.isFinite(n) ? n : undefined;
}

/**
 * Some of the pool couldn't be judged. Said as a note about coverage rather
 * than as breakage, because the pieces that did come through are real and are
 * already hanging.
 */
function partiallyJudged(count: number): string {
  return `${count === 1 ? "One batch" : `${count} batches`} of the search couldn't be judged, so this closet is thinner than it should be. Try again to fill it out.`;
}

const SOURCE_NAME: Record<string, string> = { ebay: "eBay", serpapi: "Google Shopping" };

const STAGE_COPY: Record<Exclude<Stage, "idle">, string> = {
  preparing: "Preparing your photos…",
  analyzing: "Reading the style…",
  shopping: "Searching for pieces…",
  curating: "Picking the ones that fit…",
  saving: "Saving your closet…",
};

interface Selected {
  file: File;
  preview: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

export default function StyleRunner({ initialCloset }: { initialCloset: Closet | null }) {
  const [photos, setPhotos] = useState<Selected[]>([]);
  const [min, setMin] = useState(50);
  const [max, setMax] = useState(250);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  // Results and identity are separate: a run always produces results, but only
  // gets a code if saving was available.
  const [results, setResults] = useState<ClosetContents | null>(initialCloset);
  const [code, setCode] = useState<string | null>(initialCloset?.code ?? null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(initialCloset ? "filled" : "form");
  // Results can land before the build animation finishes. Park them here and
  // hang them the moment the wardrobe is open, so the animation is never cut
  // short and the pieces never appear before there's a rail to hang them on.
  const pending = useRef<ClosetContents | null>(null);
  const built = useRef(false);
  // What a run has already produced. Curation is the last and most failure-prone
  // step, and by the time it runs the vision pass and ten eBay searches are
  // already paid for — losing those to a transient 529 is the expensive
  // failure, so they're kept for a retry that resumes rather than restarts.
  const resumable = useRef<{
    profile: StyleProfile;
    /** Only the batches that haven't produced picks — a retry redoes those, not the run. */
    batches: ProductListing[][];
    items: CuratedItem[];
    notes: string[];
  } | null>(null);
  const [reports, setReports] = useState<SourceReport[]>([]);
  const [codeInput, setCodeInput] = useState("");
  // How many curation batches have come back. Shown in the caption so the wait
  // reads as progress rather than as a stalled spinner.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Sizes live on the server under the id cookie, not in this form: the shop
  // route reads them itself, so the form only mirrors what's stored. Null until
  // we know whether there's anywhere to store them at all.
  const [sizes, setSizes] = useState<Sizes>({});
  const [sizesAvailable, setSizesAvailable] = useState(false);
  // Offered once a run finishes: the queries the photos produced are already
  // the best description of what someone is looking for, so a standing search
  // is a continuation of the closet rather than a form to fill in.
  const [watchState, setWatchState] = useState<"hidden" | "offer" | "saving" | "on">("hidden");

  useEffect(() => {
    let alive = true;
    fetch("/api/taste")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { configured?: boolean; sizes?: Sizes } | null) => {
        if (!alive || !json) return;
        setSizesAvailable(Boolean(json.configured));
        setSizes(json.sizes ?? {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Write sizes through on every change.
   *
   * Optimistic and unacknowledged on purpose — a size field that fought back
   * mid-typing would be worse than one that occasionally doesn't persist, and
   * the next run reads whatever the server actually has.
   */
  const updateSizes = useCallback((patch: Partial<Sizes>) => {
    setSizes((current) => {
      const next = { ...current, ...patch };
      void fetch("/api/taste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizes: next }),
      }).catch(() => {});
      return next;
    });
  }, []);

  // Previews are object URLs; without this they leak for the page's lifetime.
  const photosRef = useRef<Selected[]>([]);
  photosRef.current = photos;
  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.preview);
    };
  }, []);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    // Read the FileList out NOW. Both the file input and the drop event
    // invalidate it the moment this handler returns, and React may defer the
    // state updater past that point — which is why only the first selection
    // used to land.
    const incoming = Array.from(files);
    const selection = selectPhotos(photosRef.current.length, incoming);

    setError(describeRejections(selection));
    if (!selection.accepted.length) return;

    // Object URLs are created out here too: state updaters must be pure, and
    // StrictMode double-invokes them, which would leak a URL per extra call.
    const added = selection.accepted.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((current) => [...current, ...added]);
  }, []);

  const removePhoto = useCallback((index: number) => {
    setPhotos((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((_, i) => i !== index);
    });
  }, []);

  /**
   * Results and the build animation finish in either order. Whichever lands
   * second triggers the reveal, so the wardrobe is always fully built before
   * anything hangs in it, and a slow pipeline just holds the closet open.
   */
  const revealWhenBuilt = useCallback((contents: ClosetContents) => {
    pending.current = contents;
    if (!built.current) return;
    setResults(contents);
    setPhase("filled");
    pending.current = null;
  }, []);

  const onBuilt = useCallback(() => {
    if (built.current) return;
    built.current = true;
    setPhase((p) => (p === "building" ? "open" : p));
    if (pending.current) {
      setResults(pending.current);
      pending.current = null;
      setPhase("filled");
    }
  }, []);

  /** Store the closet, and treat a storage failure as a note rather than an error. */
  async function save(contents: ClosetContents) {
    setStage("saving");
    try {
      const saved = await postJson<{ closet: Closet }>("/api/closet", contents);
      setCode(saved.closet.code);
      setSaveNotice(null);
    } catch (err) {
      setSaveNotice(
        err instanceof Error
          ? err.message
          : "Couldn't save this closet, so there's no code for it."
      );
    }
  }

  /**
   * Curate every batch at once, hanging each batch's pieces the moment they
   * land rather than waiting for the slowest one.
   *
   * Batches are independent by design: one that fails takes only its own slice
   * of the pool with it, and is handed back so a retry can redo that slice
   * alone. Nothing already hanging is ever removed — a later batch only ever
   * adds, which is why each batch is asked for a few picks rather than the
   * whole closet.
   */
  async function curateBatches(
    profile: StyleProfile,
    batches: ProductListing[][],
    startFrom: CuratedItem[],
    startNotes: string[]
  ) {
    let items = startFrom;
    const notes = [...startNotes];
    const failed: ProductListing[][] = [];
    const errors: string[] = [];
    let done = 0;

    setProgress({ done: 0, total: batches.length });

    await Promise.all(
      batches.map(async (batch) => {
        try {
          const curated = await postJson<{ items: CuratedItem[]; notes: string }>(
            "/api/style/curate",
            { profile, candidates: batch, limit: PICKS_PER_BATCH }
          );
          if (curated.notes) notes.push(curated.notes);

          // Read-then-write inside one synchronous step, so concurrent batches
          // can't drop each other's picks.
          items = appendPicks(items, curated.items);
          revealWhenBuilt({
            range: { min, max },
            profile,
            items,
            notes: notes.join(" "),
          });
        } catch (err) {
          failed.push(batch);
          errors.push(err instanceof Error ? err.message : "A batch couldn't be judged.");
        } finally {
          done += 1;
          setProgress({ done, total: batches.length });
        }
      })
    );

    setProgress(null);
    return { items, notes, failed, errors };
  }

  /**
   * Re-run only what failed. Everything before it — the photos, the vision
   * pass, the eBay searches — is already done and already paid for, and so are
   * the batches that did come back, so a transient failure costs only itself.
   */
  async function retryCuration() {
    const saved = resumable.current;
    if (!saved) return;

    setError(null);
    setStage("curating");
    try {
      const outcome = await curateBatches(
        saved.profile,
        saved.batches,
        saved.items,
        saved.notes
      );

      const contents: ClosetContents = {
        range: { min, max },
        profile: saved.profile,
        items: outcome.items,
        notes: outcome.notes.join(" "),
      };

      if (!outcome.items.length) throw new Error(outcome.errors[0] ?? "Nothing came back.");

      setResults(contents);
      setPhase("filled");
      resumable.current = outcome.failed.length
        ? { profile: saved.profile, batches: outcome.failed, items: outcome.items, notes: outcome.notes }
        : null;
      if (outcome.failed.length) setError(partiallyJudged(outcome.failed.length));

      await save(contents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStage("idle");
    }
  }

  async function run() {
    if (photos.length < 1) {
      setError("Add at least one photo.");
      return;
    }
    if (max <= min) {
      setError("The maximum has to be above the minimum.");
      return;
    }

    setError(null);
    built.current = false;
    pending.current = null;
    resumable.current = null;
    setResults(null);
    setCode(null);

    // Clear the form out of frame, then let the wardrobe build over where it was.
    const reduced = prefersReducedMotion();
    setPhase("exiting");
    await new Promise((r) => setTimeout(r, reduced ? 0 : EXIT_MS));
    setPhase("building");

    try {
      // Downscaled and encoded in the browser, then sent inline — the photos
      // are never hosted anywhere.
      setStage("preparing");
      const encoded = await encodePhotos(photos.map((photo) => photo.file));

      setStage("analyzing");
      const { profile } = await postJson<{ profile: StyleProfile }>(
        "/api/style/analyze",
        { photos: encoded, min, max }
      );

      setStage("shopping");
      const params = new URLSearchParams({ min: String(min), max: String(max) });
      for (const query of profile.searchQueries) params.append("q", query.query);
      const shopRes = await fetch(`/api/style/shop?${params.toString()}`);
      const shopped = await shopRes.json().catch(() => null);
      if (!shopRes.ok) throw new Error(shopped?.error ?? "Shopping search failed.");
      const candidates: ProductListing[] = shopped.listings;
      setReports(shopped.reports ?? []);

      if (!candidates.length) {
        throw new Error(
          "No listings came back. Widen the price range, or check that the eBay credentials are set."
        );
      }

      setStage("curating");
      const batches = planBatches(candidates);
      if (!batches.length) {
        throw new Error("None of the listings came back with a usable photo.");
      }
      resumable.current = { profile, batches, items: [], notes: [] };

      const outcome = await curateBatches(profile, batches, [], []);

      if (!outcome.items.length) {
        // Only worth retrying if something actually broke. Batches that came
        // back and picked nothing will pick nothing again.
        resumable.current = outcome.failed.length
          ? { profile, batches: outcome.failed, items: [], notes: outcome.notes }
          : null;
        throw new Error(
          outcome.errors[0] ?? "Nothing in the search was worth showing you. Try a wider range."
        );
      }

      // Show the results before attempting to save. The run is complete and
      // paid for at this point; a storage problem must never discard it.
      const contents: ClosetContents = {
        range: { min, max },
        profile,
        items: outcome.items,
        notes: outcome.notes.join(" "),
      };
      revealWhenBuilt(contents);

      // Only what failed is worth retrying, and nothing at all when the run
      // came through whole.
      resumable.current = outcome.failed.length
        ? { profile, batches: outcome.failed, items: outcome.items, notes: outcome.notes }
        : null;
      if (outcome.failed.length) setError(partiallyJudged(outcome.failed.length));

      await save(contents);
      setWatchState("offer");
      setStage("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      // Hold the built wardrobe when the run can be resumed, so "Try again"
      // picks up from the candidates instead of starting over. With nothing to
      // resume from, put the form back rather than stranding an empty wardrobe.
      setPhase(results || resumable.current ? "filled" : "form");
      setStage("idle");
    }
  }

  async function loadByCode(event: React.FormEvent) {
    event.preventDefault();
    const wanted = codeInput.trim();
    if (!wanted) return;
    setError(null);
    try {
      const res = await fetch(`/api/closet?code=${encodeURIComponent(wanted)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Could not load that closet.");
      setResults(json.closet);
      setCode(json.closet.code);
      setSaveNotice(null);
      setCodeInput("");
      setPhase("filled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that closet.");
    }
  }

  /** Leave this closet's searches running. */
  async function startWatch(profile: StyleProfile) {
    setWatchState("saving");
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.aesthetics.slice(0, 2).join(" & ") || "Your closet",
          queries: profile.searchQueries.map((q) => q.query),
          range: { min, max },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Couldn't start that watch.");
      setWatchState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start that watch.");
      setWatchState("offer");
    }
  }

  const busy = stage !== "idle";
  // Curation runs several batches at once, so it's the one stage that can say
  // how far along it is.
  const caption =
    stage === "curating" && progress && progress.total > 1
      ? `Picking the ones that fit… ${progress.done} of ${progress.total}`
      : STAGE_COPY[stage as Exclude<Stage, "idle">];
  const onStage = phase === "building" || phase === "open" || phase === "filled";
  const leaving = phase === "exiting";
  const eBayOnly = reports.some((r) => r.source === "serpapi" && !r.configured);
  // Configured, asked, and came back with either an error or nothing at all.
  const sourceTrouble = reports.filter((r) => r.configured && (!r.ok || r.count === 0));

  return (
    <div className="space-y-10">
      {!onStage && (
      <section
        className={`panel p-6 transition-all duration-500 ease-in sm:p-8 ${
          leaving ? "pointer-events-none -translate-y-6 scale-[0.97] opacity-0" : ""
        }`}
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="label">Pieces you like</p>
          <form onSubmit={loadByCode} className="flex items-center gap-2">
            {/* Placeholder is kept short: the wide letter-spacing that makes an
                entered code legible clips anything longer. */}
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Code"
              aria-label="Load a saved closet by code"
              className="field w-28 uppercase tracking-widest"
              maxLength={8}
            />
            <button type="submit" className="btn-ghost" disabled={busy}>
              Load
            </button>
          </form>
        </div>

        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-room-line bg-room-sunk/40 px-6 py-12 text-center transition-colors hover:border-room-ink/30 hover:bg-room-sunk/70"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={busy || photos.length >= MAX_PHOTOS}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="text-sm text-room-ink">
            Drop in photos of clothes you think look good
          </span>
          <span className="mt-1.5 text-xs text-room-faint">
            {photos.length}/{MAX_PHOTOS} &middot; jackets, trousers, shoes &mdash; whatever
            caught your eye
          </span>
        </label>

        {photos.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-3">
            {photos.map((photo, index) => (
              <div
                key={photo.preview}
                className="relative h-24 w-24 transition-all duration-500 ease-in"
                style={
                  leaving
                    ? {
                        transform: `translate(${(photos.length / 2 - index) * 60}px, 40px) scale(0.2)`,
                        opacity: 0,
                        transitionDelay: `${index * 45}ms`,
                      }
                    : undefined
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.preview}
                  alt=""
                  className="h-full w-full rounded-lg border border-room-line object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  disabled={busy}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-room-line bg-room-panel text-xs text-room-muted shadow-sm hover:text-room-ink"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="min" className="label mb-2 block">
              Min per piece
            </label>
            <input
              id="min"
              type="number"
              min={0}
              value={min}
              disabled={busy}
              onChange={(e) => setMin(Number(e.target.value))}
              className="field w-28"
            />
          </div>
          <div>
            <label htmlFor="max" className="label mb-2 block">
              Max per piece
            </label>
            <input
              id="max"
              type="number"
              min={1}
              value={max}
              disabled={busy}
              onChange={(e) => setMax(Number(e.target.value))}
              className="field w-28"
            />
          </div>
          {/* Sizes. Optional, remembered per browser, and asked here rather than
              learned because no amount of watching someone browse reveals their
              inseam — while a listing in the wrong size is worthless however
              good the piece is. Anything left blank simply isn't used. */}
          {sizesAvailable && (
            <>
              <div>
                <label htmlFor="tops" className="label mb-2 block">
                  Tops
                </label>
                <select
                  id="tops"
                  value={sizes.tops ?? ""}
                  disabled={busy}
                  onChange={(e) => updateSizes({ tops: e.target.value || undefined })}
                  className="field w-24"
                >
                  <option value="">Any</option>
                  {LETTER_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="waist" className="label mb-2 block">
                  Waist
                </label>
                <input
                  id="waist"
                  type="number"
                  min={26}
                  max={50}
                  value={sizes.waist ?? ""}
                  disabled={busy}
                  onChange={(e) => updateSizes({ waist: numberOrUndefined(e.target.value) })}
                  className="field w-20"
                />
              </div>
              <div>
                <label htmlFor="inseam" className="label mb-2 block">
                  Inseam
                </label>
                <input
                  id="inseam"
                  type="number"
                  min={26}
                  max={40}
                  value={sizes.inseam ?? ""}
                  disabled={busy}
                  onChange={(e) => updateSizes({ inseam: numberOrUndefined(e.target.value) })}
                  className="field w-20"
                />
              </div>
              <div>
                <label htmlFor="shoe" className="label mb-2 block">
                  Shoe
                </label>
                <input
                  id="shoe"
                  type="number"
                  min={5}
                  max={16}
                  step={0.5}
                  value={sizes.shoe ?? ""}
                  disabled={busy}
                  onChange={(e) => updateSizes({ shoe: numberOrUndefined(e.target.value) })}
                  className="field w-20"
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={run}
            disabled={busy || photos.length === 0}
            className="btn-primary ml-auto"
          >
            {busy ? "Building\u2026" : "Build my closet"}
          </button>
        </div>

        {error && (
          <p className="mt-5 rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {!busy && (
          <div className="mt-6 border-t border-room-line pt-5">
            <JudgePanel range={{ min, max }} />
          </div>
        )}

        {eBayOnly && !busy && (
          <p className="mt-5 text-xs text-room-faint">
            Searching eBay only. Add a SERPAPI_KEY to include mainstream retail.
          </p>
        )}
      </section>
      )}

      {onStage && (
        <ClosetStage
          items={results?.items ?? []}
          phase={phase as StagePhase}
          caption={busy ? caption : undefined}
          onBuilt={onBuilt}
        />
      )}

      {/* The form's own error banner is hidden once the stage takes over, so a
          failure at curation needs its own place to surface — next to the way
          out of it. */}
      {onStage && error && (
        <div className="panel flex flex-wrap items-center justify-between gap-4 border-red-300/70 bg-red-50 px-6 py-4">
          <p className="max-w-xl text-sm text-red-800">{error}</p>
          {resumable.current && (
            <button
              type="button"
              onClick={retryCuration}
              disabled={busy}
              className="btn-primary shrink-0"
            >
              {busy ? "Trying again…" : "Try again"}
            </button>
          )}
        </div>
      )}

      {/* A source that is configured and still didn't deliver.

          Worth its own line, because it is otherwise completely invisible: the
          run succeeds, the closet fills from whatever did answer, and there is
          nothing at all to say the key you just added isn't working. That's a
          bad way to spend an afternoon. */}
      {phase === "filled" && sourceTrouble.length > 0 && (
        <div className="panel px-6 py-4">
          {sourceTrouble.map((report) => (
            <p key={report.source} className="text-xs leading-relaxed text-room-muted">
              <span className="font-semibold text-room-ink">
                {SOURCE_NAME[report.source] ?? report.source}
              </span>{" "}
              {report.ok
                ? "is set up but returned nothing for any of these searches."
                : `is set up but failed: ${report.error ?? "unknown error"}`}
            </p>
          ))}
        </div>
      )}

      {phase === "filled" && results && (
        <>
          {code ? (
            <div className="panel flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div>
                <p className="label mb-1">Closet code</p>
                <p className="font-mono text-2xl tracking-[0.3em] text-room-ink">{code}</p>
              </div>
              <p className="max-w-xs text-xs leading-relaxed text-room-muted">
                Saved. This browser reopens it automatically &mdash; use the code to open it
                anywhere else.
              </p>
            </div>
          ) : (
            saveNotice && (
              <p className="panel px-6 py-4 text-xs leading-relaxed text-room-muted">
                {saveNotice} Your pieces are hanging above either way &mdash; they just
                won&rsquo;t be here when you come back.
              </p>
            )
          )}

          {/* The subscription pitch, made at the only moment it's obviously
              true: you've just seen what one search found, and secondhand stock
              turns over daily. */}
          {watchState !== "hidden" && results.profile && (
            <div className="panel flex flex-wrap items-center justify-between gap-4 px-6 py-4">
              {watchState === "on" ? (
                <p className="text-sm text-room-muted">
                  Watching. These searches keep running, and you&rsquo;ll hear when something turns
                  up that clears the bar.
                </p>
              ) : (
                <>
                  <p className="max-w-md text-sm leading-relaxed text-room-muted">
                    Secondhand moves fast &mdash; most of what would suit you isn&rsquo;t listed
                    right now. Leave these searches running and they&rsquo;ll keep looking.
                  </p>
                  <button
                    type="button"
                    onClick={() => startWatch(results.profile)}
                    disabled={watchState === "saving"}
                    className="btn-primary shrink-0"
                  >
                    {watchState === "saving" ? "Starting…" : "Keep looking"}
                  </button>
                </>
              )}
            </div>
          )}

          <button type="button" onClick={() => setPhase("form")} className="btn-ghost">
            Start another
          </button>
        </>
      )}
    </div>
  );
}
