/**
 * Vinted's compose form.
 *
 * SELECTORS ARE UNVERIFIED — see the note in depop.js. Same fix, same
 * failure mode: a wrong selector reports the field as missing rather than
 * breaking the fill.
 */
const S = {
  photos: 'input[type="file"]',
  title: 'input[name="title"], input[data-testid="title--input"]',
  description: 'textarea[name="description"], textarea[data-testid="description--input"]',
  price: 'input[name="price"], input[data-testid="price-input--input"]',
};

runFill("vinted", "Vinted", async (draft, photos) => {
  const missing = [];

  if (!(await attachPhotos(S.photos, photos))) missing.push("photos");
  // Vinted's title is keyword-matched, so it matters more here than the
  // description does.
  if (!(await fillText(S.title, draft.title))) missing.push("the title");
  if (!(await fillText(S.description, draft.description))) missing.push("the description");
  if (!(await fillText(S.price, String(draft.price)))) missing.push("the price");

  // Vinted scores listing completeness directly — an empty field costs
  // visibility — so this is worth saying rather than leaving to chance.
  missing.push("category, brand, size and condition (Vinted ranks complete listings higher)");
  return missing;
});
