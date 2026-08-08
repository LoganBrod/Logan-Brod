"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Closet, ClosetContents } from "@/lib/closet";
import type { CuratedItem } from "@/lib/curate";
import type { StyleProfile } from "@/lib/schemas";
import type { ProductListing, SourceReport } from "@/lib/sources/types";
import { encodePhotos } from "@/lib/image";
import { MAX_PHOTOS, describeRejections, selectPhotos } from "@/lib/photos";
import ClosetStage, { prefersReducedMotion, type StagePhase } from "./ClosetStage";

type Stage = "idle" | "preparing" | "analyzing" | "shopping" | "curating" | "saving";

/**
 * The on-screen sequence, deliberately separate from the pipeline's `Stage`.
 * The two run at different speeds — the build animation is ~2.8s and a full run
 * is far longer — so the closet waits at `open` until results land.
 */
type Phase = "form" | "exiting" | "building" | "open" | "filled";

/** Long enough for the form to clear frame before the wardrobe starts. */
const EXIT_MS = 480;

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
  const [reports, setReports] = useState<SourceReport[]>([]);
  const [codeInput, setCodeInput] = useState("");

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
      const curated = await postJson<{ items: CuratedItem[]; notes: string }>(
        "/api/style/curate",
        { profile, candidates }
      );

      // Show the results before attempting to save. The run is complete and
      // paid for at this point; a storage problem must never discard it.
      const contents: ClosetContents = {
        range: { min, max },
        profile,
        items: curated.items,
        notes: curated.notes,
      };
      revealWhenBuilt(contents);

      setStage("saving");
      try {
        const saved = await postJson<{ closet: Closet }>("/api/closet", contents);
        setCode(saved.closet.code);
        setSaveNotice(null);
      } catch (saveErr) {
        // Saving is optional, so this is a note, not an error.
        setSaveNotice(
          saveErr instanceof Error
            ? saveErr.message
            : "Couldn't save this closet, so there's no code for it."
        );
      }

      setStage("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      // Nothing to hang, so put the form back rather than stranding an empty
      // wardrobe with an error floating under it.
      setPhase(results ? "filled" : "form");
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

  const busy = stage !== "idle";
  const onStage = phase === "building" || phase === "open" || phase === "filled";
  const leaving = phase === "exiting";
  const eBayOnly = reports.some((r) => r.source === "serpapi" && !r.configured);

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
          caption={busy ? STAGE_COPY[stage as Exclude<Stage, "idle">] : undefined}
          onBuilt={onBuilt}
        />
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

          <button type="button" onClick={() => setPhase("form")} className="btn-ghost">
            Start another
          </button>
        </>
      )}
    </div>
  );
}
