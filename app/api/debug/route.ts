import { NextResponse } from "next/server";

const TOKEN =
  process.env.ROOBET_API_TOKEN ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjQ1YWI5MDdjLThmYmUtNGZiOS1iN2NhLWYyYzUxMTNhMmEyYiIsIm5vbmNlIjoiNDQ0Y2FlMzgtYjQ5Zi00OTI4LTg5ZjktMjRkYmUyOTljMzdiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzgxNjMxMzkxfQ.dKtS_q6jckxezPbMoqFLhXWYnnB0Zet_p-qIfx5LMpA";

const BASES = [
  "https://api.roobet.com",
  "https://affiliates.roobet.com",
  "https://affiliate.roobet.com",
];

const PATHS = [
  "/affiliate/referrals",
  "/affiliate/wagers",
  "/affiliate/stats",
  "/affiliate/users",
  "/affiliate/commission",
  "/affiliate",
  "/affiliateStats/referrals",
  "/affiliateStats",
  "/api/affiliate/referrals",
  "/api/affiliate/stats",
];

const AUTH_VARIANTS: Array<{ label: string; headers: Record<string, string> }> = [
  { label: "Bearer", headers: { Authorization: `Bearer ${TOKEN}` } },
  { label: "JWT",    headers: { Authorization: `JWT ${TOKEN}` } },
  { label: "Raw",    headers: { Authorization: TOKEN } },
  { label: "x-api-key", headers: { "x-api-key": TOKEN } },
  { label: "token-header", headers: { token: TOKEN } },
];

export async function GET() {
  const results: Array<{ url: string; auth: string; status: number; body?: unknown; error?: string }> = [];

  // Run all combinations in parallel
  const tasks = BASES.flatMap((base) =>
    PATHS.flatMap((path) =>
      AUTH_VARIANTS.map(async ({ label, headers }) => {
        const url = `${base}${path}`;
        try {
          const res = await fetch(url, {
            headers: { ...headers, Accept: "application/json" },
            cache: "no-store",
          });
          let body: unknown;
          try { body = await res.json(); } catch { body = await res.text().catch(() => null); }
          results.push({ url, auth: label, status: res.status, body });
        } catch (e) {
          results.push({ url, auth: label, status: 0, error: String(e) });
        }
      })
    )
  );

  await Promise.all(tasks);

  // Sort: 2xx first, then by status
  results.sort((a, b) => {
    const aOk = a.status >= 200 && a.status < 300 ? 0 : 1;
    const bOk = b.status >= 200 && b.status < 300 ? 0 : 1;
    return aOk - bOk || a.status - b.status;
  });

  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
