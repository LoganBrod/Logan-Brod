import { NextResponse } from "next/server";

const ROOBET_API_TOKEN =
  process.env.ROOBET_API_TOKEN ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjQ1YWI5MDdjLThmYmUtNGZiOS1iN2NhLWYyYzUxMTNhMmEyYiIsIm5vbmNlIjoiNDQ0Y2FlMzgtYjQ5Zi00OTI4LTg5ZjktMjRkYmUyOTljMzdiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzgxNjMxMzkxfQ.dKtS_q6jckxezPbMoqFLhXWYnnB0Zet_p-qIfx5LMpA";

const ENDPOINTS = [
  "https://api.roobet.com/affiliate/referrals",
  "https://api.roobet.com/affiliate/wagers",
  "https://api.roobet.com/affiliate/stats",
  "https://api.roobet.com/affiliate/users",
  "https://api.roobet.com/affiliate/commission",
  "https://api.roobet.com/affiliate",
];

export async function GET() {
  const headers = {
    Authorization: `Bearer ${ROOBET_API_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const results = await Promise.all(
    ENDPOINTS.map(async (url) => {
      try {
        const res = await fetch(url, { headers, cache: "no-store" });
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          body = await res.text().catch(() => "(unreadable)");
        }
        return { url, status: res.status, body };
      } catch (e) {
        return { url, status: 0, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );

  return NextResponse.json({ results }, {
    headers: { "Cache-Control": "no-store" },
  });
}
