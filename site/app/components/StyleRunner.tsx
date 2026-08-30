"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Closet, ClosetContents } from "@/lib/closet";
import type { CuratedItem } from "@/lib/curate";
import type { StyleProfile } from "@/lib/schemas";
import type { ProductListing, SourceReport } from "@/lib/sources/types";
import { REFERENCE_EDGE, encodePhotos, type EncodedPhoto } from "@/lib/image";
import { MAX_PHOTOS, describeRejections, selectPhotos } from "@/lib/photos";
import { PICKS_PER_BATCH, appendPicks, planBatches, rankAndCut } from "@/lib/batching";
import { LETTER_SIZES, type Sizes } from "@/lib/sizing";
import type { Preferences } from "@/lib/preferences";
import type { RunStage } from "@/lib/progress";
import ClosetStage, { prefersReducedMotion, type StagePhase } from "./ClosetStage";
import JudgePanel from "./JudgePanel";
import MatchPrompt from "./MatchPrompt";
import ScanPrompt, { scanPromptMuted } from "./ScanPrompt";
import StyleQuestions from "./StyleQuestions";
import ShareCard from "./ShareCard";

// Derived from the progress module rather than restated, so a new stage can't
// be added to the pipeline without the progress bar learning about it.
type Stage = RunStage | "idle";

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
  return `${count === 1 ? "One batch" : `${count} batches`} of the search couldn't be judged, so this clozet is thinner than it should be. Try again to fill it out.`;
}

const SOURCE_NAME: Record<string, string> = { ebay: "eBay", serpapi: "Google Shopping" };

/** What a closet's standing scan is called, taken from what the style turned out to be. */
function watchName(profile: StyleProfile): string {
  return profile.aesthetics.slice(0, 2).join(" & ") || "Your clozet";
}

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
    /** Kept so a retry judges against the same photos the first attempt did. */
    reference: EncodedPhoto[];
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
  // The modal is a separate piece of state from the inline offer above it: the
  // popup is shown once, when a run finishes, and the panel stays afterwards so
  // there's still a way to say yes to someone who dismissed it.
  const [prompting, setPrompting] = useState(false);
  const [plan, setPlan] = useState<"free" | "member">("free");
  /**
   * What uploading these pieces is meant to mean.
   *
   * "similar" is the default because it is what people actually intend: someone
   * who uploads three jackets they like wants jackets. The app used to only do
   * the other one, silently, which is why a run could come back with nothing in
   * the person's own style and still be working exactly as written.
   */
  const [intent, setIntent] = useState<"similar" | "gaps">("similar");

  /**
   * The five things three photographs can't tell you.
   *
   * Stored server-side under the browser id, like sizes, so somebody is asked
   * once rather than on every visit. The run itself never sends these — both
   * model routes read them from the store, which is why there's no reason for
   * a client to be trusted with them.
   */
  const [preferences, setPreferences] = useState<Preferences>({});
  /** How many pieces this browser has already voted on. Null until known. */
  const [tasteCount, setTasteCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/taste")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          json: {
            configured?: boolean;
            sizes?: Sizes;
            preferences?: Preferences;
            count?: number;
            plan?: "free" | "member";
          } | null
        ) => {
          if (!alive || !json) return;
          setSizesAvailable(Boolean(json.configured));
          setSizes(json.sizes ?? {});
          setPreferences(json.preferences ?? {});
          setTasteCount(json.count ?? 0);
          setPlan(json.plan ?? "free");
        }
      )
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

  /**
   * Write the answers through as they're tapped.
   *
   * Optimistic and unacknowledged, exactly like `updateSizes` and for the same
   * reason: a chip that fought back mid-tap is worse than one that occasionally
   * doesn't persist, and the next run reads whatever the server actually has.
   */
  const updatePreferences = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      void fetch("/api/taste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: next }),
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
          : "Couldn't save this clozet, so there's no code for it."
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
    startNotes: string[],
    /** Small copies of what they uploaded, sent with every batch. */
    reference: EncodedPhoto[]
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
            { profile, candidates: batch, limit: PICKS_PER_BATCH, uploads: reference, intent }
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
        saved.notes,
        saved.reference
      );

      const contents: ClosetContents = {
        range: { min, max },
        profile: saved.profile,
        items: rankAndCut(outcome.items),
        notes: outcome.notes.join(" "),
      };

      if (!outcome.items.length) throw new Error(outcome.errors[0] ?? "Nothing came back.");

      setResults(contents);
      setPhase("filled");
      resumable.current = outcome.failed.length
        ? {
            profile: saved.profile,
            batches: outcome.failed,
            items: outcome.items,
            notes: outcome.notes,
            reference: saved.reference,
          }
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
      const files = photos.map((photo) => photo.file);
      // Twice, at two sizes. The vision pass reads these photos closely and
      // wants the detail; curation only holds them up next to a candidate, and
      // it repeats that in every batch — so it gets thumbnails, at roughly a
      // fortieth of the tokens.
      const [encoded, reference] = await Promise.all([
        encodePhotos(files),
        encodePhotos(files, REFERENCE_EDGE),
      ]);

      setStage("analyzing");
      const { profile } = await postJson<{ profile: StyleProfile }>(
        "/api/style/analyze",
        { photos: encoded, min, max, intent }
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
      resumable.current = { profile, batches, items: [], notes: [], reference };

      const outcome = await curateBatches(profile, batches, [], [], reference);

      if (!outcome.items.length) {
        // Only worth retrying if something actually broke. Batches that came
        // back and picked nothing will pick nothing again.
        resumable.current = outcome.failed.length
          ? { profile, batches: outcome.failed, items: [], notes: outcome.notes, reference }
          : null;
        throw new Error(
          outcome.errors[0] ?? "Nothing in the search was worth showing you. Try a wider range."
        );
      }

      // Show the results before attempting to save. The run is complete and
      // paid for at this point; a storage problem must never discard it.
      // The rail has been filling in arrival order while the batches came
      // back. Now that every batch has been seen there is finally something to
      // rank against, so it settles best-first — which matters because the
      // closet pages eight at a time, and arrival order decided what most
      // people ever looked at.
      const contents: ClosetContents = {
        range: { min, max },
        profile,
        items: rankAndCut(outcome.items),
        notes: outcome.notes.join(" "),
      };
      revealWhenBuilt(contents);

      // Only what failed is worth retrying, and nothing at all when the run
      // came through whole.
      resumable.current = outcome.failed.length
        ? { profile, batches: outcome.failed, items: outcome.items, notes: outcome.notes, reference }
        : null;
      if (outcome.failed.length) setError(partiallyJudged(outcome.failed.length));

      await save(contents);
      setWatchState("offer");
      // Asked once per finished run, unless they've turned it off. Checked here
      // rather than at render so muting mid-session takes effect immediately.
      if (!scanPromptMuted()) setPrompting(true);
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
      if (!res.ok) throw new Error(json?.error ?? "Could not load that clozet.");
      setResults(json.closet);
      setCode(json.closet.code);
      setSaveNotice(null);
      setCodeInput("");
      setPhase("filled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that clozet.");
    }
  }

  /**
   * Leave this closet's searches running.
   *
   * Returns whether it worked, because the modal needs to know: a refusal there
   * is the upgrade pitch rather than an error, and it should stay open to make
   * it. The inline panel goes on reporting failures through the page banner.
   */
  async function startWatch(profile: StyleProfile): Promise<boolean> {
    setWatchState("saving");
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: watchName(profile),
          queries: profile.searchQueries.map((q) => q.query),
          range: { min, max },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Couldn't start that watch.");
      setWatchState("on");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start that watch.");
      setWatchState("offer");
      return false;
    }
  }

  // `stage` is narrowed to a RunStage everywhere `busy` is true, which is the
  // only place it's read.
  const busy = stage !== "idle";
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
          <p className="eyebrow">Pieces you like</p>
          <form onSubmit={loadByCode} className="flex items-center gap-2">
            {/* Placeholder is kept short: the wide letter-spacing that makes an
                entered code legible clips anything longer. */}
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Code"
              aria-label="Load a saved clozet by code"
              className="field w-28 uppercase tracking-widest"
              maxLength={8}
            />
            <button type="submit" className="btn-ghost" disabled={busy}>
              Load
            </button>
          </form>
        </div>

        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-sm border border-room-line bg-room-sunk/60 px-6 py-14 text-center transition-colors hover:border-room-ink/30 hover:bg-room-sunk"
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
            {photos.length}/{MAX_PHOTOS} &middot; jackets, trousers, shoes - whatever
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

        {/* What the upload is asking for. Two words each, because the
            difference is the whole product and a person should not have to
            read a paragraph to find the one they meant. */}
        <fieldset className="mt-7">
          <legend className="label mb-2">What should it find?</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["similar", "More like these", "Same kind of pieces as the ones you upload."],
                ["gaps", "What's missing", "The pieces that would go with them, that you don't have."],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                title={hint}
                className={`cursor-pointer rounded-sm border px-4 py-2.5 text-[13px] transition-colors ${
                  intent === value
                    ? "border-room-ink bg-room-ink text-room-on-ink"
                    : "border-room-line bg-room-panel text-room-muted hover:border-room-ink/40 hover:text-room-ink"
                }`}
              >
                <input
                  type="radio"
                  name="intent"
                  value={value}
                  checked={intent === value}
                  disabled={busy}
                  onChange={() => setIntent(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-room-faint">
            {intent === "similar"
              ? "Same kind of pieces as the ones you upload."
              : "The pieces that would go with them, that you don't already have."}
          </p>
        </fieldset>

        {/* Offered only to people the app has never watched choose anything.
            The taste memory is the strongest signal here and it doesn't exist
            until somebody has reacted to a closet - so the first run is the one
            with none of it, and it's also the run that decides whether they
            come back. Hidden once there are votes, because by then it would be
            asking for something it already has. */}
        {tasteCount === 0 && !busy && (
          <Link
            href="/calibrate"
            className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-room-line bg-room-sunk px-5 py-4 transition-colors hover:border-room-ink/40"
          >
            <span className="text-[13px] leading-relaxed text-room-muted">
              <span className="font-medium text-room-ink">New here?</span> Swipe fifteen pieces
              first - about a minute, and the first clozet stops guessing.
            </span>
            <span className="text-[12px] font-semibold text-accent">Teach it your eye &rarr;</span>
          </Link>
        )}

        {/* The five things the photographs can't say. Placed after "what should
            it find?" and before the price, because it reads as one continuous
            conversation: here's what I like, here's what I want, here's what I
            am, here's what I'll pay. */}
        <div className="mt-7 grid grid-cols-2 gap-4">
          <StyleQuestions value={preferences} onChange={updatePreferences} disabled={busy} />
        </div>

        {/* A two-column grid on phones, the original row from sm up.
            Wrapping fixed-width fields at 390px dealt the last size field and
            the build button the same line, so "Shoe" sat beside the thing you
            press to start - which read as a caption for it. A grid can't do
            that: the fields fill the columns and the button gets its own row. */}
        <div className="mt-7 grid grid-cols-2 items-end gap-4 sm:flex sm:flex-wrap">
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
              className="field w-full sm:w-28"
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
              className="field w-full sm:w-28"
            />
          </div>
          {/* Sizes. Optional, remembered per browser, and asked here rather than
              learned because no amount of watching someone browse reveals their
              inseam - while a listing in the wrong size is worthless however
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
                  className="field w-full sm:w-24"
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
                  className="field w-full sm:w-20"
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
                  className="field w-full sm:w-20"
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
                  className="field w-full sm:w-20"
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={run}
            disabled={busy || photos.length === 0}
            className="btn-primary col-span-2 w-full sm:ml-auto sm:w-auto"
          >
            {busy ? "Building\u2026" : "Build my clozet"}
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
          running={busy ? { stage, sub: progress } : undefined}
          onBuilt={onBuilt}
        />
      )}

      {/* The form's own error banner is hidden once the stage takes over, so a
          failure at curation needs its own place to surface - next to the way
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
          run succeeds, the clozet fills from whatever did answer, and there is
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
                <p className="eyebrow mb-1">Clozet code</p>
                <p className="font-mono text-2xl tracking-[0.3em] text-room-ink">{code}</p>
              </div>
              <p className="max-w-xs text-xs leading-relaxed text-room-muted">
                Saved. This browser reopens it automatically - use the code to open it
                anywhere else.
              </p>
            </div>
          ) : (
            saveNotice && (
              <p className="panel px-6 py-4 text-xs leading-relaxed text-room-muted">
                {saveNotice} Your pieces are hanging above either way - they just
                won&rsquo;t be here when you come back.
              </p>
            )
          )}

          {/* The subscription pitch, made at the only moment it's obviously
              true: you've just seen what one search found, and secondhand stock
              turns over daily. */}
          {/* Accessories and a fragrance, against the clozet on screen.
              Above the scan offer on purpose: this one is about the pieces you
              are looking at right now, and the scan is about the ones that
              aren't listed yet. Needs a code - without one the clozet was never
              stored and there is nothing for those pages to read. */}
          {code && (
            <MatchPrompt code={code} range={results.range} />
          )}

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
                    Secondhand moves fast - most of what would suit you isn&rsquo;t listed
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

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setPhase("form")} className="btn-ghost">
              Start another
            </button>
            {code && (
              <ShareCard
                code={code}
                name={watchName(results.profile)}
                items={results.items}
                palette={results.profile.palette}
              />
            )}
          </div>
        </>
      )}

      {prompting && results?.profile && (
        <ScanPrompt
          name={watchName(results.profile)}
          itemCount={results.items.length}
          plan={plan}
          onStart={() => startWatch(results.profile)}
          onClose={() => setPrompting(false)}
        />
      )}
    </div>
  );
}
