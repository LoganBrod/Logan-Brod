/**
 * Shared form-filling machinery.
 *
 * Loaded before each marketplace's own script and shares its isolated world,
 * so everything declared here is available to them.
 *
 * Nothing in this file clicks a submit button, and nothing calls setInterval.
 * See background.js for why that matters.
 */

/**
 * Set the value of an input React is controlling.
 *
 * `el.value = x` does not work on these sites. React tracks the previous value
 * on the DOM node and compares against it when an input event fires; assigning
 * directly updates the node but leaves React's copy stale, so React decides
 * nothing changed and reverts the field on the next render. Going through the
 * prototype's native setter updates the node *and* the tracker, and dispatching
 * a bubbling input event then runs React's own onChange.
 */
function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Wait for an element to appear.
 *
 * These are single-page apps whose compose form mounts after the route
 * resolves, so querying at document_idle usually finds nothing. Resolves null
 * rather than throwing, because a missing field should degrade to "we left
 * that one for you" instead of abandoning the whole fill.
 */
function waitFor(selector, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

/** Fill one text field. Returns whether it found it. */
async function fillText(selector, value) {
  if (!value) return true; // nothing to write is not a failure
  const el = await waitFor(selector);
  if (!el) return false;
  el.focus();
  setNativeValue(el, value);
  el.blur();
  return true;
}

/**
 * Attach photos to a file input.
 *
 * The images live behind LevoZ's own photo route, which the manifest does not
 * grant host access to — deliberately, so the extension cannot read anything
 * from the app beyond what the app hands it. The app therefore sends the
 * photos as data URLs alongside the draft, and this converts them back to
 * files. A file input cannot be assigned to directly, so the files go through
 * a DataTransfer, which is the only way to synthesise a FileList.
 */
async function attachPhotos(selector, dataUrls) {
  if (!dataUrls?.length) return true;
  const input = await waitFor(selector);
  if (!input) return false;

  const transfer = new DataTransfer();
  for (let i = 0; i < dataUrls.length; i++) {
    try {
      const blob = await (await fetch(dataUrls[i])).blob();
      transfer.items.add(new File([blob], `photo-${i + 1}.jpg`, { type: blob.type || "image/jpeg" }));
    } catch {
      // One unreadable photo should not cost the seller the other five.
    }
  }
  if (transfer.files.length === 0) return false;

  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * Tell the seller what happened, on the page, before they post.
 *
 * Not decoration. A form that fills itself and says nothing is how someone
 * posts a listing they never actually read — and the fields most likely to be
 * wrong are the ones this could not find. Naming them is the difference
 * between assistance and a surprise.
 */
function showBanner(marketplaceName, missing) {
  const bar = document.createElement("div");
  bar.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:2147483647",
    "background:linear-gradient(105deg,#3b82f6,#8b5cf6,#ec4899)", "color:#fff",
    "font:600 14px/1.4 system-ui,sans-serif", "padding:12px 16px",
    "box-shadow:0 2px 12px rgba(0,0,0,.25)", "display:flex", "gap:12px",
    "align-items:center",
  ].join(";");

  const text = document.createElement("span");
  text.style.flex = "1";
  text.textContent = missing.length
    ? `LevoZ filled what it could on ${marketplaceName}. Check it, add ${missing.join(", ")}, then post it yourself.`
    : `LevoZ filled this ${marketplaceName} listing. Check it over, then post it yourself.`;

  const close = document.createElement("button");
  close.textContent = "Got it";
  close.style.cssText =
    "background:rgba(0,0,0,.25);border:0;color:#fff;font:inherit;padding:6px 12px;border-radius:8px;cursor:pointer";
  close.addEventListener("click", () => bar.remove());

  bar.append(text, close);
  document.body.appendChild(bar);
}

/**
 * Entry point each marketplace script calls.
 *
 * `filler` receives the draft and returns the list of fields it could not
 * find. Runs once, on page load, only if the app put a draft there.
 */
async function runFill(marketplace, marketplaceName, filler) {
  const res = await chrome.runtime.sendMessage({ type: "takePending", marketplace });
  const pending = res?.pending;
  if (!pending) return;

  let missing = [];
  try {
    missing = (await filler(pending.draft, pending.photos)) ?? [];
  } catch (err) {
    console.error("[LevoZ] fill failed:", err);
    missing = ["everything — the form didn't look how we expected"];
  }
  showBanner(marketplaceName, missing);
}
