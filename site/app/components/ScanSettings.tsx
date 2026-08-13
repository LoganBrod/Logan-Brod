"use client";

import { useEffect, useState } from "react";
import { muteScanPrompt, scanPromptMuted } from "./ScanPrompt";

/**
 * Where the popup can be turned back on.
 *
 * A "don't ask again" with no way back is a trap, and the place people look for
 * it is the page belonging to the thing that was asking. Reading localStorage
 * happens after mount rather than during render — the server has no idea what
 * this browser chose, and rendering the checkbox from a guess would flip it
 * under the cursor on hydration.
 */
export default function ScanSettings() {
  const [muted, setMuted] = useState<boolean | null>(null);

  useEffect(() => setMuted(scanPromptMuted()), []);

  if (muted === null) return null;

  return (
    <section className="space-y-3">
      <h2 className="label">After a clozet</h2>
      <label className="panel flex cursor-pointer items-start gap-3 px-6 py-5">
        <input
          type="checkbox"
          checked={!muted}
          onChange={(event) => {
            const next = !event.target.checked;
            muteScanPrompt(next);
            setMuted(next);
          }}
          className="mt-0.5 h-4 w-4 rounded border-room-line accent-[#8A7448]"
        />
        <span className="text-sm leading-relaxed text-room-muted">
          Ask whether I want a standing scan when a clozet finishes.
          <span className="mt-1 block text-xs text-room-faint">
            Stored in this browser, so it&rsquo;s per-device rather than per-account.
          </span>
        </span>
      </label>
    </section>
  );
}
