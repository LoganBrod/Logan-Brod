"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analyticsEvents";
import { KINDS, MAX_MESSAGE, type FeedbackKind } from "@/lib/feedbackKinds";

const LABEL: Record<FeedbackKind, { name: string; hint: string }> = {
  bug: { name: "Something's broken", hint: "It crashed, it hung, or it showed me the wrong thing." },
  idea: { name: "An idea", hint: "Something it should do that it doesn't." },
  other: { name: "Something else", hint: "Anything that doesn't fit the other two." },
};

/**
 * The form that tells us what's wrong.
 *
 * No account, no email required, nothing to fill in but the box. Every field
 * beyond the message is optional on purpose: the cost of asking for one more
 * thing is measured in reports that don't get sent, and a bug report with no
 * way to reply is still worth more than no bug report.
 *
 * It carries the page you came from without asking. Half of "it broke" reports
 * are unactionable because nobody remembers where they were, and the browser
 * already knows.
 */
export default function FeedbackForm() {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where they came from, when they arrived here from somewhere on the site.
  // Same-origin only: the referrer can say anything, and this one gets stored.
  useEffect(() => {
    try {
      const ref = document.referrer;
      if (!ref) return;
      const url = new URL(ref);
      if (url.origin === window.location.origin) setFrom(url.pathname + url.search);
    } catch {
      // A referrer we can't parse is a referrer we don't record.
    }
  }, []);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !message.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, message, contact, path: from }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Couldn't send that. Try again in a moment.");
        return;
      }
      track("feedback_sent");
      setSent(true);
      setMessage("");
      setContact("");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="panel px-7 py-8">
        <p className="text-[15px] text-room-ink">Got it — thank you.</p>
        <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-room-muted">
          It goes straight to the person building this. If you left an address and it&rsquo;s
          something we can fix, you&rsquo;ll hear back.
        </p>
        <button type="button" onClick={() => setSent(false)} className="btn-ghost mt-6">
          Send another
        </button>
      </div>
    );
  }

  const left = MAX_MESSAGE - message.length;

  return (
    <form onSubmit={send} className="panel px-7 py-8">
      <fieldset>
        <legend className="label mb-3">What kind of thing?</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((option) => (
            <label
              key={option}
              title={LABEL[option].hint}
              className={`cursor-pointer rounded-sm px-4 py-2 text-[13px] transition-colors duration-200 ease-out ${
                kind === option
                  ? "bg-accent text-white"
                  : "bg-room-sunk text-room-muted hover:text-room-ink"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
                className="sr-only"
              />
              {LABEL[option].name}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-room-faint">{LABEL[kind].hint}</p>
      </fieldset>

      <div className="mt-7">
        <label htmlFor="feedback-message" className="label mb-2 block">
          What happened?
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, MAX_MESSAGE))}
          rows={6}
          required
          placeholder={
            kind === "bug"
              ? "What you did, and what it did instead. Screenshots aren't possible here, but the more specific the better."
              : "As much or as little as you like."
          }
          className="field w-full resize-y"
        />
        <p className="mt-2 text-xs text-room-faint">
          {left < 200 ? `${left} characters left.` : "No account needed. Nothing else is required."}
        </p>
      </div>

      <div className="mt-6">
        <label htmlFor="feedback-contact" className="label mb-2 block">
          Email, if you want a reply
        </label>
        <input
          id="feedback-contact"
          type="email"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="Optional"
          className="field w-full max-w-[22rem]"
        />
      </div>

      {from && (
        <p className="mt-5 text-xs text-room-faint">
          Sending along the page you came from ({from}), so we know where to look.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-5 text-[13px] text-room-ink">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy || !message.trim()} className="btn-primary mt-7">
        {busy ? "Sending…" : "Send it"}
      </button>
    </form>
  );
}
