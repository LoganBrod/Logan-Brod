"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

interface ProposalListing {
  id: string;
  title: string;
  price: number;
  status: string;
  ebayItemId?: string;
  views: number;
  watchers: number;
  offers: number;
}

interface Proposal {
  id: string;
  listingId: string;
  kind: "reprice" | "retitle" | "rewrite" | "relist" | "hold";
  summary: string;
  rationale: string;
  currentPrice?: number;
  proposedPrice?: number;
  currentTitle?: string;
  proposedTitle?: string;
  confidence: number;
  status: "pending" | "approved" | "dismissed" | "applied" | "auto-applied" | "failed";
  error?: string;
  createdAt: string;
  listing: ProposalListing | null;
}

const KIND_LABEL: Record<Proposal["kind"], string> = {
  reprice: "Reprice",
  retitle: "New title",
  rewrite: "Rewrite",
  relist: "Relist",
  hold: "Hold",
};

export default function ProposalsFeed({ ebayConnected }: { ebayConnected: boolean }) {
  const toast = useToast();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [lastResearchAt, setLastResearchAt] = useState<string | undefined>();
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch("/api/proposals", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setProposals(d.proposals ?? []);
        setLastResearchAt(d.lastResearchAt);
      })
      .catch(() => setProposals([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runResearch() {
    setRunning(true);
    try {
      const res = await fetch("/api/research", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Research failed");
      await load();
      const autoApplied = data.autoApplied ?? 0;
      const msg = autoApplied > 0
        ? `${data.proposed} proposals — ${autoApplied} auto-applied, ${data.proposed - autoApplied} awaiting review`
        : data.proposed > 0
          ? `${data.proposed} proposal${data.proposed === 1 ? "" : "s"} from ${data.considered} listings`
          : `Checked ${data.considered} listings, nothing worth changing yet`;
      toast.push(msg);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Research failed", "error");
    } finally {
      setRunning(false);
    }
  }

  async function decide(id: string, action: "approve" | "dismiss") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await load();
      toast.push(action === "approve" ? "Applied to your eBay listing" : "Dismissed");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const pending = (proposals ?? []).filter((p) => p.status === "pending");
  const autoApplied = (proposals ?? []).filter((p) => p.status === "auto-applied");
  // Auto-applied changes are shown, not just counted: they went live without
  // being asked about, so seeing what changed matters more than the tally.
  const recent = (proposals ?? []).filter((p) => p.status !== "pending").slice(0, 6);

  if (!ebayConnected) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-border bg-ink-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-border px-5 py-4">
        <div>
          <h2 className="font-bold text-fog">Insight report</h2>
          <p className="text-xs text-fog/45">
            {lastResearchAt
              ? `Last checked ${new Date(lastResearchAt).toLocaleString()}`
              : "Not run yet"}
            {pending.length > 0 &&
              ` · ${pending.length} proposal${pending.length === 1 ? "" : "s"} awaiting your approval`}
            {autoApplied.length > 0 &&
              ` · ${autoApplied.length} auto-applied`}
          </p>
        </div>
        <button
          onClick={runResearch}
          disabled={running}
          className="border border-ink-border px-4 py-2 text-xs font-bold text-fog transition hover:border-brand/50 disabled:opacity-50"
        >
          {running ? "Researching…" : "Run research"}
        </button>
      </header>

      {proposals === null ? (
        <p className="px-5 py-6 text-sm text-fog/40">Loading…</p>
      ) : pending.length === 0 && recent.length === 0 ? (
        <p className="px-5 py-6 text-sm text-fog/45">
          Nothing proposed yet. Listings need to be live for at least a day before there is enough
          traffic to judge them.
        </p>
      ) : (
        <div>
          {pending.map((p) => (
            <ProposalRow
              key={p.id}
              p={p}
              busy={busyId === p.id}
              onApprove={() => decide(p.id, "approve")}
              onDismiss={() => decide(p.id, "dismiss")}
            />
          ))}
          {recent.map((p) => (
            <ProposalRow key={p.id} p={p} settled />
          ))}
        </div>
      )}
    </section>
  );
}

function ProposalRow({
  p,
  busy,
  settled,
  onApprove,
  onDismiss,
}: {
  p: Proposal;
  busy?: boolean;
  settled?: boolean;
  onApprove?: () => void;
  onDismiss?: () => void;
}) {
  const stats = p.listing
    ? `${p.listing.views} views · ${p.listing.watchers} watchers · ${p.listing.offers} offers`
    : "";

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-ink-border/60 px-5 py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fog">
          {p.listing?.title ?? "Listing removed"}
        </p>
        <p className="mt-0.5 text-xs text-fog/45">{stats}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-fog/60">{p.summary}</p>
        {p.error && <p className="mt-1 text-xs text-red-400">{p.error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="bg-brand/12 px-3 py-1.5 text-xs font-bold text-brand-dim">
          {p.kind === "reprice" && p.proposedPrice !== undefined
            ? `$${p.currentPrice?.toFixed(0)} → $${p.proposedPrice.toFixed(0)}`
            : KIND_LABEL[p.kind]}
        </span>

        {settled ? (
          <span
            className={
              "px-3 py-1.5 text-xs font-semibold " +
              (p.status === "applied"
                ? "bg-brand/12 text-brand-dim"
                : p.status === "auto-applied"
                  ? "bg-amber-400/12 text-amber-300"
                  : p.status === "failed"
                    ? "bg-red-500/12 text-red-400"
                    : "bg-ink-deep text-fog/40")
            }
          >
            {p.status === "auto-applied" ? "applied automatically" : p.status}
          </span>
        ) : (
          <>
            <button
              onClick={onApprove}
              disabled={busy}
              className="bg-brand px-4 py-1.5 text-xs font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
            >
              {busy ? "Applying…" : "Approve"}
            </button>
            <button
              onClick={onDismiss}
              disabled={busy}
              className="px-2 py-1.5 text-xs font-semibold text-fog/40 transition hover:text-fog disabled:opacity-50"
            >
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}
