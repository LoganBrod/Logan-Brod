// Everything the companion does that is not a window: read .env, talk to the dashboard's
// assistant (with the password login when it is the Vercel copy), transcribe speech with
// ElevenLabs, fetch spoken audio. Plain Node, no Electron, so it can be tested on its own.
const fs = require("node:fs");

function loadConfig(envPath) {
  const env = { ...process.env };
  try {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || m[1] in process.env) continue;
      env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2").trim();
    }
  } catch { /* no .env yet */ }
  return {
    base: (env.DASHBOARD_URL || "http://localhost:3210").replace(/\/$/, ""),
    password: env.DASHBOARD_PASSWORD || "",
    elevenKey: env.ELEVENLABS_API_KEY || "",
    name: env.USER_NAME || "",
    voice: env.VOICE_NAME || "Daniel",
    wake: env.WAKE_WORD || "jarvis",
    shortcut: env.COMPANION_SHORTCUT || "Alt+Space",
  };
}

let cookie = "";

async function login(cfg) {
  const res = await fetch(`${cfg.base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: cfg.password }) });
  if (!res.ok) throw new Error(res.status === 401 ? "the DASHBOARD_PASSWORD in .env is not the one on Vercel" : `login failed (${res.status})`);
  const set = res.headers.get("set-cookie") || "";
  const m = set.match(/sos_session=([^;]+)/);
  if (m) cookie = `sos_session=${m[1]}`;
}

async function request(cfg, path, init = {}, retry = true) {
  const res = await fetch(`${cfg.base}${path}`, { ...init, headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) } });
  if (res.status === 401 && cfg.password && retry) { await login(cfg); return request(cfg, path, init, false); }
  return res;
}

async function readJson(res) {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!res.ok && data && data.error) throw new Error(data.error);
    return data;
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(`the dashboard said ${res.status}${text.trim() ? ": " + text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) : ""}`);
    throw e;
  }
}

/** One turn with the assistant, in voice mode: short reply, things to show, a page to open. */
async function ask(cfg, messages) {
  let res;
  try {
    res = await request(cfg, "/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages, voice: true }) });
  } catch (e) {
    throw new Error(`cannot reach the dashboard at ${cfg.base}. Is it running? (npm run dashboard, or set DASHBOARD_URL in .env)`);
  }
  const data = await readJson(res);
  return { text: data.text || "", show: data.show || [], navigate: data.navigate || null, steps: data.steps || [] };
}

/** Speech to text through ElevenLabs Scribe. A few seconds of audio costs a fraction of a cent. */
async function transcribe(cfg, bytes, mime) {
  if (!cfg.elevenKey) throw new Error("no ELEVENLABS_API_KEY in .env, so the mic cannot transcribe. Type instead, or use the Mac's dictation key in the box.");
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", new Blob([bytes], { type: mime || "audio/webm" }), "speech.webm");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": cfg.elevenKey }, body: form });
  if (!res.ok) throw new Error(`ElevenLabs transcription said ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  return String(data.text || "").trim();
}

/** Spoken audio from the dashboard (ElevenLabs when it has a key), or null to use the Mac's own voice. */
async function speak(cfg, text) {
  try {
    const res = await request(cfg, "/api/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    if (res.status !== 200) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

/** Is the dashboard answering? Two seconds, then no. */
async function reachable(base) {
  try {
    const res = await fetch(`${base}/login`, { redirect: "manual", signal: AbortSignal.timeout(2000) });
    return res.status > 0 && res.status < 500;
  } catch { return false; }
}

module.exports = { loadConfig, ask, transcribe, speak, login, reachable };
