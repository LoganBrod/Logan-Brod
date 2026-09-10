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

/**
 * The opening screen: one line, one sentence under it, one button.
 *
 * The corridor walk used to open the page. It is a good film and a poor
 * front door - a visitor had to scroll through it to learn what the thing
 * was for. The front door now says it in one line and hands over a button;
 * the walk follows for whoever wants the feeling of it.
 */
export const hero = {
  line: "Create a personalized clozet in minutes.",
  sub: "Show it a few pieces you like. It finds real ones that belong with them, new or secondhand, in your size and your budget.",
  cta: "Get started",
  /** Straight to the two-minute quiz, whether or not this browser has seen it. */
  href: "/closet?quiz=1",
  note: "Free to try. No account needed.",
};

/** The line on the first frame of the walk, now the second act. Under 8 words. */
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
    body: "Upload photos of clothes you own or want. It reads the style across them - palette, silhouette, fabric - then searches real listings and keeps only what fits the way you actually dress.",
    pieces: ["/garment-shirt.webp", "/garment-jacket.webp"],
    pieceNames: ["An olive shirt on the rail", "A chore jacket on the rail"],
  },
  {
    label: "What you get back",
    heading: "Only what actually fits.",
    body: "Real pieces in your price range and your size, each with a line on why it suits you. Say yes or no to anything - the next run listens.",
    pieces: ["/garment-pants.webp", "/garment-knit.webp"],
    pieceNames: ["Grey wool trousers on the rail", "An oatmeal sweater on the rail"],
  },
];

/**
 * The close, below the walk.
 *
 * It used to open with "We build one thing, properly." and a paragraph about
 * the company. Both are gone: by the time anybody reaches the foot of this
 * page they have been told what the thing does four times over, and a fifth
 * telling standing between them and the button is a page arguing with itself.
 * What is left is the mark, the way in, and the way to reach us.
 */
export const siteSection = {
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
export const legal = `${company} - ${new Date().getFullYear()}`;

/**
 * Labels to tap in the onboarding quiz.
 *
 * These were printed on the homepage under a caption saying there is no
 * arrangement with any of them; both are gone from there. Here they are a
 * question rather than a claim - "which of these do you like" implies nothing
 * about who stocks what - and they are the fastest way for somebody to say
 * what register they dress at without typing.
 */
export const brandChoices = [
  "Barbour", "Carhartt", "Levi's", "Patagonia", "Ralph Lauren", "Uniqlo",
  "J.Crew", "Filson", "Clarks", "Dr. Martens", "Arc'teryx", "Stone Island",
  "APC", "Norse Projects", "Sunspel", "Red Wing",
] as const;

// ----------------------------------------------------------------- the proof

/**
 * The middle of the page: one claim, three figures, three cards.
 *
 * This replaced four full-screen beats and two macro photographs of cloth.
 * The beats were true and well written and nobody read them: a visitor who
 * has not yet used the thing will not scroll through twelve hundred words to
 * find out whether they want to, and the photographs were texture rather than
 * evidence. What survives is the part a reader can check - the arithmetic of
 * a run - and three short answers to the three questions that follow it.
 */
export const proof = {
  heading: "Picking the clothes for you.",
  body: "You never type a keyword. It reads the photographs you upload, writes its own searches, and judges everything they turn up as a picture rather than as a title.",
  /** Labels under the figures. The figures themselves come from the constants that govern a run. */
  stats: {
    seen: "looked at, every run",
    picks: "come back, at most",
    keywords: "keywords you type",
  },
  cards: [
    {
      title: "Finding the size for you",
      body: "Five measurements, given once, and anything you could not wear is gone before you see it. Unsure of a maker, ask: the tools read that brand's own size chart and what buyers report, then name the size to buy.",
    },
    {
      title: "Always learning",
      body: "Every yes and no is remembered. The next run is weighed against what you kept and what you turned down, so it reads you better each time you use it.",
    },
    {
      title: "We complete the fit",
      body: "Once the clothes are right it finds the accessories and the cologne that sit at the same register, and the whole fit is kept together under one code.",
    },
  ],
} as const;

/**
 * Where the pieces actually come from.
 *
 * Worth being exact about: these are the two marketplaces searched, not
 * partners, sponsors or a stockroom. Nothing here is an affiliate arrangement
 * and no brand has any relationship with this company.
 *
 * Sixteen label names used to be listed here under a caption explaining that
 * there was no arrangement with any of them. Both are gone together, which is
 * the only honest way to remove either: the caption existed because the list
 * did, and a homepage that names no brands implies no relationship to deny.
 */
export const sources = {
  heading: "Everything here is somebody else's listing.",
  body: "Clozet holds no stock and sells nothing. It searches marketplaces and the brands' own shops, judges what comes back, and sends you to whoever is selling it - the same listing you would have found yourself, if you had the afternoon. Secondhand, new, or both, and that is your choice rather than ours.",
  markets: [
    { name: "eBay", note: "Live listings, worn and new, searched through their own API." },
    { name: "Google Shopping", note: "Mainstream retail, for the pieces that are still made." },
    { name: "The brands themselves", note: "Read from each shop's own catalogue, straight from the people who make it." },
  ],
} as const;
