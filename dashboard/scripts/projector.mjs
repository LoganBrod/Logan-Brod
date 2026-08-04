#!/usr/bin/env node
/**
 * Launch the dashboard fullscreen on the projector and nothing else.
 *
 *   npm run projector              # projector to the right of the monitor
 *   PROJECTOR_X=2560 npm run projector
 *   PROJECTOR_X=-1920 npm run projector   # projector on the LEFT
 *
 * Chrome places a window by absolute desktop coordinates, and an extended
 * display starts where the primary one ends. So the offset is your primary
 * monitor's width in pixels — 1920 for a standard 1080p or 1440p-at-100%
 * setup, 2560 for a 1440p panel reported at full width, negative if the
 * projector sits to the left in your arrangement.
 *
 * If the window opens on the wrong screen, that number is the only thing to
 * change.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORT = process.env.PORT ?? "3001";
const URL = `http://localhost:${PORT}/`;
const OFFSET_X = process.env.PROJECTOR_X ?? "1920";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * A profile directory of our own.
 *
 * This matters more than it looks. If Chrome is already running, launching it
 * again just hands the URL to the existing process and silently ignores every
 * command-line flag — no kiosk, no window position, and no obvious reason why.
 * A separate --user-data-dir forces a genuinely new instance that honours them.
 *
 * It is persistent rather than temporary so the microphone permission is
 * granted once and remembered, instead of prompting on the wall every time.
 */
const PROFILE = path.join(here, "..", ".projector-profile");

const CANDIDATES = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ],
};

function findBrowser() {
  if (process.env.BROWSER_PATH) return process.env.BROWSER_PATH;
  const list = CANDIDATES[process.platform] ?? CANDIDATES.linux;
  return list.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

async function serverIsUp() {
  try {
    // AbortSignal.timeout stops this hanging when nothing is listening.
    const response = await fetch(URL, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

const running = await serverIsUp();
if (!running) {
  console.error(
    `Nothing is serving ${URL}.\n` +
      `Start it first, in another terminal:\n\n  npm run dev\n`,
  );
  process.exit(1);
}

const browser = findBrowser();
if (!browser) {
  console.error(
    `Could not find Chrome, Chromium or Edge.\n` +
      `Set BROWSER_PATH to the executable, or open ${URL} yourself, drag it ` +
      `onto the projector and press F11.\n`,
  );
  process.exit(1);
}

mkdirSync(PROFILE, { recursive: true });

const args = [
  `--user-data-dir=${PROFILE}`,
  "--kiosk", // fullscreen, no tabs, no address bar
  `--window-position=${OFFSET_X},0`,
  "--start-fullscreen",
  "--noerrdialogs",
  "--disable-session-crashed-bubble",
  // Stop Chrome throttling timers and rendering when the window is not
  // focused. Without this the clock stops ticking and the 60-second refresh
  // stalls the moment you click back to your editor — which is the normal
  // state for a wall display.
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  URL,
];

console.log(`Launching on the projector at x=${OFFSET_X}.`);
console.log(`Wrong screen? Re-run with PROJECTOR_X set to your primary`);
console.log(`monitor's width, or a negative value if it is on the left.`);
console.log(`Quit with Alt+F4 (macOS: Cmd+Q).\n`);

const child = spawn(browser, args, { detached: true, stdio: "ignore" });
child.unref();
