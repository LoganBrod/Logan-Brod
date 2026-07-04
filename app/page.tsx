"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface VideoRow {
  id: string;
  filename: string;
  duration: number;
  clipCount: number;
  createdAt: string;
}

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Dashboard() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/videos");
    if (res.ok) setVideos(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this video and all of its clips?")) return;
    await fetch(`/api/videos/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-ink-border bg-ink-card p-6">
        <h1 className="text-xl font-bold">Upload raw footage</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Drop in a VOD or session recording. Then detect the big moments, cut
          vertical clips with captions, and get AI hooks + captions to post.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-border file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand/60"
          />
          <button
            onClick={upload}
            disabled={uploading}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Your footage</h2>
        {videos.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing uploaded yet.</p>
        ) : (
          <ul className="space-y-2">
            {videos.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-xl border border-ink-border bg-ink-card px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/video/${v.id}`}
                    className="block truncate font-semibold hover:text-brand"
                  >
                    {v.filename}
                  </Link>
                  <p className="text-xs text-neutral-400">
                    {fmtDuration(v.duration)} · {v.clipCount} clip
                    {v.clipCount === 1 ? "" : "s"} ·{" "}
                    {new Date(v.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/video/${v.id}`}
                    className="rounded-lg bg-ink-border px-3 py-1.5 text-sm font-semibold hover:bg-brand/60"
                  >
                    Open
                  </Link>
                  <button
                    onClick={() => remove(v.id)}
                    className="rounded-lg px-2 py-1.5 text-sm text-neutral-500 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
