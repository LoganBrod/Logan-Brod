// The cost meter.
//
//   npm test
//
// This is instrumentation, so the bar it has to clear is that it can never
// affect the thing it measures: silent when off, silent on malformed input,
// and incapable of throwing. A metering bug that fails a closet run would cost
// more than the measurement is worth.

import assert from "node:assert/strict";
import test from "node:test";

const meter = await import("../lib/meter.ts");

/** Capture whatever the meter writes to stdout during `fn`. */
function captureLog(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines;
}

const withFlag = (value, fn) => {
  const before = process.env.COST_LOG;
  if (value === null) delete process.env.COST_LOG;
  else process.env.COST_LOG = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.COST_LOG;
    else process.env.COST_LOG = before;
  }
};

const usage = { input_tokens: 10_000, output_tokens: 2_000, cache_creation_input_tokens: null, cache_read_input_tokens: null };

// ------------------------------------------------------------------ the gate

test("silent unless COST_LOG=1", () => {
  for (const flag of [null, "", "0", "true", "yes"]) {
    const lines = withFlag(flag, () =>
      captureLog(() => meter.meter({ op: "x", model: "claude-opus-5", usage }))
    );
    assert.equal(lines.length, 0, `COST_LOG=${JSON.stringify(flag)} should not log`);
  }
});

test("logs exactly one JSON line when enabled", () => {
  const lines = withFlag("1", () =>
    captureLog(() => meter.meter({ op: "closet.analyze", model: "claude-opus-5", usage }))
  );
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.tag, "COST");
  assert.equal(parsed.op, "closet.analyze");
});

// ------------------------------------------------------------------- pricing

test("cost is priced at the model's real rates", () => {
  const [line] = withFlag("1", () =>
    captureLog(() => meter.meter({ op: "x", model: "claude-opus-5", usage }))
  );
  // 10k input at $5/M + 2k output at $25/M = $0.05 + $0.05
  assert.equal(JSON.parse(line).cost, 0.1);
});

test("a cheaper model prices cheaper", () => {
  const [line] = withFlag("1", () =>
    captureLog(() => meter.meter({ op: "x", model: "claude-haiku-4-5", usage }))
  );
  // 10k at $1/M + 2k at $5/M = $0.01 + $0.01
  assert.equal(JSON.parse(line).cost, 0.02);
});

test("cached tokens are priced separately from fresh input", () => {
  const [line] = withFlag("1", () =>
    captureLog(() =>
      meter.meter({
        op: "x",
        model: "claude-opus-5",
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 1_000_000,
          cache_read_input_tokens: 1_000_000,
        },
      })
    )
  );
  const parsed = JSON.parse(line);
  // $6.25 write + $0.50 read
  assert.equal(parsed.cost, 6.75);
  assert.equal(parsed.cacheRead, 1_000_000);
});

test("an unknown model falls back to Opus rates rather than free", () => {
  const [line] = withFlag("1", () =>
    captureLog(() => meter.meter({ op: "x", model: "claude-something-new", usage }))
  );
  assert.equal(JSON.parse(line).cost, 0.1, "an unpriced model must not read as costing nothing");
});

// -------------------------------------------------------------------- images

test("image tokens follow the (w × h) / 750 rule", () => {
  assert.equal(meter.imageTokens(1568, 1176), 2459);
  assert.equal(meter.imageTokens(400, 400), 213);
});

test("image dimensions are summarised in the line", () => {
  const [line] = withFlag("1", () =>
    captureLog(() =>
      meter.meter({
        op: "curate",
        model: "claude-opus-5",
        usage,
        images: [{ w: 400, h: 400 }, { w: 400, h: 300 }, null],
      })
    )
  );
  const parsed = JSON.parse(line);
  assert.equal(parsed.images, 3, "an unparseable image still counts as sent");
  assert.deepEqual(parsed.imageDims, ["400x400", "400x300"]);
  assert.equal(parsed.imageTokens, 213 + 160);
});

test("a PNG header is read correctly", () => {
  // 1×1 PNG.
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  assert.deepEqual(meter.imageSize(png), { w: 1, h: 1 });
});

test("garbage in the image slot yields null, not a throw", () => {
  assert.equal(meter.imageSize("not base64 at all !!!"), null);
  assert.equal(meter.imageSize(""), null);
});

// ------------------------------------------------------------------ hardiness

test("never throws, whatever it is handed", () => {
  withFlag("1", () => {
    captureLog(() => {
      meter.meter({ op: "x", model: "claude-opus-5", usage: null });
      meter.meter({ op: "x", model: "claude-opus-5", usage: undefined });
      meter.meter({ op: "x", model: "claude-opus-5", usage: {} });
      // A circular `extra` makes JSON.stringify throw — the meter must absorb it.
      const circular = {};
      circular.self = circular;
      meter.meter({ op: "x", model: "claude-opus-5", usage, extra: circular });
    });
  });
});

test("missing usage reads as zero cost, not NaN", () => {
  const [line] = withFlag("1", () =>
    captureLog(() => meter.meter({ op: "x", model: "claude-opus-5", usage: {} }))
  );
  assert.equal(JSON.parse(line).cost, 0);
});
