import { NextRequest, NextResponse } from "next/server";
import { ingestSaleEmail, userForInboundToken } from "@/lib/inboundEmail";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Inbound webhook for forwarded marketplace mail.
 *
 * The seller sets one filter in their mail client — anything from depop.com
 * forwards to sale-<token>@<inbound domain> — and their provider POSTs the
 * parsed message here.
 *
 * Provider-agnostic on purpose. SendGrid, Mailgun, Postmark, CloudMailin and
 * Resend all post roughly the same fields under different names, and being
 * tied to one of them is a bad trade for a feature whose whole job is to
 * survive other people's format changes.
 */

/** Pull the first present value from a set of candidate field names. */
function field(body: Record<string, unknown>, ...names: string[]): string {
  for (const n of names) {
    const v = body[n];
    if (typeof v === "string" && v.trim()) return v;
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

export async function POST(req: NextRequest) {
  // A shared secret configured in the provider's webhook settings. Without it
  // anyone who found this URL could post sales into any account whose
  // forwarding address they knew.
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Inbound email not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
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

  const to = field(body, "to", "To", "recipient", "envelope_to");
  const from = field(body, "from", "From", "sender");
  const subject = field(body, "subject", "Subject");
  const text = field(body, "text", "plain", "body-plain", "TextBody", "stripped-text");
  const html = field(body, "html", "HtmlBody", "body-html");

  const token = tokenFromRecipient(to);
  const userId = await userForInboundToken(token);
  if (!userId) {
    // 200 rather than 404: providers retry non-2xx, and mail to a retired
    // address would otherwise be redelivered indefinitely.
    return NextResponse.json({ ok: true, ignored: "unknown recipient" });
  }

  // Prefer the plain-text part; fall back to stripping tags off the HTML one,
  // since some forwards carry only HTML.
  const content = text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (!content.trim()) {
    return NextResponse.json({ ok: true, ignored: "empty message" });
  }

  try {
    const result = await ingestSaleEmail(
      userId,
      subject,
      content,
      looksLikeMarketplace(from, content)
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not process the message" },
      { status: 500 }
    );
  }
}
