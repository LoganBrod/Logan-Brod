"use client";

import { useState } from "react";
import { encodePhotos } from "@/lib/image";

interface Judgement {
  verdict: "yes" | "maybe" | "no";
  headline: string;
  forIt: string[];
  againstIt: string[];
  onPrice: string;
  onFit: string;
}

const VERDICT: Record<Judgement["verdict"], { label: string; className: string }> = {
  yes: { label: "Worth it", className: "bg-room-ink text-room-bg" },
  maybe: { label: "Depends", className: "border border-room-line text-room-muted" },
  no: { label: "Leave it", className: "border border-room-ink/40 text-room-ink" },
};

/**
 * One piece, one straight answer.
 *
 * Deliberately at the top of the page rather than behind a tab: this is the
 * question people actually have, and it gets asked far more often than anyone
 * sits down to build a whole closet.
 */
export default function JudgePanel({ range }: { range: { min: number; max: number } }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ judgement: Judgement; piece?: { title?: string } } | null>(
    null
  );

  async function ask(body: unknown) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Couldn't judge that.");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't judge that.");
    } finally {
      setBusy(false);
    }
  }

  async function askAboutPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      // Downscaled in the browser, exactly like the upload path — a phone photo
      // is several megabytes and none of it helps.
      const [photo] = await encodePhotos([file]);
      await ask({ photo, range });
    } catch {
      setError("Couldn't read that photo.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-my-2 py-2 text-xs font-semibold text-room-muted underline-offset-4 hover:text-room-ink hover:underline sm:my-0 sm:py-0"
      >
        Found something? Ask if it&rsquo;s any good &rarr;
      </button>
    );
  }

  const verdict = result && VERDICT[result.judgement.verdict];

  return (
    <div className="panel space-y-4 px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Is this any good?</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-room-faint hover:text-room-ink"
        >
          Close
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) void ask({ url, range });
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link to anything"
          aria-label="Link to a listing"
          className="field min-w-0 flex-1"
        />
        <button type="submit" disabled={busy || !url.trim()} className="btn-primary">
          {busy ? "Looking…" : "Ask"}
        </button>
        <label className="btn-ghost cursor-pointer">
          Or a photo
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => askAboutPhoto(e.target.files)}
          />
        </label>
      </form>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {result && verdict && (
        <div className="space-y-3 border-t border-room-line pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${verdict.className}`}
            >
              {verdict.label}
            </span>
            {result.piece?.title && (
              <span className="min-w-0 flex-1 truncate text-xs text-room-faint">
                {result.piece.title}
              </span>
            )}
          </div>

          <p className="text-sm leading-relaxed text-room-ink">{result.judgement.headline}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            {result.judgement.forIt.length > 0 && (
              <div>
                <p className="eyebrow mb-1.5">For it</p>
                <ul className="space-y-1 text-xs leading-relaxed text-room-muted">
                  {result.judgement.forIt.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.judgement.againstIt.length > 0 && (
              <div>
                <p className="eyebrow mb-1.5">Against it</p>
                <ul className="space-y-1 text-xs leading-relaxed text-room-muted">
                  {result.judgement.againstIt.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-1 border-t border-room-line pt-3 text-xs leading-relaxed text-room-muted">
            <p>{result.judgement.onFit}</p>
            <p>{result.judgement.onPrice}</p>
          </div>
        </div>
      )}
    </div>
  );
}
