"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface AuthState {
  plan: "free" | "member";
  limits: { closets: number };
  used: { closets: number };
  resets: { closets: string };
  available: boolean;
}

/** Anything at or above this is the unlimited sentinel, not a number to show. */
const UNLIMITED = Number.MAX_SAFE_INTEGER;

/**
 * "Resets Monday", or "resets tomorrow" on the day it matters.
 *
 * Named rather than counted down: a person reads "resets Monday" once and
 * knows, where "resets in 3d 4h" has to be read every time and means nothing
 * without doing the arithmetic yourself.
 */
function resetPhrase(iso: string): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "";
  const hours = (at - Date.now()) / (60 * 60 * 1000);
  if (hours <= 0) return "resets now";
  if (hours <= 24) return "resets tomorrow";
  return `resets ${new Date(at).toLocaleDateString(undefined, { weekday: "long" })}`;
}

/**
 * The corner of the product: how much of the week is left, and that this is a beta.
 *
 * Both things belong to the same moment and so they share one object rather
 * than two floating chips. Somebody arriving from TikTok needs to know they
 * have three of these and that the thing is new — and needs a way to say when
 * it breaks, which is the line underneath.
 *
 * Fixed bottom-right rather than in the header: the header is per-page and
 * this is true everywhere in the app, and the bottom-right corner is the one
 * place on a phone that no primary control occupies.
 *
 * Renders nothing at all for members and nothing when accounts aren't
 * configured — a counter that cannot count is worse than no counter.
 */
export default function StatusDock() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  // On the feedback page itself the link is a link to here, which reads as
  // nobody having looked at it. The word stays; the invitation doesn't.
  const onFeedbackPage = usePathname() === "/feedback";

  const load = useCallback(() => {
    fetch("/api/auth")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: AuthState | null) => json && setAuth(json))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();

    // A run spends one, and the number on screen is stale the moment it does.
    // Also on returning to the tab, because the other thing that changes it is
    // a run in a different tab.
    const refresh = () => load();
    const onVisible = () => document.visibilityState === "visible" && load();
    window.addEventListener("clozet:spent", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("clozet:spent", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const limit = auth?.limits?.closets ?? 0;
  const counted = Boolean(auth) && auth!.available && auth!.plan === "free" && limit < UNLIMITED;
  const left = counted ? Math.max(0, limit - (auth!.used?.closets ?? 0)) : 0;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex justify-end sm:bottom-5 sm:right-5">
      {/* Tighter on a phone, where this floats over the page rather than beside
          it and every millimetre it occupies is a millimetre of somebody's
          upload card. */}
      <div className="panel pointer-events-auto max-w-[min(17rem,calc(100vw-2rem))] px-3 py-2 sm:px-4 sm:py-3">
        {/* Shorter below sm, down to "3 of 3 left". At full length this is
            215px of fixed overlay sitting on top of the upload card on a
            390px screen - the reset day and the word "clozets" are the two
            parts a person can do without when the alternative is covering the
            thing they came to use. */}
        {counted && (
          <p className="text-[12px] leading-snug text-room-ink">
            <span className="font-semibold">
              {left} of {limit}
            </span>
            <span className="hidden sm:inline"> {left === 1 ? "clozet" : "clozets"}</span> left
            <span className="hidden text-room-faint sm:inline">
              {" "}
              · {resetPhrase(auth!.resets?.closets ?? "")}
            </span>
          </p>
        )}

        {/* Always, even before the counter has loaded and even for members:
            this is the half that has to be true on a stranger's first screen. */}
        <p className={`text-[11px] leading-snug text-room-faint ${counted ? "mt-1.5" : ""}`}>
          <span className="font-semibold uppercase tracking-[0.14em] text-room-muted">Beta</span>
          {!onFeedbackPage && (
            <>
              {" · "}
              <Link href="/feedback" className="underline underline-offset-2 hover:text-room-ink">
                <span className="sm:hidden">report</span>
                <span className="hidden sm:inline">something wrong?</span>
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
