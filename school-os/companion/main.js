// Jarvis as a floating window over every app on the Mac. Option+Space (COMPANION_SHORTCUT in
// .env) shows and hides it. It never owns any data: every question goes to the dashboard's
// assistant, on this computer or on Vercel, and whatever the assistant "shows" lands in the
// Desk inside this window.
const { app, BrowserWindow, globalShortcut, ipcMain, shell, Tray, Menu, screen, systemPreferences, nativeImage } = require("electron");
const path = require("node:path");
const lib = require("./lib");

// .env lives in school-os: next to this folder when run from there, or wherever
// school-os-path.json points when this is Jarvis.app in Applications.
function schoolOsDir() {
  try { const p = require("./school-os-path.json").dir; if (require("node:fs").existsSync(path.join(p, ".env"))) return p; } catch {}
  return path.join(__dirname, "..");
}
const cfg = lib.loadConfig(path.join(schoolOsDir(), ".env"));
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
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", (e) => e.preventDefault());

ipcMain.handle("config", () => ({ name: cfg.name, voice: cfg.voice, base: cfg.base, shortcut: cfg.shortcut, mic: !!cfg.elevenKey }));
ipcMain.handle("ask", async (_e, messages) => {
  const r = await lib.ask(cfg, messages);
  if (r.navigate) shell.openExternal(`${cfg.base}${r.navigate}`);
  return r;
});
ipcMain.handle("transcribe", (_e, bytes, mime) => lib.transcribe(cfg, Buffer.from(bytes), mime));
ipcMain.handle("speak", (_e, text) => lib.speak(cfg, text));
ipcMain.handle("open", (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle("hide", () => win && win.hide());
