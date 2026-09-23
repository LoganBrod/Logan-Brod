// Send a short text to the student's phone. Three ways, picked from .env:
//
//   iMessage   PHONE_NUMBER, on a Mac that is signed into Messages. Free. The brain runs on
//              the Mac, so it asks the Messages app to send the text, like you typed it.
//   Twilio     PHONE_NUMBER + TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM. Real SMS
//              from a Twilio number, about a cent per text plus a dollar a month for the number.
//   ntfy       NTFY_TOPIC. Free push notification through the ntfy app, iPhone or Android.
//
// Twilio wins when its keys are set, otherwise iMessage when PHONE_NUMBER is set and this is a
// Mac. ntfy is sent in addition whenever NTFY_TOPIC is set. PHONE_CHANNEL=imessage|twilio|none
// forces a choice. Nothing here throws: a failed send is logged and the caller carries on.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const env = (k: string) => (process.env[k] ?? "").trim();

/** Markdown from the brief → something that reads well as a text message. */
export function plainText(md: string): string {
  return md
    .replace(/^#{1,6}\s*(.+)$/gm, (_, h: string) => `\n${h.trim().toUpperCase()}`)
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*|__|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function phoneChannels(): string[] {
  const forced = env("PHONE_CHANNEL").toLowerCase();
  const out: string[] = [];
  const twilio = env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_FROM");
  if (env("PHONE_NUMBER") && forced !== "none") {
    if (forced === "twilio" || (!forced && twilio)) out.push("twilio");
    else if (forced === "imessage" || (!forced && process.platform === "darwin")) out.push("imessage");
  }
  if (env("NTFY_TOPIC") && forced !== "none") out.push("ntfy");
  return out;
}

/** Sends on every configured channel. Returns the channels that worked. */
export async function sendToPhone(text: string, title = "School OS"): Promise<string[]> {
  const body = text.trim().slice(0, 1500);
  const ok: string[] = [];
  for (const ch of phoneChannels()) {
    try {
      if (ch === "twilio") await twilio(body);
      else if (ch === "imessage") await imessage(body);
      else if (ch === "ntfy") await ntfy(body, title);
      ok.push(ch);
    } catch (err) {
      console.error(`phone (${ch}): ${err instanceof Error ? err.message : err}`);
    }
  }
  return ok;
}

async function twilio(body: string) {
  const sid = env("TWILIO_ACCOUNT_SID"), token = env("TWILIO_AUTH_TOKEN");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: env("PHONE_NUMBER"), From: env("TWILIO_FROM"), Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio said ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function imessage(body: string) {
  if (process.platform !== "darwin") throw new Error("iMessage only works from a Mac");
  // The text and number travel as arguments, never inside the script, so quotes and newlines are safe.
  const script = [
    "on run argv",
    'tell application "Messages"',
    "set svc to 1st account whose service type = iMessage",
    "send (item 2 of argv) to participant (item 1 of argv) of svc",
    "end tell",
    "end run",
  ].flatMap((l) => ["-e", l]);
  try {
    await run("osascript", [...script, env("PHONE_NUMBER"), body], { timeout: 30_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not authorized|1743|-1743/.test(msg)) throw new Error("macOS blocked it. System Settings → Privacy & Security → Automation → allow Terminal (or node) to control Messages, then try again.");
    if (/Can’t get account|Can't get account|-1728/.test(msg)) throw new Error("Messages is not signed into iMessage on this Mac. Open Messages and sign in with your Apple ID.");
    throw new Error(msg.split("\n").filter(Boolean).pop() ?? msg);
  }
}

async function ntfy(body: string, title: string) {
  const server = (env("NTFY_SERVER") || "https://ntfy.sh").replace(/\/$/, "");
  const res = await fetch(`${server}/${encodeURIComponent(env("NTFY_TOPIC"))}`, {
    method: "POST",
    headers: { Title: title.replace(/[^\x20-\x7e]/g, ""), Priority: "default", Tags: "books" },
    body,
  });
  if (!res.ok) throw new Error(`ntfy said ${res.status}`);
}
