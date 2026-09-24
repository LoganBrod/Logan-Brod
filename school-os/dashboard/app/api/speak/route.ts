// Text to speech. With an ElevenLabs key it returns real audio; without one it returns
// 204 and the browser falls back to its own voices. Nothing is stored.
import { NextResponse } from "next/server";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.join(process.cwd(), "..", ".env") });

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new NextResponse(null, { status: 204 });
  const { text } = (await req.json()) as { text: string };
  const voice = process.env.ELEVENLABS_VOICE_ID || "onwK4e9ZLuTAKqWW03F9"; // ElevenLabs' "Daniel"
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_96`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 900),
      model_id: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2 },
    }),
  });
  if (!res.ok) return NextResponse.json({ error: `ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}` }, { status: 502 });
  return new NextResponse(res.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
}
