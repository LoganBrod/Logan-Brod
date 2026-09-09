// Things that are built and not on the page.
//
// The same treatment Wardrobe and Discover got: nothing is deleted, the API
// routes and the tests stay green, and putting one back is a single word here
// plus the section that renders it. A flag is honest about the state of the
// thing in a way a commented-out block is not.

/**
 * Standing scans: the searches that keep running twice a day and email what
 * clears the bar.
 *
 * Off for now. The list that shows what you have running, renames it and stops
 * it lived in one place - the Tools page - and that section is off the page,
 * so an offer to start one would be an offer to start something nobody can
 * then see or stop. The sweep, the API, the digest and the tests are all
 * untouched; this only decides whether the run offers it.
 */
export const STANDING_SCANS = false;
