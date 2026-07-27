"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useToast } from "@/components/Toast";

const field =
  "w-full rounded-lg border border-ink-border bg-ink px-3 py-2.5 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none transition-colors";

const PLATFORMS = [
  { value: "ebay", label: "eBay" },
  { value: "depop", label: "Depop" },
  { value: "other", label: "Other" },
];

export default function GeneratePage() {
  const router = useRouter();
  const toast = useToast();
  const [item, setItem] = useState("");
  const [platform, setPlatform] = useState("ebay");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, platform, count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      toast.push(`Generated ${data.length} draft${data.length === 1 ? "" : "s"}`);
      router.push("/listings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-2xl font-extrabold text-fog sm:text-3xl">
          Write my listing <span className="text-brand">· from what sells</span>
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-fog/60">
          Describe the item: brand, size, condition, flaws, anything a buyer
          would ask. Drafts follow the playbook, get Brain-scored, and rotate
          through experiments.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-8 rounded-2xl border border-brand/20 bg-ink-card p-6 shadow-glow"
      >
        <textarea
          rows={5}
          value={item}
          onChange={(e) => setItem(e.target.value)}
          placeholder="e.g. Carhartt Detroit jacket, brown duck canvas, size L, blanket lined, 90s, small paint fleck on left cuff, zipper works"
          className={`${field} resize-none text-base`}
          autoFocus
        />

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-fog/50">Platform</span>
          <div className="flex gap-1 rounded-lg border border-ink-border bg-ink p-1">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPlatform(p.value)}
                className={
                  "relative rounded-md px-3 py-1.5 font-semibold transition-colors " +
                  (platform === p.value ? "text-ink" : "text-fog/60 hover:text-fog")
                }
              >
                {platform === p.value && (
                  <motion.span
                    layoutId="platform-pill"
                    className="absolute inset-0 rounded-md bg-brand"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-fog/50">How many variants</span>
          <div className="flex gap-1 rounded-lg border border-ink-border bg-ink p-1">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={
                  "relative h-8 w-8 rounded-md font-semibold transition-colors " +
                  (count === n ? "text-ink" : "text-fog/60 hover:text-fog")
                }
              >
                {count === n && (
                  <motion.span
                    layoutId="count-pill"
                    className="absolute inset-0 rounded-md bg-brand"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{n}</span>
              </button>
            ))}
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={generate}
          disabled={busy || item.trim().length < 10}
          className="mt-6 w-full rounded-xl bg-brand py-3 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-40"
        >
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
              Writing…
            </span>
          ) : (
            `Generate ${count > 1 ? `${count} listings` : "listing"}`
          )}
        </motion.button>
        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
      </motion.div>
    </div>
  );
}
