// What someone actually owns.
//
// Until now the app inferred the gaps in a wardrobe from the six photos someone
// happened to upload — which is a guess about a wardrobe it has never seen. An
// inventory turns that into a fact, and every recommendation afterwards is
// better for it: it can stop suggesting a fourth navy crewneck, and it can say
// which single piece would unlock the most outfits from things already owned.
//
// Photographs are read once and then discarded. What's stored is the reading —
// a line of text per garment — not the image. That keeps this cheap, keeps it
// out of any storage service, and means the record is something a person could
// read and correct.

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODELS, anthropic, assertNotRefused, requireParsed } from "./anthropic";
import { imageSize, meter } from "./meter";
import { OutfitsSchema, WardrobeReadSchema, type Outfits, type OwnedItem } from "./schemas";
import { getJson, redisConfigured, setJson } from "./redis";
import type { InlineImage } from "./thumbnails";
import type { Owner } from "./library";

export interface OwnedGarment extends OwnedItem {
  id: string;
  addedAt: string;
}

function key(owner: Owner): string {
  return owner.kind === "user" ? `user:${owner.id}:owned` : `taste:${owner.id}:owned`;
}

export async function readOwned(owner: Owner | null): Promise<OwnedGarment[]> {
  if (!owner || !redisConfigured()) return [];
  try {
    const owned = await getJson<OwnedGarment[]>(key(owner));
    return Array.isArray(owned) ? owned : [];
  } catch {
    return [];
  }
}

export async function writeOwned(owner: Owner, items: OwnedGarment[]): Promise<void> {
  await setJson(key(owner), items);
}

export async function removeOwned(owner: Owner, id: string): Promise<boolean> {
  const owned = await readOwned(owner);
  if (!owned.some((item) => item.id === id)) return false;
  await writeOwned(owner, owned.filter((item) => item.id !== id));
  return true;
}

const READ_SYSTEM = `You are cataloguing the clothes one man already owns, from photographs of them.

Describe what is there. This is an inventory, not a review — no opinions, no suggestions, and no flattery. If a photo shows four garments, that is four entries; if it shows a room with two garments in it, that is two.

Ignore anything that isn't clothing or footwear: hangers, furniture, packaging, people.

Name a brand only when it is legible in the photograph. Never infer one from the look, because a wrong brand in an inventory is worse than no brand — everything downstream will trust it.

Judge season on weight and material rather than colour. A pale linen shirt is warm-weather; a pale wool coat is not.`;

/**
 * Read a batch of photos into garments.
 *
 * One call for the whole batch rather than one per photo: a person emptying a
 * wardrobe uploads six pictures at once, and the model is better at telling
 * duplicates apart when it can see them together.
 */
export async function readWardrobePhotos(images: InlineImage[]): Promise<OwnedItem[]> {
  if (!images.length) return [];

  const message = await anthropic().messages.parse({
    model: MODELS.wardrobeRead,
    max_tokens: 8000,
    system: READ_SYSTEM,
    output_config: { effort: "medium", format: zodOutputFormat(WardrobeReadSchema) },
    messages: [
      {
        role: "user",
        content: [
          ...images.map(
            (image) =>
              ({
                type: "image",
                source: {
                  type: "base64",
                  media_type: image.mediaType as "image/jpeg",
                  data: image.data,
                },
              }) as const
          ),
          {
            type: "text",
            text: `Catalogue every garment in ${
              images.length === 1 ? "this photo" : `these ${images.length} photos`
            }. One entry per distinct piece.`,
          },
        ],
      },
    ],
  });

  assertNotRefused(message, "wardrobe reading");

  meter({
    op: "wardrobe.read",
    model: MODELS.wardrobeRead,
    usage: message.usage,
    images: images.map((image) => imageSize(image.data)),
  });
  const read = requireParsed(message.parsed_output, "wardrobe reading");
  return read.items;
}

// ------------------------------------------------------------------ outfits

const OUTFIT_SYSTEM = `You are building outfits from the clothes one man already owns, and nothing else.

Every piece you use must be in the numbered list. Refer to pieces by their index. Never invent a garment, never assume he owns something basic that isn't listed — if there are no plain white shirts in the list, he does not have one.

An outfit is a real combination someone would wear out of the house on a particular kind of day, not a styling exercise. Say where it goes.

Then name the single garment he does not own that would unlock the most further outfits from what he does. Judge that by counting: which missing piece combines with the most existing ones. Name the garment and its colour — 'a mid-grey wool crewneck' — never a brand, never a shop.`;

/**
 * Build outfits, and find the piece that would unlock the most more.
 *
 * That last part is the whole reason this exists. "This one piece would give you
 * six more outfits from things you already own" reframes a purchase from another
 * jacket into a measurable return, which is the strongest recommendation the app
 * can make and the argument that makes a subscription pay for itself out loud.
 */
export async function buildOutfits(
  owned: OwnedGarment[],
  memo?: string | null
): Promise<Outfits> {
  if (owned.length < 3) {
    return {
      outfits: [],
      missing: "",
      missingUnlocks: 0,
    };
  }

  const list = owned
    .map(
      (item, index) =>
        `${index}. ${item.label} — ${item.category}, ${item.colour}, ${item.material}, ${item.formality}, ${item.season}`
    )
    .join("\n");

  const message = await anthropic().messages.parse({
    model: MODELS.outfits,
    max_tokens: 8000,
    system: OUTFIT_SYSTEM,
    output_config: { effort: "medium", format: zodOutputFormat(OutfitsSchema) },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Here is everything I own:\n\n${list}${
              memo ? `\n\n${memo}` : ""
            }\n\nBuild five or six outfits from these, then tell me the one piece I'm missing that would unlock the most more.`,
          },
        ],
      },
    ],
  });

  assertNotRefused(message, "outfits");

  meter({
    op: "wardrobe.outfits",
    model: MODELS.outfits,
    usage: message.usage,
    extra: { garments: owned.length },
  });
  const built = requireParsed(message.parsed_output, "outfits");

  // Drop any index that isn't a real garment. A hallucinated index would render
  // as a blank row, which reads as a bug rather than as the model's mistake.
  return {
    ...built,
    outfits: built.outfits
      .map((outfit) => ({
        ...outfit,
        itemIndexes: outfit.itemIndexes.filter(
          (index) => Number.isInteger(index) && index >= 0 && index < owned.length
        ),
      }))
      .filter((outfit) => outfit.itemIndexes.length >= 2),
  };
}

/**
 * The inventory, as a line for a prompt.
 *
 * This is what turns "gaps" from a guess off six photos into a fact. The
 * instruction is explicit rather than implied because a model given a list of
 * clothes will otherwise cheerfully recommend a fourth navy crewneck.
 */
export function renderOwned(owned: OwnedGarment[]): string | null {
  if (!owned.length) return null;

  const byCategory = new Map<string, string[]>();
  for (const item of owned) {
    const list = byCategory.get(item.category) ?? [];
    list.push(`${item.colour} ${item.material} ${item.label}`.replace(/\s+/g, " ").trim());
    byCategory.set(item.category, list);
  }

  const lines = [...byCategory.entries()].map(
    ([category, items]) => `- ${category}: ${items.slice(0, 12).join("; ")}`
  );

  return [
    "This is what they already own, catalogued from photographs of their actual wardrobe:",
    ...lines,
    "",
    "Do not recommend anything they effectively already have. Recommend against these gaps, not against a guess — a second version of something on this list is a wasted suggestion, however good it is.",
  ].join("\n");
}
