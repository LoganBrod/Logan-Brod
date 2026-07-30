/**
 * Outbound email, via Resend's REST API.
 *
 * Called over plain `fetch` rather than through Resend's SDK: the whole
 * surface used here is one POST, and a dependency that ships its own HTTP
 * stack is not worth carrying for that.
 *
 * Every send is best-effort. Nothing the app does on a seller's behalf should
 * fail because a notification could not go out — the digest reports work that
 * has already happened, so a bounced email costs a message, not a listing.
 */

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Returns true if the provider accepted the message. Never throws. */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  if (!emailConfigured()) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
      // A scheduled job should not hang on a slow provider; the digest is not
      // worth holding the rest of the sweep for.
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Wrap digest content in a minimal HTML shell.
 *
 * Deliberately table-free, inline-styled and narrow: email clients strip
 * stylesheets and disagree about everything else, and a plain document
 * renders the same in all of them. The plain-text alternative is built by the
 * caller rather than derived from this, so it reads as prose instead of as
 * stripped markup.
 */
export function emailShell(heading: string, bodyHtml: string, footer?: string): string {
  return `<div style="margin:0;padding:24px;background:#0b0b0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#141417;border:1px solid #26262b;border-radius:16px;padding:28px">
    <div style="font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8b8b95">LevoZ</div>
    <h1 style="margin:12px 0 20px;font-size:21px;line-height:1.3;color:#f4f4f5;font-weight:700">${escapeHtml(heading)}</h1>
    ${bodyHtml}
    ${
      footer
        ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #26262b;font-size:12px;line-height:1.6;color:#6b6b75">${footer}</p>`
        : ""
    }
  </div>
</div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
