"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Closet } from "@/lib/closet";
import type { CuratedItem } from "@/lib/curate";
import type { StyleProfile, Outfit } from "@/lib/schemas";
import type { ProductListing, SourceReport } from "@/lib/sources/types";
import ClosetView from "./ClosetView";

const MAX_PHOTOS = 6;

type Stage = "idle" | "uploading" | "analyzing" | "shopping" | "curating" | "saving";

const STAGE_COPY: Record<Exclude<Stage, "idle">, string> = {
  uploading: "Uploading your photos…",
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
  const [closet, setCloset] = useState<Closet | null>(initialCloset);
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
    setError(null);
    setPhotos((current) => {
      const room = MAX_PHOTOS - current.length;
      const incoming = Array.from(files)
        .filter((file) => file.type.startsWith("image/"))
        .slice(0, Math.max(room, 0))
        .map((file) => ({ file, preview: URL.createObjectURL(file) }));
      return [...current, ...incoming];
    });
  }, []);

  const removePhoto = useCallback((index: number) => {
    setPhotos((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((_, i) => i !== index);
    });
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
    try {
      setStage("uploading");
      const form = new FormData();
      for (const photo of photos) form.append("photos", photo.file);
      const uploadRes = await fetch("/api/closet/upload", { method: "POST", body: form });
      const uploaded = await uploadRes.json().catch(() => null);
      if (!uploadRes.ok) throw new Error(uploaded?.error ?? "Upload failed.");
      const photoUrls: string[] = uploaded.photoUrls;

      setStage("analyzing");
      const { profile } = await postJson<{ profile: StyleProfile }>(
        "/api/style/analyze",
        { photoUrls, min, max }
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
      const curated = await postJson<{
        items: CuratedItem[];
        notes: string;
        outfits: Outfit[];
      }>("/api/style/curate", { profile, candidates });

      setStage("saving");
      const saved = await postJson<{ closet: Closet }>("/api/closet", {
        photoUrls,
        range: { min, max },
        profile,
        items: curated.items,
        outfits: curated.outfits,
        notes: curated.notes,
      });

      setCloset(saved.closet);
      setStage("idle");
    } catch (err) {
      // Saving is the last step, so a failure there still leaves usable results
      // on screen — but the user needs to know the code won't be there later.
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("idle");
    }
  }

  async function loadByCode(event: React.FormEvent) {
    event.preventDefault();
    const code = codeInput.trim();
    if (!code) return;
    setError(null);
    try {
      const res = await fetch(`/api/closet?code=${encodeURIComponent(code)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Could not load that closet.");
      setCloset(json.closet);
      setCodeInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that closet.");
    }
  }

  const busy = stage !== "idle";
  const eBayOnly = reports.some((r) => r.source === "serpapi" && !r.configured);

  return (
    <div className="space-y-10">
      <section className="panel p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="label text-ink-gold">Pieces you like</p>
          <form onSubmit={loadByCode} className="flex items-center gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Closet code"
              aria-label="Load a saved closet by code"
              className="field w-32 uppercase tracking-widest"
              maxLength={8}
            />
            <button type="submit" className="btn-ghost" disabled={busy}>
              Load
            </button>
          </form>
        </div>

        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-ink-border px-6 py-10 text-center transition-colors hover:border-ink-gold/50"
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
          <span className="text-sm text-gray-300">
            Drop in photos of clothes you think look good
          </span>
          <span className="mt-1 text-xs text-gray-600">
            {photos.length}/{MAX_PHOTOS} &middot; jackets, trousers, shoes &mdash; whatever
            caught your eye
          </span>
        </label>

        {photos.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {photos.map((photo, index) => (
              <div key={photo.preview} className="relative h-24 w-24">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.preview}
                  alt=""
                  className="h-full w-full rounded-lg border border-ink-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  disabled={busy}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute -right-2 -top-2 h-6 w-6 rounded-full border border-ink-border bg-ink-card text-xs text-gray-400 hover:text-white"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="min" className="label mb-1.5 block">
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
            <label htmlFor="max" className="label mb-1.5 block">
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
            {busy ? STAGE_COPY[stage as Exclude<Stage, "idle">] : "Find me pieces"}
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-ink-red/40 bg-ink-red/5 px-3 py-2 text-sm text-ink-red">
            {error}
          </p>
        )}

        {eBayOnly && (
          <p className="mt-4 text-xs text-gray-600">
            Searching eBay only. Add a SERPAPI_KEY to include mainstream retail.
          </p>
        )}
      </section>

      {closet && (
        <>
          <div className="panel flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div>
              <p className="label mb-1">Closet code</p>
              <p className="font-mono text-2xl tracking-[0.3em] text-ink-gold">
                {closet.code}
              </p>
            </div>
            <p className="max-w-xs text-xs leading-relaxed text-gray-500">
              Saved. This browser reopens it automatically &mdash; use the code to open it
              anywhere else.
            </p>
          </div>

          <ClosetView closet={closet} />
        </>
      )}
    </div>
  );
}
