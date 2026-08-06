/**
 * Holds one pending draft and opens the marketplace's own compose page.
 *
 * The rules this extension is built around, stated once here because they are
 * what keeps it on the right side of every marketplace's terms:
 *
 *   1. It fills a form. It never submits one. There is no code path anywhere
 *      in this extension that clicks a post/publish/save button, and adding
 *      one would change what this is.
 *   2. It acts once per explicit click in the LevoZ app. No timers, no
 *      queues that drain on their own, no retry loops, nothing that runs
 *      while the seller isn't looking.
 *   3. It runs in the seller's own browser and session. It never sees a
 *      marketplace password, and no request is ever made from our servers on
 *      their behalf.
 *
 * Those three are what separate "assisted listing", which marketplaces
 * tolerate, from engagement automation, which gets accounts suspended. The
 * moment any of them stops being true, the seller's account is the thing at
 * risk, not ours.
 */

/** Where each marketplace's create-a-listing form lives. */
const COMPOSE_URL = {
  depop: "https://www.depop.com/products/create/",
  vinted: "https://www.vinted.com/items/new",
  grailed: "https://www.grailed.com/sell",
};

/** One draft at a time, deliberately. A queue would invite draining it. */
const PENDING_KEY = "levoz_pending";

/**
 * Accept a draft from the LevoZ web app.
 *
 * `externally_connectable` in the manifest limits who may call this to our own
 * origins, so an arbitrary page cannot push a draft into someone's browser.
 */
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "ping") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  if (msg?.type !== "fill") {
    sendResponse({ ok: false, error: "unknown message" });
    return false;
  }

  const { marketplace, draft, photos } = msg;
  const url = COMPOSE_URL[marketplace];
  if (!url || !draft) {
    sendResponse({ ok: false, error: "missing marketplace or draft" });
    return false;
  }

  chrome.storage.local.set(
    { [PENDING_KEY]: { marketplace, draft, photos: photos ?? [], at: Date.now() } },
    () => {
      chrome.tabs.create({ url });
      sendResponse({ ok: true });
    }
  );
  return true; // async sendResponse
});

/** A content script asking whether it has anything to fill in. */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "takePending") return false;

  chrome.storage.local.get(PENDING_KEY, (data) => {
    const pending = data[PENDING_KEY];
    // Ten minutes. A draft older than that belongs to a tab the seller
    // abandoned, and filling a form they have since forgotten about is
    // surprising in a bad way.
    const fresh = pending && Date.now() - pending.at < 10 * 60 * 1000;
    if (!fresh || pending.marketplace !== msg.marketplace) {
      sendResponse({ pending: null });
      return;
    }
    // Taken, not read: clearing it here is what stops a refresh of the page
    // from filling the form a second time.
    chrome.storage.local.remove(PENDING_KEY, () => sendResponse({ pending }));
  });
  return true;
});
