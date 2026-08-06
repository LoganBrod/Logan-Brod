/**
 * Depop's compose form.
 *
 * SELECTORS ARE UNVERIFIED. They could not be captured from the live page:
 * Depop's compose form is behind a login and the site sits behind bot
 * protection, so these are written from the shape Depop's app is known to
 * use rather than from an inspection. Expect to correct them.
 *
 * To fix one: open the compose page, right-click the field, Inspect, and
 * prefer a data-testid or name attribute over a generated class — class names
 * here change on every deploy.
 *
 * A wrong selector is safe. waitFor resolves null, the field is reported as
 * missing, and the banner tells the seller to fill it themselves.
 */
const S = {
  photos: 'input[type="file"]',
  description: 'textarea[name="description"], textarea[data-testid="description"]',
  price: 'input[name="price"], input[data-testid="price"]',
  // Depop has no title field — the first line of the description does that job.
};

runFill("depop", "Depop", async (draft, photos) => {
  const missing = [];

  // Hashtags go in the description too: Depop indexes them there as well as
  // in its own tag field, and one paste covers both.
  const description = draft.hashtags?.length
    ? `${draft.description}\n\n${draft.hashtags.map((h) => `#${h}`).join(" ")}`
    : draft.description;

  if (!(await attachPhotos(S.photos, photos))) missing.push("photos");
  if (!(await fillText(S.description, description))) missing.push("the description");
  if (!(await fillText(S.price, String(draft.price)))) missing.push("the price");

  // Category, condition, brand and size are custom dropdowns rather than
  // inputs, and driving someone else's dropdown reliably is a losing game.
  // They are quick to pick by hand and wrong if guessed, so they are named
  // in the banner instead.
  missing.push("category, condition, brand and size");
  return missing;
});
