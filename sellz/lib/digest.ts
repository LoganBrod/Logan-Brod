import { emailShell, escapeHtml, sendEmail } from "./email";
import { prisma } from "./prisma";
import type { ProposalKind } from "./store";

/**
 * The nightly "here's what changed while you slept" email.
 *
 * Only sent for changes that were applied automatically. A proposal still
 * waiting in the queue is visible next time the seller opens the app; a
 * change already live on eBay is not, and that is the one they need told
 * about — it happened to their listings without them present.
 */

export interface DigestChange {
  kind: ProposalKind;
  listingTitle: string;
  /** Set for reprices and relists that moved the price. */
  oldPrice?: number;
  newPrice?: number;
  /** Set for retitles and rewrites. */
  newTitle?: string;
}

const VERB: Record<ProposalKind, string> = {
  reprice: "Repriced",
  retitle: "Retitled",
  rewrite: "Rewrote",
  relist: "Relisted",
  hold: "Held",
};

function money(n: number): string {
  return `$${n.toFixed(2).replace(/\.00$/, "")}`;
}

/** One human-readable line per change, shared by the HTML and text bodies. */
function describe(c: DigestChange): string {
  const title = c.listingTitle.length > 60 ? `${c.listingTitle.slice(0, 57)}…` : c.listingTitle;
  const priceMoved =
    c.oldPrice !== undefined && c.newPrice !== undefined && c.oldPrice !== c.newPrice;
  const detail = priceMoved
    ? ` — ${money(c.oldPrice!)} → ${money(c.newPrice!)}`
    : c.newTitle
      ? ` — now "${c.newTitle.length > 50 ? `${c.newTitle.slice(0, 47)}…` : c.newTitle}"`
      : "";
  return `${VERB[c.kind]}: ${title}${detail}`;
}

/**
 * Net change in asking price across everything repriced.
 *
 * Reported as a plain sum of price movements, not as forecast earnings. Most
 * automatic reprices are cuts made to convert a stalled listing, so a negative
 * number here is the system working, and dressing it up as "projected revenue"
 * would be telling the seller something we do not know.
 */
function netPriceChange(changes: DigestChange[]): number {
  return changes.reduce((sum, c) => {
    if (c.oldPrice === undefined || c.newPrice === undefined) return sum;
    return sum + (c.newPrice - c.oldPrice);
  }, 0);
}

const NOUN: Record<ProposalKind, string> = {
  reprice: "repriced",
  retitle: "retitled",
  rewrite: "rewritten",
  relist: "relisted",
  hold: "held",
};

export function summaryLine(changes: DigestChange[]): string {
  const counts = {} as Record<ProposalKind, number>;
  for (const c of changes) counts[c.kind] = (counts[c.kind] ?? 0) + 1;

  const parts = (Object.keys(NOUN) as ProposalKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => {
      const n = counts[kind];
      return `${n} listing${n === 1 ? "" : "s"} ${NOUN[kind]}`;
    });

  const net = netPriceChange(changes);
  const netPart =
    net === 0 ? "" : `, ${net > 0 ? "+" : "−"}${money(Math.abs(net))} net asking price`;

  return `${parts.join(", ")}${netPart}.`;
}

export function buildDigest(changes: DigestChange[], appUrl: string) {
  const subject = `LevoZ: ${changes.length} listing${changes.length === 1 ? "" : "s"} updated overnight`;

  const items = changes
    .map(
      (c) =>
        `<li style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#d4d4d8">${escapeHtml(describe(c))}</li>`
    )
    .join("");

  const html = emailShell(
    "Last night's changes",
    `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#a1a1aa">${escapeHtml(summaryLine(changes))}</p>
     <ul style="margin:0;padding:0 0 0 18px">${items}</ul>
     <p style="margin:24px 0 0"><a href="${escapeHtml(appUrl)}/listings" style="display:inline-block;background:#c8ff4d;color:#0b0b0d;font-weight:700;font-size:14px;text-decoration:none;padding:11px 18px;border-radius:10px">Review your listings</a></p>`,
    `These changes are already live on eBay. Turn this off under Settings if you'd rather not hear about them.`
  );

  const text = [
    "Last night's changes",
    "",
    summaryLine(changes),
    "",
    ...changes.map((c) => `- ${describe(c)}`),
    "",
    `Review your listings: ${appUrl}/listings`,
    "",
    "These changes are already live on eBay.",
  ].join("\n");

  return { subject, html, text };
}

/**
 * Send one seller their digest. Returns false when there was nothing to say,
 * email isn't configured, the seller opted out, or the send failed — the
 * caller treats all of those the same way, as "no email went out".
 */
export async function sendDigest(
  userId: string,
  changes: DigestChange[],
  appUrl: string
): Promise<boolean> {
  if (changes.length === 0) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) return false;

  const { subject, html, text } = buildDigest(changes, appUrl);
  return sendEmail({ to: user.email, subject, html, text });
}
