// Every word the site says lives here.
//
// The build brief is explicit: write nothing about LevoZ Labs that isn't given.
// Product descriptions below are drawn from the Closet app's own README in
// style/ — factual mechanics, not marketing claims. Anything marked TODO
// renders as a visible placeholder; replace the strings, touch nothing else.

export const TODO = "TODO";

export function isTodo(value: string): boolean {
  return value.trim().startsWith(TODO);
}

export const company = "LevoZ Labs";

/** The only text on the opening screen. Under 8 words. */
export const heroLine = "You already know what you like.";

/**
 * The two stops on the corridor walk. At each stop the camera rests, pieces
 * hang from the corridor rails, and the writing appears between them.
 * Draft text describes the Closet app the way its own README does — rewrite
 * freely.
 */
export type Stop = {
  label: string;
  heading: string;
  body: string;
  /** Cut-out images in /public: [left rail, right rail]. */
  pieces: [string, string];
  /** Accessible names for the pieces, same order. */
  pieceNames: [string, string];
};

export const stops: Stop[] = [
  {
    label: "How it works",
    heading: "Show it a few pieces you like.",
    body: "Upload photos of clothes you own or want. It reads the style across them — palette, silhouette, fabric — then searches real listings and keeps only what fits the way you actually dress.",
    pieces: ["/garment-shirt.webp", "/garment-jacket.webp"],
    pieceNames: ["An olive shirt on the rail", "A chore jacket on the rail"],
  },
  {
    label: "What you get back",
    heading: "Only what actually fits.",
    body: "Real pieces in your price range and your size, each with a line on why it suits you. Say yes or no to anything — the next run listens.",
    pieces: ["/garment-pants.webp", "/garment-knit.webp"],
    pieceNames: ["Grey wool trousers on the rail", "An oatmeal sweater on the rail"],
  },
];

/** The section below the corridor — the actual website. */
export const siteSection = {
  // Written from what the product demonstrably does, and nothing else: no
  // claims about the company, its size, or its history that aren't true today.
  heading: "We build one thing, properly.",
  body: "LevoZ Labs makes Clozet — a menswear tool that reads the clothes you already like and finds real secondhand pieces that belong with them. Not a feed, not a marketplace, and not a search box with a bigger budget behind it. It looks at photographs the way a person would, tells you plainly when something isn't worth buying, and keeps looking after you've closed the tab.",
  /** The product, now served from this same app. */
  appUrl: "/closet",
  appLabel: "Open Clozet",
  contactLabel: "Get in touch",
  contactHref: "mailto:levoz.labs@gmail.com",
};

/**
 * The footer line.
 *
 * Deliberately not a copyright notice: the symbol adds nothing a reader wants,
 * and asserting a claim in the footer of a site that hasn't launched is the
 * kind of boilerplate that makes a small company read as a template.
 */
export const legal = `${company} — ${new Date().getFullYear()}`;

// ---------------------------------------------------------------- the story

/**
 * The scroll below the corridor.
 *
 * The walk shows what the thing feels like and says almost nothing about what
 * it does. These are the four beats that answer that, in the order someone
 * actually wants them: what happens to my photos, what comes back, where it
 * came from, what it costs me to try.
 */
export const beats = [
  {
    kicker: "It reads the photographs",
    heading: "Not the words under them.",
    body: "Upload a few pieces you like and it looks at them — palette, silhouette, cloth, how formal it all is — then writes its own searches. You never type a keyword, because the thing you like is rarely a thing you can name.",
  },
  {
    kicker: "It judges on the picture",
    heading: "The way you would in a shop.",
    body: "Ninety-six candidates are looked at as photographs, not as titles, and twenty-four come back. A seller who writes “vintage Barbour style” gets no credit for the word; a jacket that actually looks right does.",
  },
  {
    kicker: "It knows what fits",
    heading: "So you stop opening the wrong size.",
    body: "Give it five measurements once and anything you couldn't wear is gone before you see it. Name a brand you're unsure of and it reads that maker's own size chart and what buyers report, then tells you which size to buy.",
  },
  {
    kicker: "It keeps looking",
    heading: "Secondhand moves faster than you do.",
    body: "The right jacket in your size at your price is listed on a Tuesday and gone by Wednesday. A standing scan runs your searches twice a day and emails you only what clears the same bar — most days it finds nothing and says nothing.",
  },
] as const;

/**
 * Where the pieces actually come from.
 *
 * Worth being exact about: these are the two marketplaces searched, not
 * partners, sponsors or a stockroom. Nothing here is an affiliate arrangement
 * and no brand has any relationship with this company.
 */
export const sources = {
  heading: "Everything here is somebody else's listing.",
  body: "Clozet holds no stock and sells nothing. It searches two marketplaces, judges what comes back, and sends you to the seller — the same listing you would have found yourself, if you had the afternoon.",
  markets: [
    { name: "eBay", note: "Live secondhand listings, searched through their own API." },
    { name: "Google Shopping", note: "Mainstream retail, for the pieces that are still made." },
  ],
  /**
   * Labels that come up often in menswear searches. Deliberately introduced as
   * what turns up rather than what is stocked — there is no arrangement with
   * any of them, and implying one would be a lie a reader can't check.
   */
  labelsCaption: "Labels that tend to turn up. No arrangement with any of them — they're simply what secondhand menswear is made of.",
  labels: [
    "Barbour", "Carhartt", "Levi's", "Patagonia", "Ralph Lauren", "Uniqlo",
    "J.Crew", "Filson", "Clarks", "Dr. Martens", "Arc'teryx", "Stone Island",
    "APC", "Norse Projects", "Sunspel", "Red Wing",
  ],
} as const;
