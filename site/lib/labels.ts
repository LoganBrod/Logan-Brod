// The labels worth naming in a search.
//
// eBay and Google Shopping both match on the text of a title, and a title is
// written by whoever is selling the thing. "Waxed cotton field jacket olive"
// competes with every listing that happens to contain those four words;
// "Barbour Bedale olive" returns the garment, because that is how the person
// selling it wrote it down and how the person looking for it types.
//
// Our searches were almost entirely adjectives, which is the main reason the
// results read as generic. This is the vocabulary that fixes it: a register,
// and the labels that actually populate it secondhand.
//
// Two things this is not.
//
// It is not a promise to show anybody these brands. The judge still decides on
// the photograph, and a search naming Filson that turns up a bad Filson jacket
// loses to a good unbranded one. It is a way of finding better stock, not a
// list of what the closet must contain.
//
// And it is not the wearer's own list. Brands somebody types into the quiz are
// capped at two queries (see `limitNamedMakers`) precisely so their answer is
// read as a hint about register rather than a blueprint. These are ours, and
// they are editorial: a starting vocabulary to be tuned against the query
// report once there is one, rather than a fact about menswear.

export interface Register {
  /** The word the reader uses for this register, matching the aesthetics it writes. */
  name: string;
  /** Labels that populate it secondhand, best-known first. */
  labels: string[];
}

export const REGISTERS: Register[] = [
  {
    name: "workwear",
    labels: ["Carhartt", "Dickies", "Filson", "Pointer Brand", "Stan Ray", "Red Wing", "Wrangler"],
  },
  {
    name: "ivy / prep",
    labels: ["J. Press", "Brooks Brothers", "Gitman Vintage", "Lands' End", "L.L.Bean", "Bass Weejuns", "Alden"],
  },
  {
    name: "country / heritage",
    labels: ["Barbour", "Belstaff", "Harris Tweed", "Aran", "Fair Isle", "Clarks", "Loake"],
  },
  {
    name: "outdoors / technical",
    labels: ["Patagonia", "Arc'teryx", "The North Face", "Snow Peak", "Salomon", "Merrell"],
  },
  {
    name: "minimal / modern",
    labels: ["Norse Projects", "A.P.C.", "COS", "Sunspel", "Uniqlo U", "Common Projects", "Our Legacy"],
  },
  {
    name: "denim / americana",
    labels: ["Levi's", "Lee", "Iron Heart", "3sixteen", "Naked & Famous", "Big John"],
  },
  {
    name: "tailoring",
    labels: ["Drake's", "Suitsupply", "Boglioli", "Spier & Mackay", "Ring Jacket"],
  },
  {
    name: "street",
    labels: ["Stone Island", "Stüssy", "Nike", "Adidas Originals", "New Balance", "Carhartt WIP"],
  },
];

/**
 * The vocabulary as the reader is given it.
 *
 * One line per register, because a nested structure in a prompt gets read as
 * an outline to be filled in rather than as a list to choose from.
 */
export function renderLabels(): string {
  return REGISTERS.map((r) => `- ${r.name}: ${r.labels.join(", ")}`).join("\n");
}
