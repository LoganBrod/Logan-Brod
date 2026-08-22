// What kinds of accessory can be asked for.
//
// Separate from `lib/accessories.ts` because the picker is a client component
// and that module imports the Anthropic SDK. Importing it from the browser
// pulls the whole SDK — and `node:path` with it — into the client bundle, which
// fails the build outright. Same reasoning as the note on MAX_VIEWED in
// lib/batching.ts.

export const ACCESSORY_KINDS = [
  { value: "belts", label: "Belts", hint: "Leather, woven, work." },
  { value: "bags", label: "Bags", hint: "Totes, holdalls, satchels." },
  { value: "caps", label: "Caps & hats", hint: "Ball caps, beanies, brims." },
  { value: "scarves", label: "Scarves", hint: "Wool, silk, gauze." },
  { value: "jewellery", label: "Jewellery", hint: "Chains, rings, cuffs." },
  { value: "watches", label: "Watches", hint: "Straps and dials, not investments." },
  { value: "eyewear", label: "Eyewear", hint: "Sun and optical frames." },
  { value: "gloves", label: "Gloves", hint: "Leather, knit, lined." },
] as const;

export type AccessoryKind = (typeof ACCESSORY_KINDS)[number]["value"];

export function isAccessoryKind(raw: unknown): raw is AccessoryKind {
  return typeof raw === "string" && ACCESSORY_KINDS.some((k) => k.value === raw);
}

/** Enough to fill a page without fanning out over the whole marketplace. */
export const MAX_KINDS = 4;
