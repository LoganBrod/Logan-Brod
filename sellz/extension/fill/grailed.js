/**
 * Grailed's compose form.
 *
 * SELECTORS ARE UNVERIFIED — see the note in depop.js.
 */
const S = {
  photos: 'input[type="file"]',
  title: 'input[name="title"]',
  description: 'textarea[name="description"]',
  price: 'input[name="price"]',
};

runFill("grailed", "Grailed", async (draft, photos) => {
  const missing = [];

  // Measurements belong in the description on Grailed: buyers shop by them,
  // and a listing without them gets skipped.
  const description = draft.measurements
    ? `${draft.description}\n\nMeasurements:\n${draft.measurements}`
    : draft.description;

  if (!(await attachPhotos(S.photos, photos))) missing.push("photos");
  if (!(await fillText(S.title, draft.title))) missing.push("the title");
  if (!(await fillText(S.description, description))) missing.push("the description");
  if (!(await fillText(S.price, String(draft.price)))) missing.push("the price");

  missing.push("designer, category, size and condition");
  return missing;
});
