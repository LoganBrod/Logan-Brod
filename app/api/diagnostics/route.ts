import { NextRequest, NextResponse } from "next/server";
import { analyzeChannel } from "@/lib/analytics";
import { fetchYouTubeChannel, DiagnosticsError } from "@/lib/youtube";
import { fetchTwitchChannel } from "@/lib/twitch";
import { crossReference } from "@/lib/crossref";
import { liveResearch } from "@/lib/research";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform");
  const channel = req.nextUrl.searchParams.get("channel")?.trim();

  if (!channel) {
    return NextResponse.json({ error: "Missing ?channel=" }, { status: 400 });
  }
  if (platform !== "youtube" && platform !== "twitch") {
    return NextResponse.json(
      { error: "?platform= must be 'youtube' or 'twitch'" },
      { status: 400 }
    );
  }

  try {
    const { channel: info, videos } =
      platform === "youtube"
        ? await fetchYouTubeChannel(channel)
        : await fetchTwitchChannel(channel);

    const diagnostics = analyzeChannel(videos);
    const recommendations = crossReference(diagnostics, platform);
    const webFindings = await liveResearch(platform);
    return NextResponse.json({
      channel: info,
      ...diagnostics,
      recommendations,
      webFindings,
    });
  } catch (err) {
    if (err instanceof DiagnosticsError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("diagnostics error:", err);
    return NextResponse.json(
      { error: "Unexpected error running diagnostics" },
      { status: 500 }
    );
  }
}
