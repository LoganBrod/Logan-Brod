// Pulls Google Docs from one shared Drive folder into the inbox as markdown.
// Auth is a service account: share the folder with its email once, no login screens.
// A doc that was already filed gets its body refreshed in place when it changes.
import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import { GDOCS_FOLDER_ID, GOOGLE_SERVICE_ACCOUNT_KEY, DIRS } from "./config.js";
import { vaultPath, writeNote, replaceBody, findNoteBy, appendLog, exists } from "./vault.js";

type State = Record<string, { modifiedTime: string }>;

export function gdocsConfigured(): boolean {
  return Boolean(GDOCS_FOLDER_ID && GOOGLE_SERVICE_ACCOUNT_KEY);
}

export async function pullGoogleDocs(dryRun: boolean): Promise<number> {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(GOOGLE_SERVICE_ACCOUNT_KEY),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const drive = google.drive({ version: "v3", auth });

  const statePath = vaultPath(DIRS.system, "gdocs-state.json");
  const state: State = (await exists(statePath)) ? JSON.parse(await fs.readFile(statePath, "utf8")) : {};

  const { data } = await drive.files.list({
    q: `'${GDOCS_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
    fields: "files(id, name, modifiedTime)",
    pageSize: 200,
  });

  let pulled = 0;
  for (const file of data.files ?? []) {
    if (!file.id || !file.name || !file.modifiedTime) continue;
    if (state[file.id]?.modifiedTime === file.modifiedTime) continue;

    const existing = await findNoteBy("gdoc_id", file.id);
    console.log(`  gdoc ${existing ? "changed" : "new"}: ${file.name}`);
    if (dryRun) continue;

    const exported = await drive.files.export(
      { fileId: file.id, mimeType: "text/markdown" },
      { responseType: "text" },
    );
    const body = String(exported.data);

    if (existing) {
      await replaceBody(existing, body);
      await appendLog(`refreshed Google Doc "${file.name}" in ${path.relative(vaultPath(), existing)}`);
    } else {
      await writeNote(vaultPath(DIRS.inbox), file.name, {
        status: "raw",
        source_kind: "gdoc",
        gdoc_id: file.id,
      }, body);
      await appendLog(`pulled Google Doc "${file.name}" into inbox`);
    }
    state[file.id] = { modifiedTime: file.modifiedTime };
    pulled++;
  }

  if (!dryRun) await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  return pulled;
}
