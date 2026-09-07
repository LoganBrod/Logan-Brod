// Every third party the app talks to, imitated on one port.
//
// Routed by the `x-sim-host` header the interceptor sets. Each imitation
// answers with the fields the app actually reads and nothing else, after a
// delay that stands in for the real service's speed (SIM_SPEED scales all of
// them: 1 is realistic, 0.2 is five times faster). No money moves.
//
// Test support only - never imported by the app.

import { createServer } from "node:http";
import { createHash } from "node:crypto";

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

const hash = (s) => createHash("sha1").update(s).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COLOURS = ["olive", "navy", "tan", "charcoal", "ecru", "rust", "grey", "brown", "indigo", "stone", "black", "sage"];
const QUERY_SETS = [
  ["waxed cotton field jacket", "outerwear"],
  ["selvedge denim jacket", "outerwear"],
  ["shetland wool crewneck", "tops"],
  ["oxford cloth button down shirt", "tops"],
  ["heavyweight pocket tee", "tops"],
  ["wool flannel trousers", "bottoms"],
  ["cotton twill chinos", "bottoms"],
  ["moleskin work trousers", "bottoms"],
  ["suede chukka boots", "footwear"],
  ["leather derby shoes", "footwear"],
];

/** Realistic-ish timings, in ms at SIM_SPEED=1. */
const MODEL_MS = { profile: 18000, curation: 9000, requery: 6000, judgement: 12000, accessories: 6000, cologne: 8000, fit: 14000, other: 4000 };
const MARKET_MS = { ebay: 700, serpapi: 1200, page: 400, image: 120, mail: 300 };

export function startFakeUpstream(port = 0, opts = {}) {
  const speed = Number(opts.speed ?? process.env.SIM_SPEED ?? 1);
  const scaled = (ms) => Math.round(ms * speed);
  const stats = { byHost: new Map(), model: new Map(), distinctQueries: new Set(), analyses: 0 };
  const count = (map, k) => map.set(k, (map.get(k) ?? 0) + 1);

  function kindOf(body) {
    const props = Object.keys(body?.output_config?.format?.schema?.properties ?? {});
    const has = (k) => props.includes(k);
    if (has("searchQueries") && has("summary")) return "profile";
    if (has("picks") && has("notes")) return "curation";
    if (has("searchQueries")) return "requery";
    if (has("verdict")) return "judgement";
    if (has("queries") && has("summary")) return "accessories";
    if (has("intro") && has("picks")) return "cologne";
    if (has("recommendation")) return "fit";
    return "other";
  }

  function textOf(body) {
    const parts = [];
    for (const m of body.messages ?? []) {
      if (typeof m.content === "string") parts.push(m.content);
      else for (const block of m.content ?? []) if (block.type === "text") parts.push(block.text);
    }
    return parts.join("\n");
  }

  function profile(n) {
    // Every third profile is "thin": its curations keep almost nothing, so the
    // run's second search fires. Marked in the summary so curation can tell.
    const thin = n % 3 === 0;
    const colour = COLOURS[n % COLOURS.length];
    return {
      summary: `${thin ? "[thin] " : ""}You dress in worn-in workwear with an ivy lean, in a ${colour} and earth palette.`,
      aesthetics: ["workwear", "ivy"],
      palette: [
        { name: colour, hex: "#556b2f" },
        { name: "ecru", hex: "#f1e9d2" },
        { name: "navy", hex: "#1f2a44" },
        { name: "tan", hex: "#c8a97e" },
      ],
      silhouette: "Straight, a little room through the body, cropped at the hip.",
      fabrics: ["waxed cotton", "shetland wool", "selvedge denim"],
      formality: "casual to smart-casual",
      gaps: ["a proper coat", "a second pair of trousers"],
      searchQueries: QUERY_SETS.map(([q, category], i) => ({
        query: `${q} ${COLOURS[(n + i) % COLOURS.length]}`,
        category,
        minPrice: 40,
        maxPrice: 220,
        reason: "It sits with what you already wear.",
      })),
    };
  }

  function curation(body) {
    const text = textOf(body);
    const ids = [...text.matchAll(/^(\S+) \| \$/gm)].map((m) => m[1]);
    const thin = text.includes("[thin]");
    const asked = Number(text.match(/up to (\d+)/i)?.[1] ?? 2);
    let chosen;
    if (thin) {
      const first = ids[0] ?? "";
      chosen = parseInt(hash(first).slice(0, 2), 16) % 2 === 0 ? ids.slice(0, 1) : [];
    } else {
      chosen = ids.slice(0, Math.max(1, Math.min(asked, 2)));
    }
    return {
      picks: chosen.map((id, i) => ({
        id,
        score: 84 - i * 6,
        whyItFits: "The weight and the colour sit with the rest of your wardrobe.",
        category: i % 2 ? "trousers" : "jacket",
        brand: "unknown",
        material: i % 2 ? "cotton twill" : "waxed cotton",
        colour: "olive",
      })),
      notes: thin ? "Most of this was the wrong register - too dressy, or too new." : "Left out the pieces that were too slim.",
    };
  }

  const responses = {
    requery: () => ({
      searchQueries: QUERY_SETS.slice(0, 6).map(([q, category], i) => ({
        query: `${q} vintage ${COLOURS[(i * 5) % COLOURS.length]}`,
        category,
        minPrice: 40,
        maxPrice: 220,
        reason: "Plainer words, the way sellers title things.",
      })),
    }),
    judgement: () => ({
      verdict: "yes",
      headline: "Buy it: the cut and the colour are yours.",
      forIt: ["Waxed cotton, properly broken in", "The olive sits with your trousers"],
      againstIt: ["The listing does not state the pit-to-pit"],
      onPrice: "Fair for the condition.",
      onFit: "Ask the seller for the chest measurement before you commit.",
    }),
    accessories: () => ({
      summary: "Keep them quieter than the clothes.",
      queries: [
        { query: "leather belt brown brass buckle", kind: "belts", minPrice: 20, maxPrice: 90, reason: "Plain, in a colour you already wear." },
        { query: "woven cotton belt olive", kind: "belts", minPrice: 15, maxPrice: 60, reason: "For summer." },
      ],
    }),
    cologne: () => ({
      intro: "Something warm and dry, worn close.",
      picks: [
        { house: "Dior", name: "Eau Sauvage", smells: "Citrus over dry moss.", wears: "Six hours, close.", whyYou: "It suits clothes that are not trying.", ubiquity: "known", season: "Spring to autumn" },
        { house: "Guerlain", name: "Vetiver", smells: "Cut grass and tobacco.", wears: "All day, quietly.", whyYou: "Earthy, like your palette.", ubiquity: "known", season: "Year round" },
      ],
      howToBuy: "Samples first. The cheap bottles are fake.",
    }),
    fit: () => ({
      recommendation: "M",
      runs: "true",
      confidence: "medium",
      reasoning: "Their chart puts a 40 chest at M, which is what you gave.",
      cautions: ["Their vintage line runs a size small."],
      sources: ["Brand size guide"],
    }),
    other: () => ({ ok: true }),
  };

  const server = createServer(async (req, res) => {
    const host = req.headers["x-sim-host"] ?? "";
    count(stats.byHost, host);
    let body = "";
    for await (const chunk of req) body += chunk;
    const url = new URL(req.url, "http://x");
    const json = (payload, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    try {
      if (host === "api.anthropic.com") {
        const parsed = JSON.parse(body || "{}");
        const kind = kindOf(parsed);
        count(stats.model, kind);
        await sleep(scaled(MODEL_MS[kind] ?? MODEL_MS.other));
        let output;
        if (kind === "profile") output = profile(stats.analyses++);
        else if (kind === "curation") output = curation(parsed);
        else output = responses[kind]();
        return json({
          id: `msg_${hash(body).slice(0, 12)}`,
          type: "message",
          role: "assistant",
          model: parsed.model ?? "sim",
          content: [{ type: "text", text: JSON.stringify(output) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1200, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        });
      }

      if (host === "api.ebay.com" || host === "api.sandbox.ebay.com") {
        if (url.pathname.includes("/oauth2/token")) {
          await sleep(scaled(MARKET_MS.ebay));
          return json({ access_token: "sim-token", expires_in: 7200 });
        }
        if (url.pathname.includes("/category_tree/")) {
          await sleep(scaled(MARKET_MS.ebay));
          return json({
            categorySubtreeNode: {
              category: { categoryId: "11450", categoryName: "Clothing, Shoes & Accessories" },
              childCategoryTreeNodes: [
                { category: { categoryId: "1059", categoryName: "Men" } },
                { category: { categoryId: "15724", categoryName: "Women" } },
              ],
            },
          });
        }
        if (url.pathname.includes("/item_summary/search")) {
          const q = url.searchParams.get("q") ?? "";
          const limit = Number(url.searchParams.get("limit") ?? 30);
          stats.distinctQueries.add(q.toLowerCase().trim());
          await sleep(scaled(MARKET_MS.ebay));
          const h = hash(q);
          return json({
            itemSummaries: Array.from({ length: limit }, (_, i) => ({
              itemId: `v1|${h.slice(0, 10)}${String(i).padStart(2, "0")}|0`,
              title: `Men's ${q} size L`,
              price: { value: String(45 + ((parseInt(h.slice(i % 30, (i % 30) + 2), 16) || 0) % 150)), currency: "USD" },
              itemWebUrl: `https://www.ebay.com/itm/${h.slice(0, 8)}${i}`,
              image: { imageUrl: `https://i.ebayimg.com/images/g/${h.slice(0, 6)}${i}/s-l500.jpg` },
              condition: "Pre-owned",
              conditionId: "3000",
              seller: { username: "sim-seller", feedbackPercentage: "99.6" },
            })),
          });
        }
        return json({ error: "unknown ebay path" }, 404);
      }

      if (host === "serpapi.com") {
        await sleep(scaled(MARKET_MS.serpapi));
        const engine = url.searchParams.get("engine");
        const q = url.searchParams.get("q") ?? "";
        const h = hash(`serp:${q}`);
        if (engine === "google") {
          return json({
            organic_results: [
              { title: "Size guide", link: "https://www.uniqlo.com/us/en/size-chart", snippet: "Chest 38-40 is M." },
              { title: "How it fits", link: "https://www.reddit.com/r/malefashionadvice/sizing", snippet: "Runs true." },
            ],
          });
        }
        return json({
          shopping_results: Array.from({ length: 10 }, (_, i) => ({
            product_id: `${h.slice(0, 8)}${i}`,
            title: `Men's ${q}`,
            product_link: `https://www.google.com/shopping/product/${h.slice(0, 8)}${i}`,
            source: "Uniqlo",
            extracted_price: 60 + i * 9,
            thumbnail: `https://encrypted-tbn0.gstatic.com/shopping?q=${h.slice(0, 8)}${i}`,
          })),
        });
      }

      if (host === "api.resend.com") {
        await sleep(scaled(MARKET_MS.mail));
        return json({ id: `email_${hash(body).slice(0, 8)}` });
      }

      if (/ebayimg|gstatic|\.(jpg|jpeg|png|webp)$/i.test(host + url.pathname)) {
        await sleep(scaled(MARKET_MS.image));
        res.writeHead(200, { "content-type": "image/png", "content-length": PNG_1x1.length });
        return res.end(PNG_1x1);
      }

      if (host === "www.ebay.com") {
        await sleep(scaled(MARKET_MS.page));
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(`<html><head><meta property="og:title" content="Men's waxed cotton field jacket olive L"><meta property="og:image" content="https://i.ebayimg.com/images/g/sim/s-l500.jpg"><meta property="product:price:amount" content="95.00"></head><body>listing</body></html>`);
      }

      // Any other page: a size guide, for the fit lookup.
      await sleep(scaled(MARKET_MS.page));
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<html><body><h1>Size chart</h1><table><tr><td>S</td><td>36-38</td></tr><tr><td>M</td><td>38-40</td></tr><tr><td>L</td><td>40-42</td></tr></table></body></html>`);
    } catch (err) {
      json({ error: err.message }, 500);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        stats,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
