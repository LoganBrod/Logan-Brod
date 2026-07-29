"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/Toast";

/**
 * The repair panel for a listing the Brain graded badly.
 *
 * A low score has a cause, and the cause decides the fix: no amount of
 * rewriting saves a listing whose problem is that it has one blurry photo,
 * and adding photos does nothing for one in the wrong category. So the panel
 * asks the server what is actually wrong, then shows only that repair.
 *
 * Relisting is offered but never automatic. Ending and re-posting resets the
 * listing's age, but it loses every watcher, can cost an insertion fee, and
 * eBay treats recycling listings purely to reset exposure as manipulation.
 * Revising in place keeps all of that, so it is the default.
 */

interface Plan {
  kind: "photos" | "content" | "price";
  weakest: string;
  detail: string;
  photoCount?: number;
  proposal?: { title: string; description: string; price: number; why: string };
  current?: { title: string; description: string; price: number };
}

export default function FixPanel({
  listingId,
  score,
  canRelist,
  onApplied,
}: {
  listingId: string;
  score: number;
  /** Only listings published from here have an offer that can be withdrawn. */
  canRelist: boolean;
  onApplied: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [relist, setRelist] = useState(false);

  // Editable copies, so the seller can adjust the proposal before accepting.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  const [added, setAdded] = useState<{ id: string; preview: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadPlan() {
    setOpen(true);
    if (plan) return;
    setBusy("plan");
    setError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/fix-plan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't work out a fix");
      setPlan(data);
      if (data.proposal) {
        setTitle(data.proposal.title ?? "");
        setDescription(data.proposal.description ?? "");
        setPrice(data.proposal.price ? String(data.proposal.price) : "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't work out a fix");
    } finally {
      setBusy(null);
    }
  }

  async function uploadPhoto(file: File) {
    setBusy("upload");
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/photos", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setAdded((prev) => [...prev, { id: data.id, preview: URL.createObjectURL(file) }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    setBusy("apply");
    setError(null);
    try {
      const body: Record<string, unknown> = { relist };
      if (plan?.kind === "photos") {
        body.addPhotoIds = added.map((a) => a.id);
      } else {
        if (title.trim()) body.title = title.trim();
        if (description.trim()) body.description = description.trim();
        if (price && Number(price) > 0) body.price = Number(price);
      }
      const res = await fetch(`/api/listings/${listingId}/fix-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't apply the fix");
      toast.push(
        data.relisted
          ? "Applied and relisted on eBay"
          : data.appliedToEbay
            ? "Live listing updated on eBay"
            : "Saved to the draft"
      );
      setOpen(false);
      setPlan(null);
      setAdded([]);
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply the fix");
    } finally {
      setBusy(null);
    }
  }

  const canApply =
    plan?.kind === "photos" ? added.length > 0 : Boolean(title.trim() || description.trim() || price);

  if (!open) {
    return (
      <button
        onClick={loadPlan}
        className="bg-amber-400/15 px-3 py-1.5 text-sm font-semibold text-amber-500 transition hover:bg-amber-400 hover:text-ink"
      >
        Fix &amp; relist · {score}/100
      </button>
    );
  }

  return (
    <div className="mt-3 border border-amber-400/30 bg-amber-400/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-fog">Scored {score}/100</p>
          {plan && (
            <p className="mt-0.5 text-xs text-fog/60">
              Weakest part: <span className="text-fog/80">{plan.weakest}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-fog/40 hover:text-fog"
        >
          Close
        </button>
      </div>

      {busy === "plan" && <p className="mt-3 text-xs text-fog/50">Working out what to fix…</p>}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {plan && (
        <div className="mt-3 space-y-3">
          {plan.detail && <p className="text-xs leading-relaxed text-fog/60">{plan.detail}</p>}

          {plan.kind === "photos" ? (
            <div>
              <p className="text-xs font-semibold text-fog/70">
                Add photos {plan.photoCount !== undefined && `(has ${plan.photoCount})`}
              </p>
              <p className="mt-0.5 text-xs text-fog/40">
                Front, back, label, and a close-up of any flaw. These replace the
                listing&apos;s photo set on eBay, keeping the ones already there.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {added.map((a) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={a.id}
                    src={a.preview}
                    alt=""
                    className="h-16 w-16 border border-ink-border object-contain"
                  />
                ))}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy === "upload"}
                  className="flex h-16 w-16 items-center justify-center border border-dashed border-ink-border text-xs font-semibold text-fog/50 hover:border-brand"
                >
                  {busy === "upload" ? "…" : "+ Add"}
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPhoto(f);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {plan.proposal?.why && (
                <p className="text-xs leading-relaxed text-fog/50">{plan.proposal.why}</p>
              )}
              <label className="block space-y-1 text-xs">
                <span className="text-fog/50">Proposed title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-ink-border bg-ink px-2 py-1.5 text-fog focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="text-fog/50">Proposed description</span>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-ink-border bg-ink px-2 py-1.5 text-fog focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block max-w-[10rem] space-y-1 text-xs">
                <span className="text-fog/50">Proposed price</span>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full border border-ink-border bg-ink px-2 py-1.5 text-fog focus:border-brand focus:outline-none"
                />
              </label>
              {plan.current && (
                <p className="text-[11px] text-fog/35">
                  Currently: {plan.current.title} · ${plan.current.price}
                </p>
              )}
            </div>
          )}

          <label className="flex items-start gap-2 border-t border-ink-border pt-3 text-xs">
            <input
              type="checkbox"
              checked={relist}
              onChange={(e) => setRelist(e.target.checked)}
              disabled={!canRelist}
              className="mt-0.5"
            />
            <span className={canRelist ? "text-fog/70" : "text-fog/30"}>
              Relist after applying
              <span className="mt-0.5 block text-[11px] text-fog/40">
                {canRelist
                  ? "Ends the listing and posts it fresh. Resets its age, but loses its watchers and may cost an insertion fee. Leave off to edit in place."
                  : "Not available: this listing wasn't published through LevoZ, so there's no offer to withdraw. The edits still apply in place."}
              </span>
            </span>
          </label>

          <button
            onClick={apply}
            disabled={busy !== null || !canApply}
            className="bg-brand px-5 py-2 text-sm font-bold text-ink transition hover:bg-brand-dim disabled:opacity-40"
          >
            {busy === "apply"
              ? "Applying…"
              : relist
                ? "Accept and relist"
                : "Accept changes"}
          </button>
        </div>
      )}
    </div>
  );
}
