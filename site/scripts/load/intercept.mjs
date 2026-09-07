// Preloaded into the Next server for the load simulation. Every outbound
// fetch to a host that is not loopback is redirected to the fake upstream,
// which imitates Anthropic, eBay, SerpAPI, Resend and the listing sites by
// the `x-sim-host` header. Loopback is left alone so the fake Upstash keeps
// working. Never loaded in production: it is only reached through
// NODE_OPTIONS in scripts/load/run.mjs.

const FAKE = process.env.SIM_UPSTREAM;
if (!FAKE) throw new Error("SIM_UPSTREAM is not set; intercept.mjs is only for scripts/load/run.mjs");

const real = globalThis.fetch;
const loopback = (host) => host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";

globalThis.fetch = async function simulatedFetch(input, init) {
  const isRequest = typeof Request !== "undefined" && input instanceof Request;
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : isRequest ? input.url : String(input);
  let url;
  try {
    url = new URL(href);
  } catch {
    return real(input, init);
  }
  if (loopback(url.hostname)) return real(input, init);

  const target = new URL(url.pathname + url.search, FAKE).href;
  const headers = new Headers(init?.headers ?? (isRequest ? input.headers : undefined));
  headers.set("x-sim-host", url.hostname);
  const next = { ...(init ?? {}), headers };
  if (isRequest && !init?.body && input.method !== "GET" && input.method !== "HEAD") {
    next.method = input.method;
    next.body = await input.arrayBuffer();
  }
  return real(target, next);
};
