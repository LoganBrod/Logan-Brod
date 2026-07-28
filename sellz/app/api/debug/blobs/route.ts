import { NextResponse } from "next/server";
import { openStore, useBlobs, describeBlobError } from "@/lib/blobStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostic for the storage layer. Reports which credential path is in use
 * and attempts a real write+read, without ever exposing a secret value.
 */
export async function GET() {
  const usingAutoContext = Boolean(process.env.NETLIFY_BLOBS_CONTEXT);
  const hasManualToken = Boolean(
    (process.env.SITE_ID || process.env.NETLIFY_SITE_ID) && process.env.NETLIFY_BLOBS_TOKEN
  );

  const report: Record<string, unknown> = {
    useBlobs,
    NETLIFY_BLOBS_CONTEXT_present: usingAutoContext,
    SITE_ID_present: Boolean(process.env.SITE_ID),
    NETLIFY_SITE_ID_present: Boolean(process.env.NETLIFY_SITE_ID),
    NETLIFY_BLOBS_TOKEN_present: Boolean(process.env.NETLIFY_BLOBS_TOKEN),
    credentialPath: usingAutoContext
      ? "netlify-auto-context"
      : hasManualToken
        ? "manual-siteid-token"
        : "auto-fallback",
  };

  if (!useBlobs) {
    report.note = "Not on Netlify — using the local filesystem store.";
    return NextResponse.json(report);
  }

  try {
    const store = openStore("levoz-data");
    await store.set("debug-check", "ok");
    report.blobsWorking = (await store.get("debug-check", { type: "text" })) === "ok";
  } catch (err) {
    report.blobsWorking = false;
    report.blobsError = describeBlobError(err);
  }

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
