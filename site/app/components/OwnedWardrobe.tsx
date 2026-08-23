"use client";

import { useCallback, useEffect, useState } from "react";
import { encodePhotos } from "@/lib/image";
import OwnedRail from "./OwnedRail";
import WardrobeWalkthrough from "./WardrobeWalkthrough";

interface Garment {
  id: string;
  label: string;
  category: string;
  colour: string;
  material: string;
  formality: string;
  season: string;
}

interface Outfit {
  name: string;
  itemIndexes: number[];
  occasion: string;
  note: string;
}

interface State {
  configured: boolean;
  allowed: boolean;
  plan: "free" | "member";
  limit: number;
  items: Garment[];
  outfits?: Outfit[];
  missing?: string;
  missingUnlocks?: number;
  error?: string;
}

/**
 * What you already own, and what it makes.
 *
 * Photographs are read once and thrown away — what's kept is a line of text per
 * garment, which is cheap, needs no storage service, and is something a person
 * can read and correct when the app gets one wrong.
 */
export default function OwnedWardrobe() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showingOutfits, setShowingOutfits] = useState(false);

  const load = useCallback((withOutfits = false) => {
    fetch(`/api/wardrobe${withOutfits ? "?outfits=1" : ""}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: State | null) => json && setState(json))
      .catch(() => setError("Couldn't load your wardrobe."));
  }, []);

  useEffect(() => load(), [load]);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const photos = await encodePhotos(Array.from(files).slice(0, 6));
      const res = await fetch("/api/wardrobe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Couldn't read those photos.");
      setState((current) => (current ? { ...current, items: json.items } : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read those photos.");
    } finally {
      setBusy(false);
    }
  }

  async function forget(id: string) {
    await fetch(`/api/wardrobe?id=${id}`, { method: "DELETE" }).catch(() => {});
    load(showingOutfits);
  }

  async function makeOutfits() {
    setBusy(true);
    setShowingOutfits(true);
    load(true);
    setBusy(false);
  }

  if (!state?.configured) return null;

  if (!state.allowed) {
    return (
      <section className="space-y-3">
        <h2 className="eyebrow">What you own</h2>
        <p className="panel px-6 py-5 text-sm leading-relaxed text-room-muted">
          Photograph your wardrobe once and every recommendation afterwards knows what you already
          have - including which single piece would unlock the most outfits from it. Part of
          membership.
        </p>
      </section>
    );
  }

  const uploadControl = (
    <label className={`btn-primary inline-flex cursor-pointer ${busy ? "opacity-50" : ""}`}>
      {busy ? "Reading…" : state.items.length ? "Add more photos" : "Add photos"}
      <input
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        disabled={busy}
        onChange={(e) => addPhotos(e.target.files)}
      />
    </label>
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="eyebrow">What you own</h2>
        <p className="text-xs text-room-faint">
          {state.items.length === 0
            ? "Photograph what's in your wardrobe - several pieces per photo is fine."
            : `${state.items.length} ${state.items.length === 1 ? "piece" : "pieces"} catalogued`}
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* The walkthrough hosts the real control in its second step, so there is
          never a second upload button drifting out of sync with this one. */}
      <WardrobeWalkthrough cataloguedCount={state.items.length} uploadControl={uploadControl} />

      {state.items.length > 0 && (
        <div className="pt-2">
          <OwnedRail items={state.items} onForget={forget} />
        </div>
      )}

      {state.items.length >= 3 && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={makeOutfits} disabled={busy} className="btn-ghost">
            Build outfits
          </button>
        </div>
      )}

      {showingOutfits && state.outfits && state.outfits.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="label">Outfits from these</h3>
          <ul className="space-y-3">
            {state.outfits.map((outfit) => (
              <li key={outfit.name} className="panel px-5 py-4">
                <p className="font-semibold tracking-[-0.01em] text-lg text-room-ink">{outfit.name}</p>
                <p className="mt-0.5 text-xs text-room-faint">{outfit.occasion}</p>
                <p className="mt-2 text-sm text-room-muted">
                  {outfit.itemIndexes
                    .map((index) => state.items[index]?.label)
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-room-muted">{outfit.note}</p>
              </li>
            ))}
          </ul>

          {/* The strongest recommendation the app can make: a purchase with a
              number attached to it. */}
          {state.missing && (
            <div className="panel border-accent/30 px-5 py-4">
              <p className="eyebrow mb-1">The piece you&rsquo;re missing</p>
              <p className="font-semibold tracking-[-0.01em] text-lg text-room-ink">{state.missing}</p>
              {typeof state.missingUnlocks === "number" && state.missingUnlocks > 0 && (
                <p className="mt-1 text-sm text-room-muted">
                  Roughly {state.missingUnlocks} more {state.missingUnlocks === 1 ? "outfit" : "outfits"} from
                  what you already own.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
