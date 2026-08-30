// Does every piece of text on the site clear WCAG AA, in both modes?
//
//   node scripts/contrast-audit.mjs            # needs the site on :3311
//   SCHEME=light node scripts/contrast-audit.mjs
//
// Written because a repaint is exactly the change a build cannot check. Moving
// the palette from a light ground to a dark one turned every `bg-room-ink
// text-white` button into white-on-white: it compiled, it typechecked, and it
// was unreadable. A screenshot caught it; this catches the next one.
//
// It walks the real rendered pages, resolves the *actual* computed colour of
// every text node against the first non-transparent background behind it, and
// reports anything under the threshold. That last part matters -- a naive
// check reads a transparent parent and reports a false pass.

// Resolved leniently: Playwright is not a dependency of this app and adding it
// would put a browser download in everyone's install for a script most people
// will never run. NODE_PATH lets it be borrowed from wherever it already is.
let chromium;
try {
  // PLAYWRIGHT_MODULE first: ESM `import()` ignores NODE_PATH, so borrowing an
  // install from elsewhere needs an actual path.
  const mod = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
  chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error("no chromium export");
} catch {
  console.error(
    "This audit drives a real browser, and Playwright isn't installed here.\n\n" +
      "  npm i -D playwright && npx playwright install chromium\n\n" +
      "or point at an existing install:\n\n" +
      "  PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.js \\\n" +
      "    node scripts/contrast-audit.mjs\n"
  );
  process.exit(2);
}

const BASE = process.env.BASE ?? "http://127.0.0.1:3311";
const EXE =
  process.env.CHROMIUM ?? "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const SCHEME = process.env.SCHEME === "light" ? "light" : "dark";

/*
 * Every page a visitor can actually reach.
 *
 * /tools and /closets are now tabs of Clozet, and /wardrobe and /discover are
 * off the menu; all four still exist as redirects, and a redirect has no text
 * to measure. Auditing them would report a clean page for content that was
 * never rendered, which is worse than not auditing them at all.
 */
const ROUTES = [
  "/",
  "/closet",
  "/closet/tools",
  "/closet/saved",
  "/accessories",
  "/colognes",
  "/calibrate",
];

const audit = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lum = ({ r, g, b }) =>
    [r, g, b]
      .map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // Flatten a translucent foreground over what is behind it, rather than
  // reporting the nominal colour of a 70%-opacity label as if it were solid.
  const over = (fg, bg) =>
    fg.a >= 1
      ? fg
      : {
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
          a: 1,
        };

  /**
   * What is actually behind this text.
   *
   * Returns `null` when the answer is a photograph or a video rather than a
   * colour. That case has to be reported separately instead of resolved: the
   * first version of this walked past a full-bleed <video> to the page ground
   * behind it, computed near-white text against off-black, and passed the
   * corridor headline -- which was at that moment near-white text sitting on
   * near-white footage, completely illegible.
   */
  const MEDIA = "video, img, canvas, svg";
  const groundOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0.95) return { colour: bg };
      if (cs.backgroundImage && cs.backgroundImage !== "none") return { media: "background-image" };

      // Media painted *behind* this text by an earlier sibling in the same
      // stacking context, which is how every full-bleed clip on this site works.
      const box = el.getBoundingClientRect();
      for (const m of node.querySelectorAll(MEDIA)) {
        if (m.contains(el)) continue;
        const r = m.getBoundingClientRect();
        const covers =
          r.left <= box.left && r.right >= box.right && r.top <= box.top && r.bottom >= box.bottom;
        if (covers && r.width > 2) return { media: m.tagName.toLowerCase() };
      }
      node = node.parentElement;
    }
    return {
      colour: parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 },
    };
  };

  const findings = [];
  const overMedia = [];
  for (const el of document.querySelectorAll("body *")) {
    // Only elements whose own text is visible, not wrappers.
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!own) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;

    const fg = parse(cs.color);
    if (!fg) continue;

    const ground = groundOf(el);
    if (ground.media) {
      // Cannot be measured, so it is reported rather than skipped. Text over
      // footage needs a fixed ink or a scrim; silence here is how the last one
      // shipped.
      overMedia.push({ text: own.slice(0, 44), tag: el.tagName.toLowerCase(), media: ground.media,
        cls: (el.className?.toString?.() ?? "").slice(0, 60) });
      continue;
    }
    const r = ratio(over(fg, ground.colour), ground.colour);

    // AA: 4.5 for body, 3.0 for large text (18.66px bold, or 24px).
    const size = parseFloat(cs.fontSize);
    const bold = +cs.fontWeight >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;

    if (r < need) {
      findings.push({
        text: own.slice(0, 44),
        tag: el.tagName.toLowerCase(),
        cls: (el.className?.toString?.() ?? "").slice(0, 60),
        ratio: +r.toFixed(2),
        need,
        size: Math.round(size),
      });
    }
  }
  return { findings, overMedia };
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: SCHEME });

let total = 0;
for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const { findings, overMedia } = await page.evaluate(audit);
  if (overMedia.length) {
    console.log(`\n${route}  (${SCHEME})  text over media, not machine-checkable:`);
    for (const m of overMedia) {
      console.log(`  over <${m.media}>  ${m.tag}  "${m.text}"\n         ${m.cls}`);
    }
  }
  if (findings.length) {
    total += findings.length;
    console.log(`\n${route}  (${SCHEME})`);
    for (const f of findings) {
      console.log(
        `  ${String(f.ratio).padStart(5)} / ${f.need}  ${f.size}px  ${f.tag}  "${f.text}"\n         ${f.cls}`
      );
    }
  }
}

await browser.close();

if (total) {
  console.error(`\n${total} contrast failures in ${SCHEME} mode.`);
  process.exit(1);
}
console.log(`\nno contrast failures across ${ROUTES.length} pages in ${SCHEME} mode.`);
