// Sending the sign-in link.
//
// One provider, reached over its REST API rather than through an SDK — this
// sends exactly one kind of message and doesn't need a dependency to do it.
// Swapping to Postmark, SES, or anything else means rewriting `send` and
// nothing else; no caller knows which provider is in use.
//
// Unconfigured, this returns `logged` and prints the link to the server
// console instead. That's what makes accounts developable without an email
// provider at all: run the app, type an address, and the link is in the
// terminal. It is deliberately loud about only doing that outside production.

const ENDPOINT = "https://api.resend.com/emails";

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export type Delivery = "sent" | "logged";

/**
 * The message itself. Plain text as well as HTML, because a sign-in link that
 * only renders in a rich client is a sign-in link that fails for some people.
 */
function body(url: string): { html: string; text: string } {
  const text = [
    "Here's your link to sign in to Clozet.",
    "",
    url,
    "",
    "It works once and expires in 15 minutes.",
    "If you didn't ask for this, you can ignore it — nothing has changed.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:32px;background:#DEDFE4;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#111113">
  <div style="max-width:32rem;margin:0 auto;background:#E9EAEE;border:1px solid #C9CAD1;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#7E7F87">Clozet</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.6">Here&rsquo;s your link to sign in.</p>
    <p style="margin:0 0 28px">
      <a href="${url}" style="display:inline-block;background:#111113;color:#DEDFE4;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600">Sign in</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#55565C">It works once and expires in 15 minutes.</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#55565C">If you didn&rsquo;t ask for this, ignore it - nothing has changed.</p>
  </div>
</body></html>`;

  return { html, text };
}

/**
 * Send the link, or fall back to printing it.
 *
 * Throws on a provider error rather than returning quietly: someone waiting on
 * an email that will never arrive is worse served by a cheerful response than
 * by being told it didn't send.
 */
export async function sendLoginLink(email: string, url: string): Promise<Delivery> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Email isn't configured, so sign-in links can't be sent. Set RESEND_API_KEY and MAIL_FROM."
      );
    }
    // Development only, and the one place a live sign-in link is ever printed.
    console.log(`\n[mail] sign-in link for ${email}:\n${url}\n`);
    return "logged";
  }

  const { html, text } = body(url);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [email],
      subject: "Your link to sign in to Clozet",
      html,
      text,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Couldn't send the sign-in email (${res.status}). ${detail.slice(0, 200)}`);
  }

  return "sent";
}

/**
 * The email a watch sends when it finds something.
 *
 * Every piece carries the same one-line reason the app writes on screen. That
 * line is the whole difference between this and a keyword alert: it says why
 * *this* piece, for *this* person, which is the only thing that makes an
 * unprompted email welcome rather than noise.
 */
export function digestBody(
  watchName: string,
  items: Array<{
    title: string;
    price: number;
    url: string;
    whyItFits: string;
    condition?: string;
    /**
     * What this person was already told about how the brand sizes, when the
     * piece is from a brand they've looked up. This is the whole point of the
     * sizing feature being remembered rather than answered once: the moment it
     * is worth knowing that Barbour runs small is the moment a Barbour turns up.
     */
    fitNote?: string;
  }>
): { html: string; text: string; subject: string } {
  const one = items.length === 1;
  const subject = one
    ? `A piece for "${watchName}"`
    : `${items.length} pieces for "${watchName}"`;

  const text = [
    one ? "Something turned up:" : "A few things turned up:",
    "",
    ...items.flatMap((item) => [
      `${item.title} — $${item.price.toFixed(2)}${item.condition ? ` (${item.condition})` : ""}`,
      item.whyItFits,
      ...(item.fitNote ? [`Sizing — ${item.fitNote}`] : []),
      item.url,
      "",
    ]),
    "These are live listings and secondhand stock moves fast.",
  ].join("\n");

  const rows = items
    .map(
      (item) => `
    <tr><td style="padding:0 0 22px">
      <p style="margin:0 0 4px;font-size:15px;font-weight:600;line-height:1.4;color:#111113">${escapeHtml(item.title)}</p>
      <p style="margin:0 0 6px;font-size:13px;color:#55565C">$${item.price.toFixed(2)}${
        item.condition ? ` &middot; ${escapeHtml(item.condition)}` : ""
      }</p>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#111113">${escapeHtml(item.whyItFits)}</p>${
        item.fitNote
          ? `
      <p style="margin:0 0 10px;padding:8px 12px;background:#DEDFE4;border-radius:8px;font-size:13px;line-height:1.5;color:#55565C">Sizing - ${escapeHtml(item.fitNote)}</p>`
          : ""
      }
      <a href="${item.url}" style="font-size:13px;font-weight:600;color:#1F6B47">View the listing &rarr;</a>
    </td></tr>`
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:32px;background:#DEDFE4;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:34rem;margin:0 auto;background:#E9EAEE;border:1px solid #C9CAD1;border-radius:16px;padding:32px">
    <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#7E7F87">${escapeHtml(watchName)}</p>
    <p style="margin:0 0 26px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;letter-spacing:-0.02em;line-height:1.3;color:#111113">${
      one ? "Something turned up." : "A few things turned up."
    }</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="margin:22px 0 0;padding-top:18px;border-top:1px solid #C9CAD1;font-size:12px;line-height:1.6;color:#7E7F87">
      These are live listings and secondhand stock moves fast. Stop this scan any time from your Scan page.
    </p>
  </div>
</body></html>`;

  return { html, text, subject };
}

/** Titles come from sellers, so they go through this before they go in a page. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Send one watch's findings. Throws if the provider refuses — the caller decides what that means. */
export async function sendDigest(
  email: string,
  watchName: string,
  items: Parameters<typeof digestBody>[1]
): Promise<Delivery> {
  const { html, text, subject } = digestBody(watchName, items);

  if (!mailConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email isn't configured, so watch digests can't be sent.");
    }
    console.log(`\n[mail] digest for ${email} — ${subject}\n${text}\n`);
    return "logged";
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [email], subject, html, text }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Couldn't send the digest (${res.status}). ${detail.slice(0, 200)}`);
  }
  return "sent";
}
