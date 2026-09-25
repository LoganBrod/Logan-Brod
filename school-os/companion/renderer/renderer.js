// The window: an ask bar with a mic, and the Desk of tabs the assistant fills.
// Everything that touches the network goes through window.jarvis (preload.js → main.js).
const $ = (id) => document.getElementById(id);
const input = $("input"), form = $("form"), mic = $("mic"), status = $("status"), reply = $("reply"), detail = $("detail");
const desk = $("desk"), tabsEl = $("tabs"), tabTitle = $("tabtitle"), content = $("content"), external = $("external");

let cfg = { name: "", voice: "Daniel", mic: false, shortcut: "Alt+Space" };
let history = [];
let tabs = [], active = "", busy = false;

// ---- markdown, small and safe ----
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function inline(s) {
  return esc(s)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}
function md(text) {
  const out = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let i = 0, list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { flushPara(); flushList(); const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`); i++; continue; }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushPara(); flushList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { flushPara(); flushList(); out.push("<hr>"); i++; continue; }
    const q = l.match(/^>\s?(.*)$/);
    if (q) { flushPara(); flushList(); out.push(`<blockquote>${inline(q[1])}</blockquote>`); i++; continue; }
    const li = l.match(/^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/);
    if (li) { flushPara(); const kind = li[1] ? "ol" : "ul"; if (list !== kind) { flushList(); out.push(`<${kind}>`); list = kind; } out.push(`<li>${inline(li[2])}</li>`); i++; continue; }
    if (!l.trim()) { flushPara(); flushList(); i++; continue; }
    if (l.startsWith("#flashcards")) { i++; continue; }
    para.push(l.trim()); i++;
  }
  flushPara(); flushList();
  return out.join("\n");
}
function parseDeck(body) {
  const cards = [];
  for (const block of body.split(/\n\s*\n/)) {
    const ls = block.trim().split("\n").filter((l) => !l.startsWith("#flashcards"));
    if (!ls.length) continue;
    const q = ls.findIndex((l) => l.trim() === "?");
    if (q > 0) cards.push({ q: ls.slice(0, q).join("\n"), a: ls.slice(q + 1).join("\n") });
    else for (const l of ls) { const k = l.indexOf("::"); if (k > 0) cards.push({ q: l.slice(0, k).trim(), a: l.slice(k + 2).trim() }); }
  }
  return cards;
}

// ---- desk ----
function saveTabs() { try { localStorage.setItem("desk", JSON.stringify({ tabs, active })); } catch {} }
function showItems(items) {
  if (!items || !items.length) return;
  tabs = tabs.filter((t) => !items.some((i) => i.id === t.id)).concat(items).slice(-8);
  active = items[items.length - 1].id;
  renderDesk();
}
function closeTab(id) {
  tabs = tabs.filter((t) => t.id !== id);
  if (active === id) active = tabs.length ? tabs[tabs.length - 1].id : "";
  renderDesk();
}
function renderDesk() {
  saveTabs();
  desk.classList.toggle("hidden", tabs.length === 0);
  tabsEl.innerHTML = "";
  const tab = tabs.find((t) => t.id === active) || tabs[tabs.length - 1];
  for (const t of tabs) {
    const el = document.createElement("span");
    el.className = "tab" + (t === tab ? " on" : "");
    const name = document.createElement("button"); name.className = "name"; name.textContent = t.title; name.onclick = () => { active = t.id; renderDesk(); };
    const x = document.createElement("button"); x.className = "x"; x.textContent = "×"; x.title = "Close"; x.onclick = () => closeTab(t.id);
    el.append(name, x); tabsEl.append(el);
  }
  if (!tab) { tabTitle.textContent = ""; content.innerHTML = ""; external.classList.add("hidden"); return; }
  const sub = tab.subtitle || (tab.kind === "text" ? "Written by the assistant" : tab.kind);
  tabTitle.innerHTML = `${esc(tab.title)}<small>${esc(sub)}</small>`;
  const link = tab.url || (tab.kind !== "text" && tab.id.startsWith("note:") ? `${cfg.base}/note/${encodeURI(tab.id.slice(5))}` : "");
  external.classList.toggle("hidden", !link);
  external.onclick = () => link && window.jarvis.open(link);
  if (tab.kind === "deck") renderDeck(parseDeck(tab.body));
  else content.innerHTML = md(tab.body);
  content.scrollTop = 0;
}
function renderDeck(cards) {
  if (!cards.length) { content.innerHTML = '<div class="empty">This deck has no cards yet.</div>'; return; }
  let i = 0, flipped = false;
  const draw = () => {
    const c = cards[i];
    content.innerHTML = `<button class="card" id="flipcard"><div class="k">${flipped ? "Answer" : "Question"} · ${i + 1} / ${cards.length}</div><div class="q">${esc(flipped ? c.a : c.q)}</div>${flipped ? "" : '<div class="hint">Tap to reveal</div>'}</button>
      <div class="deckbar"><button id="prev">← Back</button><button id="flip" class="flip">Flip</button><button id="next">Next →</button></div>`;
    $("flipcard").onclick = $("flip").onclick = () => { flipped = !flipped; draw(); };
    $("prev").onclick = () => { i = (i - 1 + cards.length) % cards.length; flipped = false; draw(); };
    $("next").onclick = () => { i = (i + 1) % cards.length; flipped = false; draw(); };
  };
  draw();
}

// ---- asking ----
function setStatus(s, listening = false) { status.textContent = s; status.classList.toggle("listening", listening); }
async function ask(q) {
  q = q.trim();
  if (!q || busy) return;
  busy = true; input.value = ""; setStatus("thinking…"); reply.textContent = ""; detail.textContent = "";
  history = [...history.slice(-8), { role: "user", content: q }];
  try {
    const r = await window.jarvis.ask(history);
    history = [...history, { role: "assistant", content: r.text }];
    const [first, ...rest] = r.text.split(/\n-{3,}\n/);
    reply.innerHTML = inline(first.trim()).replace(/\n/g, "<br>");
    detail.textContent = rest.join("\n").trim() + (r.steps && r.steps.length ? `\n${r.steps.join(" · ")}` : "");
    showItems(r.show);
    setStatus("");
    await say(first.trim());
  } catch (e) {
    reply.textContent = `Could not reach the assistant: ${e.message || e}`;
    setStatus("");
  } finally { busy = false; }
}
form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });

// ---- speaking ----
let audio = null;
async function say(text) {
  const spoken = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ").slice(0, 280);
  if (!spoken) return;
  stopSpeaking();
  try {
    const bytes = await window.jarvis.speak(spoken);
    if (bytes && bytes.byteLength) {
      audio = new Audio(URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })));
      await audio.play().catch(() => {});
      return;
    }
  } catch {}
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(spoken);
  const v = speechSynthesis.getVoices().find((x) => x.name === cfg.voice) || speechSynthesis.getVoices().find((x) => /^en/.test(x.lang));
  if (v) u.voice = v;
  u.rate = 1.02;
  speechSynthesis.speak(u);
}
function stopSpeaking() { if (audio) { audio.pause(); audio = null; } window.speechSynthesis && speechSynthesis.cancel(); }

// ---- the mic: tap to start, stops itself after a pause, or tap again ----
let rec = null, stream = null, chunks = [], silence = null, spoke = false, level = null;
async function startRec() {
  if (rec) return;
  if (!cfg.mic) { setStatus("mic needs ELEVENLABS_API_KEY; type instead"); return; }
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { setStatus("mic blocked: System Settings → Privacy → Microphone"); return; }
  stopSpeaking();
  chunks = []; spoke = false;
  rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = finishRec;
  rec.start(250);
  mic.classList.add("on"); setStatus("listening…", true);
  // Watch the level: once he has spoken, 1.3 s of quiet ends the take.
  const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  let quietSince = 0;
  level = setInterval(() => {
    an.getByteTimeDomainData(buf);
    let sum = 0; for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
    const rms = Math.sqrt(sum / buf.length);
    const now = Date.now();
    if (rms > 0.02) { spoke = true; quietSince = 0; }
    else if (spoke) { if (!quietSince) quietSince = now; else if (now - quietSince > 1300) stopRec(); }
  }, 100);
  silence = setTimeout(() => stopRec(), 15000);
  level.ctx = ctx;
}
function stopRec() { if (rec && rec.state !== "inactive") rec.stop(); }
async function finishRec() {
  clearTimeout(silence); if (level) { clearInterval(level); level.ctx && level.ctx.close(); level = null; }
  stream && stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: "audio/webm" }); rec = null; stream = null;
  mic.classList.remove("on");
  if (!spoke || blob.size < 2000) { setStatus(""); return; }
  setStatus("transcribing…");
  try {
    const text = await window.jarvis.transcribe(new Uint8Array(await blob.arrayBuffer()), "audio/webm");
    if (!text) { setStatus("did not catch that"); return; }
    input.value = text; setStatus("");
    await ask(text);
  } catch (e) { setStatus(String(e.message || e).slice(0, 80)); }
}
mic.addEventListener("click", () => (rec ? stopRec() : startRec()));

// ---- keys and focus ----
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { stopSpeaking(); window.jarvis.hide(); }
  if (e.key === " " && e.metaKey) { e.preventDefault(); rec ? stopRec() : startRec(); }
});
$("hide").onclick = () => window.jarvis.hide();
window.jarvis.onFocus(() => { input.focus(); input.select(); });
window.jarvis.onStatus((text) => { if (!busy) setStatus(text); });

(async () => {
  cfg = await window.jarvis.config();
  if (!cfg.mic) mic.classList.add("off");
  try { const saved = JSON.parse(localStorage.getItem("desk") || "null"); if (saved && saved.tabs) { tabs = saved.tabs; active = saved.active; } } catch {}
  renderDesk();
  input.placeholder = cfg.mic ? "Ask, or tap the mic and say what to pull up…" : "Ask, or say what to pull up (dictation key works here)…";
  input.focus();
})();
