// The deck when there is no deck.
//
// The quiz is the first screen a new visitor sees and it is not optional, so
// "No pieces came back. Try again in a moment." is the worst sentence in the
// app: it is the product failing before it has done anything, at the one
// moment somebody is deciding whether to bother. It happens whenever the
// shared pool is empty - a cold cache with no marketplace key configured, a
// dead upstream, a first deploy.
//
// So there is always a deck. These are the app's own garment photographs, in
// the colours `scripts/recolour-garments.py` dyes them, with titles that
// describe what is actually in the picture. Nothing here claims to be a
// listing, because nothing here is one: the quiz asks whether you would wear
// something, and that question does not need a seller.
//
// It is narrower than the real pool, and honestly so. Four garment shapes
// cannot separate tailoring from streetwear the way fifteen different
// searches can; what they can do is establish colour and register-of-cloth,
// which is more than a broken screen establishes.

import type { ProductListing } from "./sources/types";

interface Card extends ProductListing {
  slot: string;
  register: string | null;
}

/** One shape, in the colours it exists in. */
const GARMENTS = [
  {
    file: "garment-jacket",
    noun: "cotton chore jacket",
    slot: "outerwear",
    register: "workwear",
    colours: ["olive", "plum", "teal", "navy", "ochre"],
  },
  {
    file: "garment-shirt",
    noun: "cotton overshirt",
    slot: "tops",
    register: "workwear",
    colours: ["olive", "rust", "cobalt", "sand", "forest"],
  },
  {
    file: "garment-knit",
    noun: "wool crewneck",
    slot: "tops",
    register: "minimal",
    colours: ["oatmeal", "amber", "moss", "rose", "slate"],
  },
  {
    file: "garment-pants",
    noun: "wool trousers",
    slot: "bottoms",
    register: "tailoring",
    colours: ["grey", "clay", "indigo", "olive", "burgundy"],
  },
] as const;

/**
 * The first colour of each garment is the photograph as it was taken; the rest
 * are dyed from it, and the file is named for the colour. Written this way so
 * a new colour is one string in the list above and one run of the script.
 */
export const FALLBACK_DECK: Card[] = GARMENTS.flatMap((garment) =>
  garment.colours.map((colour, index) => ({
    id: `local:${garment.file}-${colour}`,
    source: "ebay" as const,
    title: `${colour[0].toUpperCase()}${colour.slice(1)} ${garment.noun}`,
    price: 0,
    currency: "USD",
    // Nothing to link to: these are not for sale and the card has no link on
    // it. The field is required by the shape every other card has.
    url: "/closet",
    imageUrl: `/garments-sm/${garment.file}${index === 0 ? "" : `-${colour}`}.webp`,
    matchedQuery: `${colour} ${garment.noun}`,
    slot: garment.slot,
    register: garment.register,
  }))
);
