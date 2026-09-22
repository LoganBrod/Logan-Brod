// Reads .env and exposes the few settings every script needs.
import "dotenv/config";
import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

export const VAULT_PATH = path.resolve(required("VAULT_PATH"));
export const CONFIDENCE_THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD ?? "0.7");
// Which model does which job. Sorting and transcribing is routine work; study
// material is where quality matters most. Both can be changed in .env.
//   claude-opus-5    $5 in / $25 out per million tokens
//   claude-sonnet-5  $2 in / $10 out
//   claude-haiku-4-5 $1 in / $5 out
export const MODEL_SORT = process.env.MODEL_SORT || "claude-sonnet-5";
export const MODEL_STUDY = process.env.MODEL_STUDY || "claude-opus-5";
/** Kept for anything that still imports MODEL. */
export const MODEL = MODEL_STUDY;

/** Ingest stops calling Claude once a single run has spent this much (USD). The rest waits for next run. */
export const MAX_SPEND_PER_RUN = Number(process.env.MAX_SPEND_PER_RUN ?? "2");
/** Scanned PDFs longer than this are not sent to vision; they wait in the inbox for you to split. */
export const MAX_SCAN_PAGES = Number(process.env.MAX_SCAN_PAGES ?? "12");

// Folder names inside the vault. Match docs/SCHOOL_OS_ROADMAP.md section 3.
export const DIRS = {
  inbox: "00 Inbox",
  courses: "01 Courses",
  system: "04 System",
  sources: "_sources", // inside each unit folder: the original scan or document
} as const;

// Optional: Google Docs pull. Both must be set for it to run.
export const GDOCS_FOLDER_ID = process.env.GDOCS_FOLDER_ID ?? "";
export const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "";
