// The things three photographs cannot tell you.
//
// Until now a run knew exactly two things about a person beyond their uploads:
// a price range and, if they'd filled it in, a set of measurements. Everything
// else — what they're dressing for, how close to the body they like things,
// whether they want to be surprised, which colours they simply won't wear — was
// inferred from a handful of images and then guessed at.
//
// That guessing is a good part of why the results read as hit or miss. Someone
// who uploads three coats they own is not telling you whether they want more
// coats for the office or the pub, whether "relaxed" means their taste or just
// the only three photos they had to hand, or that they'd never in their life
// wear burgundy. These are five questions, they take fifteen seconds, and they
// cost nothing at model time beyond a short block of text.
//
// Kept deliberately small. A questionnaire long enough to be thorough is one
// nobody finishes, and the uploads are still the primary signal — this steers,
// it doesn't drive.

export const OCCASIONS = [
  { value: "everyday", label: "Everyday", hint: "Most of the week, nothing special." },
  { value: "work", label: "Work", hint: "Office, or something close to it." },
  { value: "going-out", label: "Going out", hint: "Evenings, and being looked at." },
  { value: "outdoors", label: "Outdoors", hint: "Weather, walking, hard wear." },
] as const;

export const FITS = [
  { value: "relaxed", label: "Relaxed", hint: "Room through the body." },
  { value: "regular", label: "Regular", hint: "Neither one way nor the other." },
  { value: "slim", label: "Slim", hint: "Close, but not tight." },
] as const;

export const ADVENTURES = [
  { value: "safe", label: "Play it safe", hint: "Things you'd already own." },
  { value: "balanced", label: "In between", hint: "Mostly safe, one or two surprises." },
  { value: "bold", label: "Surprise me", hint: "Show you something you wouldn't have found." },
] as const;

/**
 * Colours somebody can rule out.
 *
 * A short list of families rather than every shade, because this has to be
 * answerable in one glance — and because the value it is matched against is the
 * `colour` the curation model tags each pick with, which uses roughly this
 * vocabulary. A finer list would produce tags that never match and a filter
 * that silently does nothing.
 */
export const AVOIDABLE_COLOURS = [
  "black",
  "white",
  "grey",
  "navy",
  "blue",
  "green",
  "olive",
  "brown",
  "tan",
  "beige",
  "red",
  "burgundy",
  "orange",
  "yellow",
  "pink",
  "purple",
] as const;

export type Occasion = (typeof OCCASIONS)[number]["value"];
export type Fit = (typeof FITS)[number]["value"];
export type Adventure = (typeof ADVENTURES)[number]["value"];

export interface Preferences {
  occasion?: Occasion;
  fit?: Fit;
  adventure?: Adventure;
  /** Colour families this person won't wear. Enforced, not suggested. */
  avoid?: string[];
  /** Makers they already like, in their own words. */
  brands?: string;
  /**
   * What they usually spend on one piece. Prefills the price fields; it is a
   * starting position the form can change, not a filter the search applies.
   */
  budget?: { min: number; max: number };
  /**
   * Whether the first-visit quiz has been seen through or dismissed. Either
   * counts: a quiz that reappears because somebody closed it is a nag, and a
   * nag gets the whole thing turned off.
   */
  onboarded?: boolean;
}

/** A per-piece budget past this is not a secondhand-menswear budget. */
export const MAX_BUDGET = 10_000;

/** Free text goes into a prompt, so its length is bounded rather than trusted. */
export const MAX_BRANDS_CHARS = 120;

/** How many colours somebody may rule out before they've ruled out shopping. */
export const MAX_AVOID = 6;

const has = <T extends string>(options: readonly { value: T }[], raw: unknown): T | undefined =>
  typeof raw === "string" && options.some((o) => o.value === raw) ? (raw as T) : undefined;

/**
 * Whatever arrived over the wire, reduced to something meaningful.
 *
 * Unknown values are dropped rather than rejected: a preference that fails to
 * parse should cost that one preference, never the run.
 */
export function cleanPreferences(input: unknown): Preferences {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;

  const avoid = Array.isArray(raw.avoid)
    ? [
        ...new Set(
          raw.avoid
            .filter((c): c is string => typeof c === "string")
            .map((c) => c.toLowerCase().trim())
            .filter((c) => (AVOIDABLE_COLOURS as readonly string[]).includes(c))
        ),
      ].slice(0, MAX_AVOID)
    : [];

  const brands =
    typeof raw.brands === "string" ? raw.brands.replace(/\s+/g, " ").trim().slice(0, MAX_BRANDS_CHARS) : "";

  const cleaned: Preferences = {};
  const occasion = has(OCCASIONS, raw.occasion);
  const fit = has(FITS, raw.fit);
  const adventure = has(ADVENTURES, raw.adventure);

  if (occasion) cleaned.occasion = occasion;
  if (fit) cleaned.fit = fit;
  if (adventure) cleaned.adventure = adventure;
  if (avoid.length) cleaned.avoid = avoid;
  if (brands) cleaned.brands = brands;

  // Budget: two finite integers, ordered, inside a sane band. Anything else
  // costs the budget, never the rest of the answers.
  const b = raw.budget as { min?: unknown; max?: unknown } | undefined;
  if (b && typeof b === "object") {
    const min = Math.round(Number(b.min));
    const max = Math.round(Number(b.max));
    if (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max > min && max <= MAX_BUDGET) {
      cleaned.budget = { min, max };
    }
  }
  if (raw.onboarded === true) cleaned.onboarded = true;

  return cleaned;
}

export function hasPreferences(prefs: Preferences | null | undefined): boolean {
  // `onboarded` is bookkeeping, not a preference: having seen the quiz says
  // nothing a prompt should carry.
  return Boolean(prefs && Object.keys(prefs).some((k) => k !== "onboarded"));
}

const OCCASION_LINE: Record<Occasion, string> = {
  everyday: "Everyday clothes, worn most of the week. Nothing that only works once.",
  work: "For work — an office or something near it. Err on the tidier side of their uploads.",
  "going-out": "For evenings and being looked at. The uploads are the register; this is the good end of it.",
  outdoors: "For outdoors and hard wear. Function is part of the judgement, not just the look.",
};

const FIT_LINE: Record<Fit, string> = {
  relaxed: "They want room through the body. Prefer the roomier cut where a piece comes both ways.",
  regular: "Regular fit. Nothing deliberately oversized or deliberately tight.",
  slim: "They want a close cut. Not tight — close.",
};

const ADVENTURE_LINE: Record<Adventure, string> = {
  safe: "Keep to what they clearly already wear. This is not the moment to broaden their taste.",
  balanced: "Mostly within what they already wear, with a piece or two that stretches it slightly.",
  bold: "They have asked to be surprised. Inside their register, favour the piece they wouldn't have found on their own over the safest match.",
};

/**
 * The preferences as a prompt reads them.
 *
 * Written as instructions rather than as a data dump — "they want room through
 * the body" tells a model what to do with the fact, where `fit: relaxed` leaves
 * it to interpret a token. Null when nothing was answered, so the prompt doesn't
 * carry an empty heading.
 */
/**
 * Who is reading the preferences.
 *
 * The same fact - "they like Barbour and Red Wing" - has to be said two ways.
 * To the reader, who writes the search queries, it is a clue about register:
 * the price tier, the construction, the aesthetic those makers share, and the
 * neighbouring makers a secondhand market titles listings with. Said plainly
 * it became a shopping list - the reader was already told that naming a maker
 * is good query material, so it wrote "Barbour waxed jacket", "Red Wing boots"
 * and the pool was those two brands. To the judge, who only chooses from what
 * came back, it is a small point in a piece's favour and never a requirement.
 */
export type PreferenceAudience = "reader" | "judge";

/** The makers somebody typed, one per entry, for matching against queries. */
export function namedMakers(prefs: Preferences | null | undefined): string[] {
  return (prefs?.brands ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

export function renderPreferences(
  prefs: Preferences | null | undefined,
  audience: PreferenceAudience = "judge"
): string | null {
  if (!hasPreferences(prefs)) return null;
  const p = prefs as Preferences;

  const lines: string[] = [];
  if (p.occasion) lines.push(OCCASION_LINE[p.occasion]);
  if (p.fit) lines.push(FIT_LINE[p.fit]);
  if (p.adventure) lines.push(ADVENTURE_LINE[p.adventure]);
  if (p.avoid?.length) {
    lines.push(
      `They do not wear ${p.avoid.join(", ")}. Do not return anything whose main colour is one of those, whatever else is right about it.`
    );
  }
  if (p.brands) {
    // Quoted and attributed, so a model reads it as something the wearer said
    // rather than as an instruction that arrived from the system.
    lines.push(
      audience === "reader"
        ? `Asked which makers they already like, they said: "${p.brands}". Use this to understand the register they shop at - the price tier, the construction, and the aesthetic those makers share - and to name other makers of the same register that listings are titled with. It is not a list to search for: a maker they named may appear in at most two queries, and the rest are written by garment, material and cut.`
        : `Asked which makers they already like, they said: "${p.brands}". A maker they named is a small point in a piece's favour, never a requirement; a piece from any other maker is judged exactly like the rest.`
    );
  }
  if (p.budget) {
    lines.push(
      `They usually spend about $${p.budget.min} to $${p.budget.max} on a single piece, so that is the register they shop at.`
    );
  }

  return `What they told us about themselves:\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

/**
 * Does this pick break a colour they ruled out?
 *
 * The prompt is told, and the prompt is also not trusted — the same lesson as
 * the score floor and the category cap. "I won't wear pink" is the one answer
 * here that is a hard rule rather than a lean, and a person who sees pink after
 * saying that learns the questions were decoration.
 *
 * Matches on the colour the curation model tagged, and only on a whole word, so
 * ruling out "red" doesn't quietly rule out every "faded" jacket.
 */
export function breaksColourRule(
  colour: string | undefined,
  prefs: Preferences | null | undefined
): boolean {
  if (!colour || !prefs?.avoid?.length) return false;
  const words = colour.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return prefs.avoid.some((avoided) => words.includes(avoided));
}
