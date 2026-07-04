import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { UPLOADS_DIR, DATA_DIR, ensureDirs } from "@/lib/paths";
import { addVideo } from "@/lib/store";
import { probeDuration } from "@/lib/ffmpeg";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  ensureDirs();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const id = crypto.randomUUID().slice(0, 8);
  const safeName = path.basename(file.name).replace(/[^\w.\-]+/g, "_");
  const dest = path.join(UPLOADS_DIR, `${id}-${safeName}`);
  await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));

  let duration: number;
  try {
    duration = await probeDuration(dest);
  } catch {
    await fs.rm(dest, { force: true });
    return NextResponse.json(
      { error: "File is not a readable video" },
      { status: 400 }
    );
  }

  const video = {
    id,
    filename: file.name,
    file: path.relative(DATA_DIR, dest),
    duration,
    createdAt: new Date().toISOString(),
  };
  addVideo(video);
  return NextResponse.json(video);
}
