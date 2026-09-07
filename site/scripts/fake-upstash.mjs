// A tiny in-memory stand-in for the Upstash REST API, enough to exercise the
// closet round-trip (SET/GET/EXPIRE/DEL, including the NX flag the code
// allocator depends on) without real credentials.
//
// Test support only — never imported by the app.

import { createServer } from "node:http";

export function startFakeUpstash(port = 0, opts = {}) {
  const store = new Map(); // key -> { value, expiresAt | null }
  // For the load simulation: how many commands, of which kinds, and a fixed
  // per-command delay standing in for the network hop a real Upstash costs.
  const stats = { total: 0, requests: 0, byCommand: new Map() };
  const latencyMs = Number(opts.latencyMs ?? 0);

  const live = (key) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry;
  };

  /** The live value at a key, created empty when there is none. */
  const container = (key, make) => {
    let entry = live(key);
    if (!entry) {
      entry = { value: make(), expiresAt: null };
      store.set(key, entry);
    }
    return entry.value;
  };

  const run = (args) => {
    const [command, ...rest] = args;
    const name = String(command).toUpperCase();
    stats.total += 1;
    stats.byCommand.set(name, (stats.byCommand.get(name) ?? 0) + 1);
    switch (name) {
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
      case "TTL": {
        // -2 missing, -1 no expiry, otherwise seconds remaining.
        const entry = live(rest[0]);
        if (!entry) return -2;
        if (entry.expiresAt === null) return -1;
        return Math.ceil((entry.expiresAt - Date.now()) / 1000);
      }
      case "PERSIST": {
        // What keeping a closet does: drop the expiry, leave the value.
        const entry = live(rest[0]);
        if (!entry || entry.expiresAt === null) return 0;
        entry.expiresAt = null;
        return 1;
      }
      case "GETDEL": {
        // Read and delete atomically. A sign-in link's single use depends on
        // this being one operation rather than two.
        const entry = live(rest[0]);
        store.delete(rest[0]);
        return entry?.value ?? null;
      }
      case "INCR": {
        const entry = live(rest[0]);
        const next = Number(entry?.value ?? 0) + 1;
        store.set(rest[0], { value: String(next), expiresAt: entry?.expiresAt ?? null });
        return next;
      }
      // Hashes, sets and lists: what lib/yield.ts uses so that concurrent
      // writers add to a record instead of overwriting each other's copy.
      case "HSET": {
        const h = container(rest[0], () => new Map());
        let added = 0;
        for (let i = 1; i + 1 < rest.length; i += 2) {
          if (!h.has(String(rest[i]))) added += 1;
          h.set(String(rest[i]), String(rest[i + 1]));
        }
        return added;
      }
      case "HSETNX": {
        const h = container(rest[0], () => new Map());
        if (h.has(String(rest[1]))) return 0;
        h.set(String(rest[1]), String(rest[2]));
        return 1;
      }
      case "HINCRBY":
      case "HINCRBYFLOAT": {
        const h = container(rest[0], () => new Map());
        const next = Number(h.get(String(rest[1])) ?? 0) + Number(rest[2]);
        h.set(String(rest[1]), String(next));
        return name === "HINCRBY" ? next : String(next);
      }
      case "HGETALL": {
        const entry = live(rest[0]);
        if (!entry) return [];
        return [...entry.value].flat();
      }
      case "SADD": {
        const set = container(rest[0], () => new Set());
        let added = 0;
        for (const member of rest.slice(1)) {
          if (!set.has(String(member))) added += 1;
          set.add(String(member));
        }
        return added;
      }
      case "SMEMBERS": {
        const entry = live(rest[0]);
        return entry ? [...entry.value] : [];
      }
      case "LPUSH": {
        const list = container(rest[0], () => []);
        for (const item of rest.slice(1)) list.unshift(String(item));
        return list.length;
      }
      case "LTRIM": {
        const entry = live(rest[0]);
        if (!entry) return "OK";
        const stop = Number(rest[2]);
        entry.value = entry.value.slice(Number(rest[1]), stop < 0 ? entry.value.length + stop + 1 : stop + 1);
        return "OK";
      }
      case "LRANGE": {
        const entry = live(rest[0]);
        if (!entry) return [];
        const stop = Number(rest[2]);
        return entry.value.slice(Number(rest[1]), stop < 0 ? entry.value.length + stop + 1 : stop + 1);
      }
      default:
        throw new Error(`fake-upstash: unsupported command ${command}`);
    }
  };

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      const answer = () => {
        stats.requests += 1;
        try {
          if (req.url === "/pipeline") {
            // One result per command, an error in its slot rather than a
            // failed request - the shape Upstash answers with.
            const results = JSON.parse(body).map((cmd) => {
              try {
                return { result: run(cmd) };
              } catch (err) {
                return { error: err.message };
              }
            });
            res.end(JSON.stringify(results));
            return;
          }
          res.end(JSON.stringify({ result: run(JSON.parse(body)) }));
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err.message }));
        }
      };
      if (latencyMs > 0) setTimeout(answer, latencyMs);
      else answer();
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const actual = server.address().port;
      resolve({
        url: `http://127.0.0.1:${actual}`,
        store,
        stats,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
