import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Temporary diagnostic route — reports env var presence and attempts a
 * real Blobs read/write, without exposing any secret values. Delete once
 * the Blobs connection issue is confirmed fixed.
 */
export async function GET() {
  const report: Record<string, unknown> = {
    NETLIFY: process.env.NETLIFY ?? null,
    SITE_ID_present: Boolean(process.env.SITE_ID),
    NETLIFY_SITE_ID_present: Boolean(process.env.NETLIFY_SITE_ID),
    NETLIFY_BLOBS_TOKEN_present: Boolean(process.env.NETLIFY_BLOBS_TOKEN),
    NETLIFY_BLOBS_CONTEXT_present: Boolean(process.env.NETLIFY_BLOBS_CONTEXT),
  };

  try {
    const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN;
    const store =
      siteID && token
        ? getStore({ name: "levoz-data", consistency: "strong", siteID, token })
        : getStore({ name: "levoz-data", consistency: "strong" });

    await store.set("debug-check", "ok");
    const readBack = await store.get("debug-check", { type: "text" });
    report.blobsWriteReadResult = readBack;
    report.blobsWorking = readBack === "ok";
  } catch (err) {
    report.blobsWorking = false;
    report.blobsError = err instanceof Error ? err.message : String(err);
    report.blobsErrorName = err instanceof Error ? err.name : null;
  }

  return NextResponse.json(report);
}
