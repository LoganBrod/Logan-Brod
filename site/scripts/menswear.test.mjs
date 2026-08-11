// The title filter is the only menswear guard on sources with no category
// concept, and the second net on eBay where sellers miscategorise. These cases
// are drawn from the shapes real listings actually take.

import assert from "node:assert/strict";
import test from "node:test";
import { isMenswearListing, rejectTitle, thumbnailUrl } from "../lib/sources/menswear.ts";

test("keeps ordinary menswear listings", () => {
  for (const title of [
    "Barbour Beaufort Waxed Cotton Jacket Olive 42",
    "Red Wing 875 Moc Toe Boot Oro Legacy 10D",
    "Vintage Levi's 501 Selvedge Denim W32 L32",
    "J.Crew Shetland Wool Crewneck Sweater Moss Medium",
  ]) {
    assert.equal(isMenswearListing(title), true, `should keep: ${title}`);
  }
});

test("drops womenswear and kids' listings", () => {
  for (const title of [
    "Womens Waxed Cotton Jacket Olive Size 10",
    "Ladies Suede Chelsea Boot Tan",
    "Girls Denim Jacket Age 8",
    "Toddler Flannel Shirt 3T",
    "Juniors Corduroy Trousers",
  ]) {
    assert.equal(isMenswearListing(title), false, `should drop: ${title}`);
    assert.equal(rejectTitle(title)?.reason, "not-menswear");
  }
});

test("an explicit men's or unisex label wins over a stray token", () => {
  // Real listings compare against women's sizing all the time.
  assert.equal(isMenswearListing("Men's Chelsea Boot (fits like ladies 9)"), true);
  assert.equal(isMenswearListing("Unisex Adult Fleece, also sold in womens sizes"), true);
});

test("word boundaries — substrings must not trip the filter", () => {
  // "boyfriend" contains "boy", "cowboy" contains "boy", "womens" contains "men".
  assert.equal(isMenswearListing("Cowboy Western Shirt Pearl Snap Large"), true);
  assert.equal(isMenswearListing("Boyfriend Fit Chore Coat"), true);
});

test("drops listings that aren't one buyable garment", () => {
  for (const title of [
    "Lot of 5 Vintage Flannel Shirts Resale",
    "Wholesale Bundle of Denim Jackets",
    "Mens Jacket Size Chart Reference",
    "Leather Boots For Parts Not Working",
    "Replica Waxed Jacket High Quality",
    "Sewing Pattern Only - Field Jacket",
    "Nike Box Only No Shoes",
  ]) {
    assert.equal(isMenswearListing(title), false, `should drop: ${title}`);
    assert.equal(rejectTitle(title)?.reason, "not-a-garment");
  }
});

test("a men's label does not excuse a bulk lot", () => {
  // The garment check runs regardless of how the listing is gendered.
  assert.equal(isMenswearListing("Mens Lot of 10 Shirts Wholesale"), false);
});

test("thumbnailUrl asks eBay for the small rendition", () => {
  assert.equal(
    thumbnailUrl("https://i.ebayimg.com/images/g/AbC/s-l1600.jpg"),
    "https://i.ebayimg.com/images/g/AbC/s-l400.jpg"
  );
  // Non-eBay URLs pass through untouched rather than being mangled.
  const other = "https://cdn.example.com/photo.jpg";
  assert.equal(thumbnailUrl(other), other);
  assert.equal(thumbnailUrl(undefined), undefined);
});
