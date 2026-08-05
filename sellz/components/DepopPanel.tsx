"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useToast } from "@/components/Toast";
import type { DepopDraft, DepopState } from "@/lib/store";

/**
 * The Depop half of a listing: a separately written draft, and the manual
 * tracking that stands in for the API Depop doesn't publish.
 *
 * Two things drive the design.
 *
 * First, this is a copy-paste surface, not a publish button. Depop has no
 * write API, so the seller fills Depop's own compose form. The panel is
 * therefore laid out in the order Depop's form asks for things, with one copy
 * button per field, so it can be worked top to bottom with the app in one
 * window and Depop in another.
 *
 * Second, every number here is typed in by the seller. Nothing can be
 * verified, so the panel never implies it is live — it shows when a reading
 * was last taken and asks for a fresh one, rather than presenting stale
 * figures as current.
 */

interface Props {
  listingId: string;
  ebayPrice: number;
  depop?: DepopState;
  /** Structural rather than the store's ListingOutcome, so the listings page
   *  can pass its own client-side shape without the two having to match. */
  outcome?: {
    views: number;
    watchers: number;
    offers: number;
    soldPrice?: number;
    listedAt?: string;
    soldAt?: string;
    updatedAt?: string;
  };
  status: string;
  onChanged: () => void;
}

/** Depop's posting windows — see DEPOP_POSTING_ADVICE in lib/depop.ts. */
const POST_WINDOWS = ["12pm – 2pm", "5pm – 7pm", "8pm – 10pm"];

/**
 * Depop's feed ranks on recency, so a listing that has sat untouched for a
 * week has effectively fallen out of it. A week is the point where refreshing
 * is worth the seller's time.
 */
const REFRESH_AFTER_DAYS = 7;

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function CopyRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 border-b border-ink-border/60 py-2 last:border-0">
      <span className="w-24 shrink-0 text-xs text-fog/50">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-fog">{value}</span>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onCopy}
        className="shrink-0 rounded-lg border border-ink-border px-2.5 py-1 text-xs font-semibold text-fog/70 transition hover:text-fog"
      >
        {copied ? "copied" : "copy"}
      </motion.button>
    </div>
  );
}

export default function DepopPanel({
  listingId,
  ebayPrice,
  depop,
  outcome,
  status,
  onChanged,
}: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [url, setUrl] = useState(depop?.url ?? "");
  const [views, setViews] = useState(String(outcome?.views ?? 0));
  const [likes, setLikes] = useState(String(outcome?.watchers ?? 0));
  const [soldPrice, setSoldPrice] = useState("");

  const draft = depop?.draft as DepopDraft | undefined;
  const listed = Boolean(depop?.listedAt);
  const sold = status === "sold";

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  async function call(key: string, init: RequestInit, url: string, msg?: string) {
    setBusy(key);
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't work");
      if (msg) toast.push(msg);
      onChanged();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "That didn't work", "error");
    } finally {
      setBusy(null);
    }
  }

  const track = (body: unknown, msg?: string, key = "track") =>
    call(
      key,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      `/api/listings/${listingId}/depop`,
      msg
    );

  const saveNumbers = (extra: Record<string, unknown> = {}, msg = "Saved") =>
    call(
      "numbers",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          views: Number(views) || 0,
          likes: Number(likes) || 0,
          offers: outcome?.offers ?? 0,
          listedAt: outcome?.listedAt ?? depop?.listedAt,
          soldPrice: outcome?.soldPrice,
          soldAt: outcome?.soldAt,
          ...extra,
        }),
      },
      `/api/listings/${listingId}/outcome`,
      msg
    );

  // ---- No draft yet -------------------------------------------------------

  if (!draft) {
    return (
      <div className="glass rounded-2xl p-5">
        <h3 className="text-base font-bold text-fog">Post this on Depop</h3>
        <p className="mt-1.5 text-sm text-fog/60">
          Depop ranks listings completely differently to eBay — hashtags and photos instead of
          keyword-stuffed titles. This writes a second version built for that, so you&rsquo;re not
          pasting an eBay listing where it won&rsquo;t work.
        </p>
        <motion.button
          whileTap={{ scale: 0.98 }}
          disabled={busy === "gen"}
          onClick={() => call("gen", { method: "POST" }, `/api/listings/${listingId}/depop`, "Depop version ready")}
          className="mt-4 w-full rounded-xl grad-primary px-5 py-3 text-sm font-bold disabled:opacity-50 sm:w-auto"
        >
          {busy === "gen" ? "Writing it…" : "Write the Depop version"}
        </motion.button>
      </div>
    );
  }

  const fullDescription =
    draft.hashtags.length > 0
      ? `${draft.description}\n\n${draft.hashtags.map((h) => `#${h}`).join(" ")}`
      : draft.description;

  const staleDays = daysSince(depop?.refreshedAt ?? depop?.listedAt);
  const needsRefresh = listed && !sold && staleDays !== null && staleDays >= REFRESH_AFTER_DAYS;

  return (
    <div className="space-y-4">
      {/* ---- The draft ---- */}
      <div className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-fog">Your Depop listing</h3>
          <span className="rounded-full bg-pop/15 px-2.5 py-1 text-xs font-semibold text-pop">
            {draft.vibe}
          </span>
        </div>
        <p className="mt-1 text-xs text-fog/50">
          Written for Depop, not copied from your eBay listing.
        </p>

        <div className="mt-4 rounded-xl border border-ink-border bg-ink-deep p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fog">{fullDescription}</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => copy(fullDescription, "desc")}
          className="mt-3 w-full rounded-xl grad-primary px-5 py-3 text-sm font-bold"
        >
          {copied === "desc" ? "Copied ✓" : "Copy description + hashtags"}
        </motion.button>

        <div className="mt-4">
          <CopyRow label="Price" value={`$${draft.price}`} onCopy={() => copy(String(draft.price), "price")} copied={copied === "price"} />
          <CopyRow label="Brand" value={draft.brand} onCopy={() => copy(draft.brand, "brand")} copied={copied === "brand"} />
          <CopyRow label="Size" value={draft.size} onCopy={() => copy(draft.size, "size")} copied={copied === "size"} />
          <CopyRow label="Category" value={`${draft.category} › ${draft.subcategory}`} onCopy={() => copy(draft.subcategory, "cat")} copied={copied === "cat"} />
          <CopyRow label="Condition" value={draft.condition} onCopy={() => copy(draft.condition, "cond")} copied={copied === "cond"} />
          <CopyRow label="Colour" value={draft.colour} onCopy={() => copy(draft.colour, "col")} copied={copied === "col"} />
          <CopyRow label="Source" value={draft.source} onCopy={() => copy(draft.source, "src")} copied={copied === "src"} />
          <CopyRow label="Age" value={draft.age} onCopy={() => copy(draft.age, "age")} copied={copied === "age"} />
        </div>

        {draft.price !== ebayPrice && (
          <p className="mt-3 rounded-lg bg-ink-deep px-3 py-2 text-xs text-fog/60">
            ${draft.price} on Depop vs ${ebayPrice} on eBay — {draft.priceNote}
          </p>
        )}
      </div>

      {/* ---- Photos: the thing Depop actually ranks ---- */}
      {draft.photoPlan.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-base font-bold text-fog">Shots to take 📸</h3>
          <p className="mt-1 text-xs text-fog/50">
            Depop is a feed — the first photo does most of the selling. This matters more than
            anything you wrote.
          </p>
          <ol className="mt-3 space-y-2">
            {draft.photoPlan.map((shot, i) => (
              <li key={i} className="flex gap-3 text-sm text-fog/80">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pop/15 text-xs font-bold text-pop">
                  {i + 1}
                </span>
                {shot}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ---- Tracking ---- */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-base font-bold text-fog">Track it</h3>
        <p className="mt-1 text-xs text-fog/50">
          Depop doesn&rsquo;t let apps read your shop, so these numbers come from you. Copy them off
          your Depop listing whenever you check it.
        </p>

        {!listed ? (
          <>
            <div className="mt-3 rounded-xl border border-ink-border bg-ink-deep p-3">
              <p className="text-xs font-semibold text-fog/70">Best times to post</p>
              <p className="mt-1 text-xs text-fog/50">
                {POST_WINDOWS.join(" · ")} — space listings out rather than posting a batch at once,
                so each gets its own run at the feed.
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.98 }}
              disabled={busy === "listed"}
              onClick={() => track({ listed: true }, "Tracking it now", "listed")}
              className="mt-3 w-full rounded-xl grad-primary px-5 py-3 text-sm font-bold disabled:opacity-50"
            >
              {busy === "listed" ? "Saving…" : "I posted it on Depop"}
            </motion.button>
          </>
        ) : (
          <div className="mt-3 space-y-3">
            {needsRefresh && (
              <div className="rounded-xl border border-pop/30 bg-pop/10 p-3">
                <p className="text-sm font-semibold text-fog">
                  Up {staleDays} days without a refresh
                </p>
                <p className="mt-1 text-xs text-fog/60">
                  Depop pushes recent listings first, so this one has drifted down the feed.
                  Refreshing it on Depop puts it back near the top.
                </p>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  disabled={busy === "refresh"}
                  onClick={() => track({ refreshed: true }, "Nice — clock reset", "refresh")}
                  className="mt-2 rounded-lg border border-ink-border px-3 py-1.5 text-xs font-bold text-fog"
                >
                  I refreshed it
                </motion.button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-fog/50">Views</span>
                <input
                  inputMode="numeric"
                  value={views}
                  onChange={(e) => setViews(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink-border bg-ink-deep px-3 py-2 text-sm text-fog"
                />
              </label>
              <label className="block">
                <span className="text-xs text-fog/50">Likes</span>
                <input
                  inputMode="numeric"
                  value={likes}
                  onChange={(e) => setLikes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink-border bg-ink-deep px-3 py-2 text-sm text-fog"
                />
              </label>
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              disabled={busy === "numbers"}
              onClick={() => saveNumbers({}, "Saved")}
              className="w-full rounded-xl border border-ink-border px-5 py-2.5 text-sm font-bold text-fog disabled:opacity-50"
            >
              {busy === "numbers" ? "Saving…" : "Save today's numbers"}
            </motion.button>

            {outcome?.updatedAt && (
              <p className="text-center text-xs text-fog/40">
                Last updated {daysSince(outcome.updatedAt) === 0 ? "today" : `${daysSince(outcome.updatedAt)}d ago`}
              </p>
            )}

            {!sold && (
              <div className="rounded-xl border border-ink-border bg-ink-deep p-3">
                <p className="text-xs font-semibold text-fog/70">Sold it?</p>
                <div className="mt-2 flex gap-2">
                  <input
                    inputMode="decimal"
                    placeholder="What you got"
                    value={soldPrice}
                    onChange={(e) => setSoldPrice(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-ink-border bg-ink px-3 py-2 text-sm text-fog"
                  />
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    disabled={busy === "numbers" || !(Number(soldPrice) > 0)}
                    onClick={() =>
                      saveNumbers(
                        { soldPrice: Number(soldPrice), soldAt: new Date().toISOString() },
                        "Nice one 🎉"
                      ).then(() =>
                        call(
                          "sold",
                          {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "sold" }),
                          },
                          `/api/listings/${listingId}`
                        )
                      )
                    }
                    className="shrink-0 rounded-lg grad-primary px-4 py-2 text-sm font-bold disabled:opacity-40"
                  >
                    Mark sold
                  </motion.button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input
                placeholder="Link to your Depop listing (optional)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-ink-border bg-ink-deep px-3 py-2 text-xs text-fog"
              />
              <motion.button
                whileTap={{ scale: 0.98 }}
                disabled={busy === "url"}
                onClick={() => track({ url }, "Link saved", "url")}
                className="shrink-0 rounded-lg border border-ink-border px-3 py-2 text-xs font-bold text-fog"
              >
                Save
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
