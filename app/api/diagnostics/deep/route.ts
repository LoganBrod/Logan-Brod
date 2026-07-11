import { NextRequest, NextResponse } from "next/server";
import { fetchDeepDiagnostics } from "@/lib/youtubeAnalytics";
import { DiagnosticsError } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const refreshToken = req.cookies.get("yt_refresh_token")?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return NextResponse.json(
      {
        error:
          "Deep dive is not configured: set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
      },
      { status: 501 }
    );
  }

  try {
    const deep = await fetchDeepDiagnostics(refreshToken);
    return NextResponse.json(deep);
  } catch (err) {
    if (err instanceof DiagnosticsError) {
      const res = NextResponse.json({ error: err.message }, { status: err.status });
      if (err.status === 401) res.cookies.delete("yt_refresh_token");
      return res;
    }
    console.error("deep diagnostics error:", err);
    return NextResponse.json(
      { error: "Unexpected error running deep diagnostics" },
      { status: 500 }
    );
  }
}
