"use client";
// The iPad notebook, in the Notability mould: import a PDF or photos (or open a file the brain
// already pulled from Schoology), each page becomes paper you write on with the Pencil, then Save
// flattens ink onto the pages into one PDF that lands in the vault's inbox under the course.
import { useEffect, useRef, useState, useCallback } from "react";
import { PencilSimple, Eraser, ArrowCounterClockwise, ArrowClockwise, Plus, CaretLeft, CaretRight, TextT, Check, Trash, HighlighterCircle, FilePlus, FolderOpen, X } from "@phosphor-icons/react";
import { jpegsToPdf } from "@/lib/pdf";
import { readJson } from "@/lib/client";

type Pt = { x: number; y: number; p: number };
type Stroke = { pts: Pt[]; width: number; color: string; kind: "pen" | "hl" | "erase" };
type Page = { w: number; h: number; bg?: string; strokes: Stroke[] };
type Doc = { pages: Page[]; text: string; course: string; title: string; mode: "pen" | "text" };
type Source = { rel: string; name: string; unit: string; size: number };

const COLORS = ["#17181c", "#1d4ed8", "#b91c1c", "#15803d"];
const HL = "#fde047";
const BLANK = (): Page => ({ w: 1200, h: 1600, strokes: [] });

// ---- IndexedDB: the working note survives a refresh, an app switch, a dead battery ----
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open("sos-notebook", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbGet<T>(k: string): Promise<T | null> { try { const db = await idb(); return await new Promise((res) => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => res(t.result ?? null); t.onerror = () => res(null); }); } catch { return null; } }
async function idbSet(k: string, v: unknown) { try { const db = await idb(); db.transaction("kv", "readwrite").objectStore("kv").put(v, k); } catch {} }

export function Notebook({ courses, cloud }: { courses: string[]; cloud: boolean }) {
  const [doc, setDoc] = useState<Doc>({ pages: [BLANK()], text: "", course: courses[0] ?? "", title: "", mode: "pen" });
  const [page, setPage] = useState(0);
  const [tool, setTool] = useState<"pen" | "hl" | "erase">("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(3);
  const [penOnly, setPenOnly] = useState(false);
  const [status, setStatus] = useState("");
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [picker, setPicker] = useState<Source[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bgImg = useRef<Map<string, HTMLImageElement>>(new Map());
  const live = useRef<Stroke | null>(null);
  const scale = useRef(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const cur = doc.pages[page] ?? doc.pages[0];

  useEffect(() => { idbGet<Doc>("doc").then((d) => { if (d && d.pages?.length) { setDoc({ ...d, course: courses.includes(d.course) ? d.course : (courses[0] ?? "") }); } setLoaded(true); }); }, [courses]);
  useEffect(() => { if (loaded) void idbSet("doc", doc); }, [doc, loaded]);
  const patch = (f: (d: Doc) => Doc) => setDoc((d) => f(d));
  const patchPage = (f: (p: Page) => Page) => patch((d) => ({ ...d, pages: d.pages.map((p, i) => (i === page ? f(p) : p)) }));

  // ---- drawing ----
  const image = useCallback((src: string) => {
    const have = bgImg.current.get(src);
    if (have) return have.complete ? have : null;
    const img = new Image(); img.src = src; bgImg.current.set(src, img);
    img.onload = () => draw();
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const draw = useCallback(() => {
    const c = canvas.current, p = doc.pages[page]; if (!c || !p) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr * scale.current, 0, 0, dpr * scale.current, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#fbfbf8"; ctx.fillRect(0, 0, p.w, p.h);
    if (p.bg) { const img = image(p.bg); if (img) ctx.drawImage(img, 0, 0, p.w, p.h); }
    else { ctx.strokeStyle = "#e6e6df"; ctx.lineWidth = 1; for (let y = 120; y < p.h; y += 60) { ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(p.w - 60, y); ctx.stroke(); } }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const s of [...p.strokes, ...(live.current ? [live.current] : [])]) paint(ctx, s, "#fbfbf8");
  }, [doc.pages, page, image]);

  useEffect(() => {
    const c = canvas.current, p = doc.pages[page]; if (!c || !p) return;
    const fit = () => {
      const box = c.parentElement!.getBoundingClientRect();
      scale.current = Math.min(box.width / p.w, (window.innerHeight - 170) / p.h);
      const dpr = window.devicePixelRatio || 1;
      c.width = p.w * scale.current * dpr; c.height = p.h * scale.current * dpr;
      c.style.width = `${p.w * scale.current}px`; c.style.height = `${p.h * scale.current}px`;
      draw();
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [draw, doc.pages, page]);
  useEffect(draw, [draw]);

  const pt = (e: { clientX: number; clientY: number; pressure: number }): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale.current, y: (e.clientY - r.top) / scale.current, p: e.pressure || 0.5 };
  };
  function down(e: React.PointerEvent) {
    if (doc.mode !== "pen") return;
    if (e.pointerType === "pen" && !penOnly) setPenOnly(true);
    if (penOnly && e.pointerType === "touch") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    live.current = { pts: [pt(e)], width: tool === "erase" ? 30 : tool === "hl" ? 26 : size, color: tool === "hl" ? HL : color, kind: tool };
    draw();
  }
  function move(e: React.PointerEvent) {
    if (!live.current) return;
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
    for (const ce of evs.length ? evs : [e.nativeEvent as PointerEvent]) live.current.pts.push(pt(ce));
    draw();
  }
  function up() {
    const s = live.current; if (!s) return; live.current = null;
    if (s.pts.length === 1) s.pts.push({ ...s.pts[0], x: s.pts[0].x + 0.5 });
    patchPage((p) => ({ ...p, strokes: [...p.strokes, s] })); setRedo([]);
  }
  const undo = () => { const last = cur.strokes.at(-1); if (!last) return; setRedo((r) => [...r, last]); patchPage((p) => ({ ...p, strokes: p.strokes.slice(0, -1) })); };
  const redoOne = () => { const s = redo.at(-1); if (!s) return; setRedo((r) => r.slice(0, -1)); patchPage((p) => ({ ...p, strokes: [...p.strokes, s] })); };
  const addPage = () => { patch((d) => ({ ...d, pages: [...d.pages.slice(0, page + 1), BLANK(), ...d.pages.slice(page + 1)] })); setPage(page + 1); };
  const deletePage = () => { if (doc.pages.length === 1) { patchPage(() => BLANK()); return; } patch((d) => ({ ...d, pages: d.pages.filter((_, i) => i !== page) })); setPage(Math.max(0, page - 1)); };
  const clearAll = () => { if (confirm("Start a new note? The current one is cleared.")) { setDoc((d) => ({ ...d, pages: [BLANK()], text: "", title: "" })); setPage(0); setRedo([]); } };

  // ---- importing: a PDF or photos, from the iPad or from the vault ----
  async function importFiles(files: File[] | { url: string; name: string }[]) {
    setStatus("Importing…");
    try {
      const pages: Page[] = [];
      for (const f of files) {
        const name = f.name.toLowerCase();
        const blob = f instanceof File ? f : await (await fetch(f.url)).blob();
        if (name.endsWith(".pdf")) pages.push(...(await pdfPages(blob)));
        else pages.push(await imagePage(blob));
      }
      if (!pages.length) { setStatus("Nothing importable in that."); return; }
      patch((d) => {
        const empty = d.pages.length === 1 && !d.pages[0].strokes.length && !d.pages[0].bg;
        return { ...d, mode: "pen", pages: empty ? pages : [...d.pages, ...pages], title: d.title || (files[0].name.replace(/\.[^.]+$/, "").slice(0, 60)) };
      });
      setPage(0);
      setStatus(`${pages.length} page${pages.length === 1 ? "" : "s"} in. Write on them.`);
    } catch (e) { setStatus(`Could not import: ${e instanceof Error ? e.message : String(e)}`); }
  }
  async function openPicker() {
    const data = await readJson<{ files: Source[]; cloud?: boolean }>(await fetch(`/api/sources?course=${encodeURIComponent(doc.course)}`));
    if (data.cloud) { setStatus("On the phone copy, use Import and pick the file from the Google Drive app."); return; }
    setPicker(data.files);
  }

  // ---- saving ----
  async function save() {
    if (!doc.course) { setStatus("Pick a course first."); return; }
    setStatus("Saving…");
    try {
      const body: Record<string, string> = { course: doc.course, title: doc.title };
      if (doc.mode === "text") {
        if (!doc.text.trim()) { setStatus("Nothing to save yet."); return; }
        body.text = doc.text;
      } else {
        const keep = doc.pages.filter((p) => p.bg || p.strokes.some((s) => s.kind !== "erase"));
        if (!keep.length) { setStatus("Nothing to save yet."); return; }
        const jpegs: { jpeg: Uint8Array; width: number; height: number }[] = [];
        for (const p of keep) jpegs.push(await renderPage(p, bgImg.current));
        const pdf = jpegsToPdf(jpegs);
        let bin = ""; for (let i = 0; i < pdf.length; i += 0x8000) bin += String.fromCharCode(...pdf.subarray(i, i + 0x8000));
        body.pdf = btoa(bin);
      }
      const res = await fetch("/api/write", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await readJson<{ ok?: boolean; error?: string }>(res);
      if (data.error) throw new Error(data.error);
      setStatus(cloud ? "Saved. It reaches the Mac on its next sync and is filed from there." : "Saved to the inbox. It is filed within 30 minutes.");
      setDoc((d) => ({ ...d, pages: [BLANK()], text: "", title: "" })); setPage(0); setRedo([]);
    } catch (e) { setStatus(`Could not save: ${e instanceof Error ? e.message : String(e)}`); }
  }

  const btn = "pressable rounded-xl px-3 py-2 text-sm flex items-center gap-1.5";
  const on = { background: "var(--text)", color: "var(--bg)" } as const;
  const off = { background: "var(--glass-2)", color: "var(--text)" } as const;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={doc.course} onChange={(e) => patch((d) => ({ ...d, course: e.target.value }))} className="rounded-xl px-3 py-2 text-sm" style={{ background: "var(--glass-2)", border: "1px solid var(--line)" }}>
          {courses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={doc.title} onChange={(e) => patch((d) => ({ ...d, title: e.target.value }))} placeholder="Title" className="rounded-xl px-3 py-2 text-sm min-w-36 flex-1 outline-none" style={{ background: "var(--glass-2)", border: "1px solid var(--line)", color: "var(--text)" }} />
        <button onClick={() => fileInput.current?.click()} className={btn} style={off}><FilePlus size={16} /> Import</button>
        <input ref={fileInput} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) void importFiles(fs); }} />
        {!cloud && <button onClick={openPicker} className={btn} style={off}><FolderOpen size={16} /> From {doc.course.split(" ")[0] || "course"}</button>}
        <button onClick={() => patch((d) => ({ ...d, mode: d.mode === "pen" ? "text" : "pen" }))} className={btn} style={doc.mode === "text" ? on : off}><TextT size={16} /> Type</button>
        <span className="grow" />
        <button onClick={save} className={btn} style={on}><Check size={16} /> Save</button>
      </div>

      {doc.mode === "pen" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setTool("pen")} className={btn} style={tool === "pen" ? on : off} title="Pen"><PencilSimple size={16} /></button>
            <button onClick={() => setTool("hl")} className={btn} style={tool === "hl" ? on : off} title="Highlighter"><HighlighterCircle size={16} /></button>
            <button onClick={() => setTool("erase")} className={btn} style={tool === "erase" ? on : off} title="Eraser"><Eraser size={16} /></button>
            <span className="flex items-center gap-1 px-1">
              {COLORS.map((c) => <button key={c} onClick={() => { setColor(c); setTool("pen"); }} aria-label="Pen colour" className="w-6 h-6 rounded-full" style={{ background: c, outline: color === c && tool === "pen" ? "2px solid var(--text)" : "2px solid transparent", outlineOffset: 2 }} />)}
            </span>
            <span className="flex items-center gap-1 px-1">
              {[2, 3, 5].map((w) => <button key={w} onClick={() => setSize(w)} aria-label="Pen size" className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: size === w ? "var(--glass-2)" : "transparent" }}><span className="rounded-full" style={{ width: w * 2 + 2, height: w * 2 + 2, background: "var(--text)" }} /></button>)}
            </span>
            <button onClick={undo} className={btn} style={off} title="Undo"><ArrowCounterClockwise size={16} /></button>
            <button onClick={redoOne} className={btn} style={off} title="Redo"><ArrowClockwise size={16} /></button>
            <span className="grow" />
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className={btn + " disabled:opacity-40"} style={off}><CaretLeft size={16} /></button>
            <span className="mono text-xs" style={{ color: "var(--muted)" }}>{page + 1} / {doc.pages.length}</span>
            <button onClick={() => setPage(Math.min(doc.pages.length - 1, page + 1))} disabled={page === doc.pages.length - 1} className={btn + " disabled:opacity-40"} style={off}><CaretRight size={16} /></button>
            <button onClick={addPage} className={btn} style={off} title="Blank page after this one"><Plus size={16} /></button>
            <button onClick={deletePage} className={btn} style={off} title="Delete this page"><Trash size={16} /></button>
            <button onClick={() => setPenOnly(!penOnly)} className={btn} style={penOnly ? on : off} title="When on, fingers don't draw">{penOnly ? "Pencil only" : "Finger draws"}</button>
            <button onClick={clearAll} className={btn} style={off}><X size={16} /> New</button>
          </div>
          <div className="w-full flex justify-center" style={{ touchAction: "none" }}>
            <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
              className="rounded-xl" style={{ touchAction: "none", cursor: "crosshair", boxShadow: "0 30px 80px -30px rgb(0 0 0 / 0.7)" }} />
          </div>
        </>
      ) : (
        <textarea value={doc.text} onChange={(e) => patch((d) => ({ ...d, text: e.target.value }))} placeholder="Type your notes. Markdown works: # headings, - lists, **bold**." spellCheck
          className="w-full rounded-2xl p-5 text-[16px] leading-relaxed outline-none" style={{ minHeight: "60vh", background: "#fbfbf8", color: "#151515", border: "1px solid var(--line)" }} />
      )}
      {status && <p className="text-sm" style={{ color: "var(--muted)" }}>{status}</p>}

      {picker && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center p-4" style={{ background: "rgb(0 0 0 / 0.5)" }} onClick={() => setPicker(null)}>
          <div className="card w-full max-w-lg max-h-[70vh] overflow-y-auto p-4" style={{ background: "var(--solid)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h2 className="text-base font-medium">Files in {doc.course}</h2><button onClick={() => setPicker(null)} className="icon"><X size={18} /></button></div>
            {picker.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>Nothing downloaded for this course yet.</p>}
            <ul className="grid gap-1">
              {picker.map((f) => (
                <li key={f.rel}>
                  <button onClick={() => { setPicker(null); void importFiles([{ url: `/api/file?path=${encodeURIComponent(f.rel)}`, name: f.name }]); }} className="pressable w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-[var(--surface-2)]">
                    <div className="truncate">{f.name}</div>
                    <div className="mono text-[11px]" style={{ color: "var(--faint)" }}>{f.unit || "course"} · {(f.size / 1e6).toFixed(1)} MB</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function paint(ctx: CanvasRenderingContext2D, s: Stroke, paper: string) {
  const pts = s.pts; if (pts.length < 2) return;
  ctx.globalCompositeOperation = s.kind === "hl" ? "multiply" : "source-over";
  ctx.strokeStyle = s.kind === "erase" ? paper : s.color;
  ctx.globalAlpha = s.kind === "hl" ? 0.55 : 1;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    ctx.lineWidth = s.kind === "pen" ? s.width * (0.55 + b.p * 0.9) : s.width;
    ctx.beginPath(); ctx.moveTo(a.x, a.y);
    if (c) ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2); else ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}

async function imagePage(blob: Blob): Promise<Page> {
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const w = 1400, h = Math.round((w * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  return { w, h, bg: c.toDataURL("image/jpeg", 0.85), strokes: [] };
}

async function pdfPages(blob: Blob): Promise<Page[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
  const out: Page[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 60); n++) {
    const pg = await pdf.getPage(n);
    const v1 = pg.getViewport({ scale: 1 });
    const scale = 1400 / v1.width;
    const vp = pg.getViewport({ scale });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
    out.push({ w: c.width, h: c.height, bg: c.toDataURL("image/jpeg", 0.85), strokes: [] });
  }
  return out;
}

/** One page flattened: background, then ink, as a JPEG for the PDF. */
async function renderPage(p: Page, cache: Map<string, HTMLImageElement>): Promise<{ jpeg: Uint8Array; width: number; height: number }> {
  const c = document.createElement("canvas"); c.width = p.w; c.height = p.h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, p.w, p.h);
  if (p.bg) {
    let img = cache.get(p.bg);
    if (!img || !img.complete) img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = p.bg!; });
    ctx.drawImage(img, 0, 0, p.w, p.h);
  }
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const s of p.strokes) paint(ctx, { ...s, width: s.kind === "pen" ? s.width * 1.15 : s.width }, "#ffffff");
  const bin = atob(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { jpeg: bytes, width: p.w, height: p.h };
}
