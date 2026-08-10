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
export const heroLine = "TODO — the hero line, under 8 words";

/**
 * The garments hanging on the end wall. Each one carries a piece of writing;
 * hovering (or tapping, or focusing) a garment presents it.
 * Draft text below describes the Closet app the way its own README does —
 * rewrite freely.
 */
export type Garment = {
  /** Cut-out image in /public, hung from the rail. */
  image: string;
  /** Accessible name for the garment itself. */
  name: string;
  label: string;
  heading: string;
  body: string;
};

export const garments: Garment[] = [
  {
    image: "/garment-shirt.webp",
    name: "A shirt on the rail",
    label: "How it works",
    heading: "Show it a few pieces you like.",
    body: "Upload photos of clothes you own or want. The closet reads the style across them — palette, silhouette, fabric — then searches real listings and keeps only what fits the way you actually dress.",
  },
  {
    image: "/garment-pants.webp",
    name: "A pair of trousers on the rail",
    label: "What you get back",
    heading: "A closet that fills itself.",
    body: "Real pieces in your price range and your size, each with a line on why it suits you. Say yes or no to anything — the next run listens.",
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
