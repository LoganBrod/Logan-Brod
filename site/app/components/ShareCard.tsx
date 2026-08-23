"use client";

import { useState } from "react";

interface Piece {
  title: string;
  imageUrl?: string;
}

interface Props {
  code: string;
  name: string;
  items: Piece[];
  palette?: Array<{ name: string; hex: string }>;
}

/** Instagram's feed is square; anything else gets cropped by the app itself. */
const SIZE = 1080;
const INK = "#1b1a17";
const BG = "#edeae4";
const LINE = "#d6d1c8";
const FAINT = "#8f8a80";

/** Photos are drawn through our own origin, or the canvas taints and can't export. */
const proxied = (url: string) => `/api/image?url=${encodeURIComponent(url)}`;

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Cover-fit, so a portrait boot and a square jumper both fill their tile. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/**
 * Turn a closet into a square image, for Instagram.
 *
 * Worth being straight about what this is: Instagram has no API that lets a
 * website post to a personal account. Anything claiming otherwise is either the
 * Business API — which needs a Facebook app, a reviewed permission, and a
 * connected professional account — or a scraper that will get the account
 * banned. So this produces the picture and hands it to the operating system's
 * share sheet, where Instagram is one of the choices. On a phone that is two
 * taps. On a desktop it downloads, because desktop browsers have no share sheet
 * worth the name.
 */
export default function ShareCard({ code, name, items, palette }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function render(): Promise<Blob | null> {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Four pieces in a 2×2 above the caption. More than four at this size is a
    // contact sheet nobody can read on a phone.
    const shown = items.filter((item) => item.imageUrl).slice(0, 4);
    const images = await Promise.all(shown.map((item) => load(proxied(item.imageUrl as string))));

    const pad = 64;
    const gridTop = 150;
    const cell = (SIZE - pad * 2 - 24) / 2;

    images.forEach((img, index) => {
      const x = pad + (index % 2) * (cell + 24);
      const y = gridTop + Math.floor(index / 2) * (cell + 24);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, cell, cell);
      if (img) drawCover(ctx, img, x, y, cell, cell);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cell, cell);
    });

    ctx.fillStyle = INK;
    ctx.font = "600 30px Georgia, serif";
    ctx.fillText("LEVOZ", pad, 92);

    ctx.fillStyle = FAINT;
    ctx.font = "500 24px Georgia, serif";
    ctx.textAlign = "right";
    ctx.fillText(`levozlabs.com · ${code}`, SIZE - pad, 92);
    ctx.textAlign = "left";

    const captionTop = gridTop + cell * 2 + 24 + 78;
    ctx.fillStyle = INK;
    ctx.font = "italic 54px Georgia, serif";
    // Long closet names wrap into the palette row otherwise.
    const title = name.length > 30 ? `${name.slice(0, 29)}…` : name;
    ctx.fillText(title, pad, captionTop);

    ctx.fillStyle = FAINT;
    ctx.font = "400 26px Georgia, serif";
    ctx.fillText(`${items.length} pieces, found secondhand`, pad, captionTop + 46);

    // The palette is the one part of a style profile that reads at a glance.
    (palette ?? []).slice(0, 6).forEach((colour, index) => {
      ctx.fillStyle = colour.hex;
      ctx.beginPath();
      ctx.arc(SIZE - pad - 26 - index * 62, captionTop - 14, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  }

  async function share() {
    setBusy(true);
    setNote(null);
    try {
      const blob = await render();
      if (!blob) throw new Error("Couldn't draw the card.");

      const file = new File([blob], `levoz-${code}.png`, { type: "image/png" });
      const shareable =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (shareable) {
        await navigator.share({
          files: [file],
          title: name,
          text: `${name} - built on LevoZ`,
        });
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      setNote("Saved. Open Instagram and pick it from your camera roll.");
    } catch (err) {
      // A cancelled share sheet throws AbortError, which is not a failure and
      // should not be reported as one.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setNote(err instanceof Error ? err.message : "Couldn't make the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={share} disabled={busy} className="btn-ghost">
        {busy ? "Drawing…" : "Share as an image"}
      </button>
      {note && <p className="text-xs text-room-faint">{note}</p>}
    </div>
  );
}
