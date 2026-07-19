import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { DATA_DIR } from "@/lib/paths";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const filePath = path.resolve(DATA_DIR, ...params.path);
  if (!filePath.startsWith(DATA_DIR + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(stat.size),
    },
  });
}
