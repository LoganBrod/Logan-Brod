// Jarvis as a floating window over every app on the Mac. Option+Space (COMPANION_SHORTCUT in
// .env) shows and hides it. It never owns any data: every question goes to the dashboard's
// assistant, on this computer or on Vercel, and whatever the assistant "shows" lands in the
// Desk inside this window.
const { app, BrowserWindow, globalShortcut, ipcMain, shell, Tray, Menu, screen, systemPreferences, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const lib = require("./lib");

// .env lives in school-os: next to this folder when run from there, or wherever
// school-os-path.json points when this is Jarvis.app in Applications.
function schoolOsDir() {
  try { const p = require("./school-os-path.json").dir; if (fs.existsSync(path.join(p, ".env"))) return p; } catch {}
  return path.join(__dirname, "..");
}
const SCHOOL_OS = schoolOsDir();
const cfg = lib.loadConfig(path.join(SCHOOL_OS, ".env"));

// ---- the dashboard on this computer, started here when it is not already running ----
let dashboard = null, starting = null;
function nodeBinary() {
  try { const n = require("./school-os-path.json").node; if (n && fs.existsSync(n)) return n; } catch {}
  for (const c of ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]) if (fs.existsSync(c)) return c;
  return "node";
}
function status(text) { if (win && !win.isDestroyed()) win.webContents.send("status", text); }
async function ensureDashboard() {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(cfg.base)) return;
  if (await lib.reachable(cfg.base)) return;
  if (starting) return starting;
  starting = (async () => {
    const next = path.join(SCHOOL_OS, "node_modules", "next", "dist", "bin", "next");
    if (!fs.existsSync(next)) throw new Error(`the dashboard is not installed in ${SCHOOL_OS} (run npm install there)`);
    const built = fs.existsSync(path.join(SCHOOL_OS, "dashboard", ".next", "BUILD_ID"));
    const port = new URL(cfg.base).port || "3210";
    status(built ? "starting the dashboard…" : "starting the dashboard (first time is slow)…");
    dashboard = spawn(nodeBinary(), [next, built ? "start" : "dev", "dashboard", "-p", port], {
      cwd: SCHOOL_OS, stdio: "ignore", detached: false,
      env: { ...process.env, PATH: `${path.dirname(nodeBinary())}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}` },
    });
    dashboard.on("exit", () => { dashboard = null; });
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await lib.reachable(cfg.base)) { status(""); return; }
      if (!dashboard) break;
    }
    throw new Error("the dashboard did not start; run npm run dashboard in school-os to see why");
  })().finally(() => { starting = null; });
  return starting;
}
const WIDTH = 440, HEIGHT = 680;
let win = null, tray = null;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: WIDTH, height: HEIGHT, minWidth: 360, minHeight: 320,
    x: workArea.x + workArea.width - WIDTH - 16, y: workArea.y + Math.max(16, Math.round((workArea.height - HEIGHT) / 2)),
    frame: false, transparent: true, hasShadow: true, alwaysOnTop: true, resizable: true, show: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.on("close", (e) => { if (!app.quitting) { e.preventDefault(); win.hide(); } });
}

function toggle() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) { win.hide(); return; }
  win.show(); win.focus(); win.webContents.send("focus-input");
}

app.whenReady().then(async () => {
  if (process.platform === "darwin") { app.dock.hide(); await systemPreferences.askForMediaAccess("microphone").catch(() => {}); }
  createWindow();
  if (!globalShortcut.register(cfg.shortcut, toggle)) {
    console.warn(`Could not take ${cfg.shortcut} (something else uses it). Using Control+Alt+J. Set COMPANION_SHORTCUT in .env to change it.`);
    globalShortcut.register("Control+Alt+J", toggle);
  }
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "trayTemplate.png"));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Jarvis");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Show Jarvis (${cfg.shortcut})`, click: () => { win.show(); win.focus(); win.webContents.send("focus-input"); } },
    { label: "Open the dashboard", click: () => shell.openExternal(cfg.base) },
    { type: "separator" },
    { label: "Quit", click: () => { app.quitting = true; app.quit(); } },
  ]));
  tray.on("click", toggle);
  win.show(); win.focus();
  ensureDashboard().catch((e) => status(String(e.message || e)));
});

app.on("will-quit", () => { globalShortcut.unregisterAll(); if (dashboard) dashboard.kill(); });
app.on("window-all-closed", (e) => e.preventDefault());

ipcMain.handle("config", () => ({ name: cfg.name, voice: cfg.voice, base: cfg.base, shortcut: cfg.shortcut, mic: !!cfg.elevenKey }));
ipcMain.handle("ask", async (_e, messages) => {
  await ensureDashboard();
  const r = await lib.ask(cfg, messages);
  if (r.navigate) shell.openExternal(`${cfg.base}${r.navigate}`);
  return r;
});
ipcMain.handle("transcribe", (_e, bytes, mime) => lib.transcribe(cfg, Buffer.from(bytes), mime));
ipcMain.handle("speak", (_e, text) => lib.speak(cfg, text));
ipcMain.handle("open", (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle("hide", () => win && win.hide());
