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
export const MODEL = "claude-opus-5";

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
