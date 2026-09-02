"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Props {
  /** The closet that just finished, as a name for the watch. */
  name: string;
  itemCount: number;
  /** Called when they say yes. Resolves false if the watch couldn't be started. */
  onStart: () => Promise<boolean>;
  onClose: () => void;
  plan: "free" | "member";
}

/** Remembered in the browser, not on the account — this is a UI preference, not data. */
export const MUTE_KEY = "levoz.scanPrompt.muted";

export function scanPromptMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // Safari in private mode throws on localStorage. Asking every time is the
    // safe failure: annoying beats silently losing a preference they set.
    return false;
  }
}

export function muteScanPrompt(muted: boolean): void {
  try {
    if (muted) window.localStorage.setItem(MUTE_KEY, "1");
    else window.localStorage.removeItem(MUTE_KEY);
  } catch {
    /* nothing to do — see above */
  }
}

/**
 * The offer, made at the only moment it's obviously true.
 *
 * A closet is one search, run once. Secondhand stock turns over daily, so
 * almost everything that would suit this person is not listed at the moment
 * they pressed the button — which is a genuinely uncomfortable fact and the
 * entire argument for the paid tier. It lands hardest immediately after they've
 * seen what a single search found, so that's when it's said.
 *
 * It is a modal because it was asked to be in your face, and modals that can't
 * be dismissed are the ones people come to hate — so it closes on Escape, on a
 * backdrop click, and carries a "don't ask again" that is honoured permanently.
 */
export default function ScanPrompt({ name, itemCount, onStart, onClose, plan }: Props) {
  const [busy, setBusy] = useState(false);
  const [mute, setMute] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  function dismiss() {
    muteScanPrompt(mute);
    onClose();
  }

  // Escape closes, and focus lands on the primary action rather than on the
  // page behind the dialog.
  useEffect(() => {
    startRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `dismiss` closes over `mute`, which is why this re-binds when it changes.
  }, [mute]);

  async function start() {
    setBusy(true);
    setFailed(null);
    const ok = await onStart();
    setBusy(false);
    if (ok) {
      muteScanPrompt(mute);
      onClose();
      return;
    }
    setFailed(
      plan === "free"
        ? "Standing scans are part of membership."
        : "Couldn't start that scan. Try again from the Scan page."
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-room-ink/30 p-4 backdrop-blur-sm sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-prompt-title"
        // The room's panel surface, not hard white. It was `bg-white` with
        // room-ink text, which is white on white the moment the theme is dark;
        // the interruption is carried by the backdrop and the shadow instead.
        className="w-full max-w-lg rounded-3xl border border-room-line bg-room-panel p-7 shadow-[0_24px_60px_rgba(6,6,8,0.45)] sm:p-9"
      >
        <p className="eyebrow mb-3">Keep looking</p>
        <h2 id="scan-prompt-title" className="font-semibold tracking-[-0.01em] text-3xl leading-tight text-room-ink">
          That was one search, on one day.
        </h2>

        <p className="mt-4 text-sm leading-relaxed text-room-muted">
          Those {itemCount} pieces are what happened to be listed this minute. Secondhand stock turns
          over daily - most of what would suit you isn&rsquo;t listed right now, and by next
          week half of it will be gone.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-room-muted">
          A standing scan keeps these searches running twice a day and emails you only when
          something clears the same bar these did.
        </p>

        {failed && (
          <div className="mt-5 rounded-xl border border-room-line bg-room-bg px-4 py-3">
            <p className="text-sm text-room-ink">{failed}</p>
            {plan === "free" && (
              <Link href="/closet/tools#scans" className="mt-1 inline-block text-sm font-semibold text-accent">
                See what membership includes &rarr;
              </Link>
            )}
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button ref={startRef} type="button" onClick={start} disabled={busy} className="btn-primary">
            {busy ? "Starting…" : plan === "member" ? "Scan for these" : "Scan and upgrade"}
          </button>
          <button type="button" onClick={dismiss} className="btn-ghost">
            Not now
          </button>
        </div>

        <label className="mt-6 flex cursor-pointer items-center gap-2.5 text-xs text-room-faint">
          <input
            type="checkbox"
            checked={mute}
            onChange={(event) => setMute(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-room-line accent-[--accent]"
          />
          Don&rsquo;t ask me this again
        </label>

        <p className="mt-2 text-xs text-room-faint">
          You can start one any time from the <Link href="/closet/tools#scans" className="underline">Tools</Link>{" "}
          page - and turn this prompt back on there too.
        </p>

        <p className="sr-only">Clozet: {name}</p>
      </div>
    </div>
  );
}
