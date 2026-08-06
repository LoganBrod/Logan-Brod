import { NextRequest, NextResponse } from "next/server";
import { ingestSaleEmail, userForInboundToken } from "@/lib/inboundEmail";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Inbound webhook for forwarded marketplace mail.
 *
 * The seller sets one filter in their mail client — anything from depop.com
 * forwards to sale-<token>@<inbound domain> — and their provider posts the
 * message here.
 *
 * Provider-agnostic on purpose, because the providers differ more than you
 * would expect. Two differences drive the shape of this file:
 *
 * 1. AUTH. Most inbound providers do not let you set a custom request header.
 *    SendGrid offers ECDSA signatures or OAuth; Resend signs with Svix. What
 *    every one of them supports is posting to a URL you choose, so the secret
 *    is accepted in the query string as well as in an Authorization header.
 *    The URL form is what will actually be used in practice.
 *
 * 2. BODY. Some providers post the full parsed email. Resend's email.received
 *    event carries metadata only — sender, recipient, subject — and the body
 *    has to be fetched afterwards by id. Both paths are handled below.
 */

/** Pull the first present value from a set of candidate field names. */
function field(body: Record<string, unknown>, ...names: string[]): string {
  for (const n of names) {
    const v = body[n];
    if (typeof v === "string" && v.trim()) return v;
    // Resend sends `to` as an array of addresses.
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) return v[0];
  }
  return "";
}

/**
 * The token identifying the seller, taken from the address the mail was sent
 * to: sale-<token>@domain, or <token>@domain.
 */
function tokenFromRecipient(to: string): string {
  const address = /<([^>]+)>/.exec(to)?.[1] ?? to;
  const local = address.split("@")[0]?.trim() ?? "";
  // Strip a leading label so both sale-abc123@ and abc123@ resolve.
  return local.replace(/^(sale|sold|in)[-+.]/i, "");
}

/**
 * Did this actually come from the marketplace?
 *
 * Forwarding rewrites the envelope sender to the seller's own address, so the
 * evidence is in the quoted original headers in the body. Best-effort by
 * nature — a false negative only means the sale waits for confirmation, which
 * is the safe direction.
 */
function looksLikeMarketplace(from: string, body: string): boolean {
  const haystack = `${from}\n${body.slice(0, 4000)}`.toLowerCase();
  return /(^|[\s<@.])(depop|ebay|vinted)\.com/.test(haystack);
}

/**
 * Fetch a Resend inbound message body by id.
 *
 * Resend's webhook is metadata-only, so without this a Resend-hosted setup
 * would only ever see the subject line. Returns "" on any failure rather than
 * throwing: a missing body degrades to a sale held for confirmation, which is
 * recoverable, where a thrown error makes the provider retry a message that
 * will fail identically every time.
 */
async function fetchResendBody(emailId: string): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !emailId) return "";
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.error(`[inbound] Resend body fetch failed: ${res.status}`);
      return "";
    }
    const data = (await res.json()) as Record<string, unknown>;
    const text = typeof data.text === "string" ? data.text : "";
    const html = typeof data.html === "string" ? data.html : "";
    return text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  } catch (err) {
    console.error("[inbound] Resend body fetch threw:", err);
    return "";
  }
}

/** Constant-time-ish compare, so the secret can't be probed byte by byte. */
function secretMatches(supplied: string, expected: string): boolean {
  if (supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < supplied.length; i++) {
    diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Inbound email not configured" }, { status: 503 });
  }

  // Header first, query string second. Providers that cannot set a header —
  // which is most of them — put it in the URL.
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const query = req.nextUrl.searchParams.get("key") ?? "";
  if (!secretMatches(header, secret) && !secretMatches(query, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await req.json().catch(() => ({}));
  } else {
    // SendGrid and Mailgun post multipart/form-data rather than JSON.
    const form = await req.formData().catch(() => null);
    body = form ? Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)])) : {};
  }

  // Resend nests everything under `data` and names the event in `type`.
  // Ignore its other event types outright — only received mail is a sale.
  const isResend = typeof body.type === "string" && body.data !== null && typeof body.data === "object";
  if (isResend && body.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: `event ${String(body.type)}` });
  }
  const payload = isResend ? (body.data as Record<string, unknown>) : body;

  const to = field(payload, "to", "To", "recipient", "envelope_to");
  const from = field(payload, "from", "From", "sender");
  const subject = field(payload, "subject", "Subject");
  const text = field(payload, "text", "plain", "body-plain", "TextBody", "stripped-text");
  const html = field(payload, "html", "HtmlBody", "body-html");

  const token = tokenFromRecipient(to);
  const userId = await userForInboundToken(token);
  if (!userId) {
    // 200 rather than 404: providers retry non-2xx, and mail to a retired
    // address would otherwise be redelivered indefinitely.
    return NextResponse.json({ ok: true, ignored: "unknown recipient" });
  }

  // Prefer the plain-text part, fall back to stripping the HTML one, and only
  // then go back to the provider for a body it didn't send.
  let content = text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (!content.trim() && isResend) {
    content = await fetchResendBody(field(payload, "email_id", "id"));
  }

  if (!content.trim() && !subject.trim()) {
    return NextResponse.json({ ok: true, ignored: "empty message" });
  }

  try {
    const result = await ingestSaleEmail(
      userId,
      subject,
      // With no body at all, the subject is the only evidence. It is enough to
      // recognise a sale, but not enough to trust a match, and ingest treats
      // an unverified message as needing confirmation.
      content || subject,
      Boolean(content) && looksLikeMarketplace(from, content)
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not process the message" },
      { status: 500 }
    );
  }
}
