"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Live clock, and the thing that keeps the whole display current.
 *
 * router.refresh() re-runs the server components, so the panels pick up edits
 * to memory/ without a manual reload. That is the right call here: this screen
 * is on a wall with no keyboard in front of it.
 *
 * The mounted flag exists to avoid a hydration mismatch. The server renders
 * the time at request time and the browser renders it milliseconds later; if
 * the two strings differ React complains. Rendering the clock only after mount
 * sidesteps it — the trade is a single frame with a placeholder.
 */
export default function Clock({ refreshMs = 60_000 }: { refreshMs?: number }) {
  const [now, setNow] = useState<Date | null>(null);
  const router = useRouter();

  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const refresh = setInterval(() => router.refresh(), refreshMs);
    return () => clearInterval(refresh);
  }, [router, refreshMs]);

  // Split so the meridiem can be rendered small — "01:34 AM 04" beside a
  // separate seconds field read as one confusing number at a glance.
  const parts = now
    ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const [clock, meridiem] = splitMeridiem(parts);
  const date = now
    ? now.toLocaleDateString([], {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-[6rem] font-light leading-none tracking-tight text-white">
          {clock}
        </span>
        {meridiem && (
          <span className="text-2xl font-light uppercase tracking-widest text-accent/50">
            {meridiem}
          </span>
        )}
      </div>
      <span className="mt-3 text-xl font-light text-white/45">{date}</span>
    </div>
  );
}

function splitMeridiem(value: string): [string, string] {
  const m = /^(.*?)\s*([AaPp][Mm])$/.exec(value.trim());
  return m ? [m[1] ?? value, m[2] ?? ""] : [value, ""];
}
