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
  heading: "TODO — what LevoZ is, in one heading",
  body: "TODO — two or three sentences about the company.",
  /** The live Closet app. Replace with the real URL when it's deployed. */
  appUrl: "TODO",
  appLabel: "Open the closet",
  contactLabel: "Get in touch",
  contactHref: "mailto:levoz.labs@gmail.com",
};

export const legal = `© ${new Date().getFullYear()} ${company}`;
