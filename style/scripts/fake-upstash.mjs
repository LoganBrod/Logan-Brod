// A tiny in-memory stand-in for the Upstash REST API, enough to exercise the
// closet round-trip (SET/GET/EXPIRE/DEL, including the NX flag the code
// allocator depends on) without real credentials.
//
// Test support only — never imported by the app.

import { createServer } from "node:http";

export function startFakeUpstash(port = 0) {
  const store = new Map(); // key -> { value, expiresAt | null }

  const live = (key) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry;
  };

  const run = (args) => {
    const [command, ...rest] = args;
    switch (String(command).toUpperCase()) {
      case "SET": {
        const [key, value, ...flags] = rest;
        const upper = flags.map((f) => String(f).toUpperCase());
        if (upper.includes("NX") && live(key)) return null;

        const exIndex = upper.indexOf("EX");
        const ttl = exIndex === -1 ? null : Number(flags[exIndex + 1]);
        store.set(key, {
          value,
          expiresAt: ttl ? Date.now() + ttl * 1000 : null,
        });
        return "OK";
      }
      case "GET":
        return live(rest[0])?.value ?? null;
      case "EXPIRE": {
        const entry = live(rest[0]);
        if (!entry) return 0;
        entry.expiresAt = Date.now() + Number(rest[1]) * 1000;
        return 1;
      }
      case "DEL":
        return store.delete(rest[0]) ? 1 : 0;
      default:
        throw new Error(`fake-upstash: unsupported command ${command}`);
    }
  };

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      try {
        res.end(JSON.stringify({ result: run(JSON.parse(body)) }));
      } catch (err) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const actual = server.address().port;
      resolve({
        url: `http://127.0.0.1:${actual}`,
        store,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
