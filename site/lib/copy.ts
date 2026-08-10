// Every word the site says lives here.
//
// The build brief is explicit: write nothing about LevoZ Labs that isn't given.
// Anything still marked TODO renders as a visible placeholder rather than an
// invented claim — so an unfilled bay looks unfinished on screen, which is the
// point. Replace the strings; touch nothing else.

export type Bay = {
  /** Small caps label above the heading. */
  label: string;
  heading: string;
  /** Two sentences. Kept as one string so the writing stays in one place. */
  body: string;
};

export const TODO = "TODO";

export function isTodo(value: string): boolean {
  return value.trim().startsWith(TODO);
}

export const company = "LevoZ Labs";

/** The only text on the opening screen. Under 8 words. */
export const heroLine = "TODO — the hero line, under 8 words";

export const bays: Bay[] = [
  {
    label: "TODO — label",
    heading: "TODO — bay 1 heading",
    body: "TODO — two sentences for bay one.",
  },
  {
    label: "TODO — label",
    heading: "TODO — bay 2 heading",
    body: "TODO — two sentences for bay two.",
  },
  {
    label: "TODO — label",
    heading: "TODO — bay 3 heading",
    body: "TODO — two sentences for bay three.",
  },
  {
    label: "TODO — label",
    heading: "TODO — bay 4 heading",
    body: "TODO — two sentences for bay four.",
  },
];

export const closing = {
  heading: "TODO — closing heading",
  sentence: "TODO — one closing sentence.",
  actionLabel: "Get in touch",
  actionHref: "mailto:levoz.labs@gmail.com",
};

export const legal = `© ${new Date().getFullYear()} ${company}`;
