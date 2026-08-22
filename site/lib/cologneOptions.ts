// The choices on the colognes page, and where to send someone to buy.
//
// Separate from `lib/colognes.ts` for the same reason lib/accessoryKinds.ts is
// separate from lib/accessories.ts: the picker is a client component and that
// module imports the Anthropic SDK, which must never reach the browser bundle.

export const OCCASION_SLOTS = [
  { value: "everyday", label: "Everyday", hint: "Work, lectures, the shop." },
  { value: "evening", label: "Evenings", hint: "Dinner, drinks, being close to people." },
  { value: "warm", label: "Warm weather", hint: "Something that doesn't turn heavy." },
  { value: "cold", label: "Cold weather", hint: "Something with some weight to it." },
] as const;

export type CologneSlot = (typeof OCCASION_SLOTS)[number]["value"];

export function isCologneSlot(raw: unknown): raw is CologneSlot {
  return typeof raw === "string" && OCCASION_SLOTS.some((s) => s.value === raw);
}

export const BUDGETS = [
  { value: "under-50", label: "Under $50", hint: "Including the good cheap ones." },
  { value: "50-120", label: "$50 – $120", hint: "Where most of the range lives." },
  { value: "over-120", label: "$120+", hint: "Designer and niche." },
] as const;

export type CologneBudget = (typeof BUDGETS)[number]["value"];

export function isCologneBudget(raw: unknown): raw is CologneBudget {
  return typeof raw === "string" && BUDGETS.some((b) => b.value === raw);
}

/**
 * Where to send someone to buy a named fragrance.
 *
 * A search at a retailer rather than a product link: product URLs rot, and a
 * guessed one is a 404 with our name on it. A search that lands on the right
 * page is worth more than a direct link that used to be right.
 */
export function buyLinks(pick: { house: string; name: string }): { label: string; url: string }[] {
  const query = encodeURIComponent(`${pick.house} ${pick.name}`);
  return [
    { label: "Sephora", url: `https://www.sephora.com/search?keyword=${query}` },
    { label: "FragranceX", url: `https://www.fragrancex.com/search/search_results?q=${query}` },
    { label: "Notino", url: `https://www.notino.com/search/?q=${query}` },
  ];
}
