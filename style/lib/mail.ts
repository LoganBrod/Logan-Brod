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
    "Here's your link to sign in to Closet.",
    "",
    url,
    "",
    "It works once and expires in 15 minutes.",
    "If you didn't ask for this, you can ignore it — nothing has changed.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:32px;background:#EDEAE4;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1B1A17">
  <div style="max-width:32rem;margin:0 auto;background:#F7F5F1;border:1px solid #D6D1C7;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#9A948B">Closet</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.6">Here&rsquo;s your link to sign in.</p>
    <p style="margin:0 0 28px">
      <a href="${url}" style="display:inline-block;background:#1B1A17;color:#EDEAE4;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600">Sign in</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6F6A62">It works once and expires in 15 minutes.</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#6F6A62">If you didn&rsquo;t ask for this, ignore it &mdash; nothing has changed.</p>
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
      subject: "Your link to sign in to Closet",
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
