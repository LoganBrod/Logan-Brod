// Shared with the browser, so it lives apart from lib/requery.ts, which imports
// the Anthropic SDK. Same reasoning as lib/accessoryKinds.ts.

/**
 * How many pieces a run must reach before the second search is skipped.
 *
 * Half a closet. Below this the rail reads as "it didn't find much", and one
 * more search costs about a tenth of the run. Above it the marginal piece is
 * not worth the wait.
 */
export const MIN_GOOD_PICKS = 6;
