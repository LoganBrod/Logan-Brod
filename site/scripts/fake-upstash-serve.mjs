// Runs the in-memory Upstash stand-in on a fixed port so a local dev server can
// be pointed at it:
//
//   node scripts/fake-upstash-serve.mjs 6380
//   UPSTASH_REDIS_REST_URL=http://127.0.0.1:6380 \
//   UPSTASH_REDIS_REST_TOKEN=dev npm run dev
//
// Data lives in memory and dies with the process. Local closet testing only —
// use a real Upstash instance for anything you want to keep.

import { startFakeUpstash } from "./fake-upstash.mjs";

const requested = Number(process.argv[2] ?? 6380);
const { url } = await startFakeUpstash(requested);
console.log(`fake upstash listening on ${url}`);
