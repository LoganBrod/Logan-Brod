import type { PromoSettings } from "./store";

/** "#8b5cf6" -> ASS BGR color "&H00F65C8B" */
function hexToAss(hex: string): string {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return "&H00FFFFFF";
  const [r, g, b] = [m[1].slice(0, 2), m[1].slice(2, 4), m[1].slice(4, 6)];
  return `&H00${b}${g}${r}`.toUpperCase();
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\n/g, " ");
}

function assTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `0:${pad(m)}:${pad(sec)}.${pad(cs)}`;
}

/**
 * ASS document for the promo end card (1080x1920): headline, big accent promo
 * code, subline, and a fixed responsible-gambling footer.
 */
export function buildEndCardAss(promo: PromoSettings, durationSec: number): string {
  const end = assTime(durationSec);
  const accent = hexToAss(promo.accent);

  const lines: string[] = [];
  if (promo.headline.trim()) {
    lines.push(
      `Dialogue: 0,0:00:00.00,${end},Card,,0,0,0,,{\\an5\\pos(540,700)\\fs88}${escapeAss(promo.headline)}`
    );
  }
  if (promo.code.trim()) {
    lines.push(
      `Dialogue: 0,0:00:00.00,${end},Card,,0,0,0,,{\\an5\\pos(540,920)\\fs150\\c${accent}}${escapeAss(promo.code)}`
    );
  }
  if (promo.subline.trim()) {
    lines.push(
      `Dialogue: 0,0:00:00.00,${end},Card,,0,0,0,,{\\an5\\pos(540,1120)\\fs54\\c&H00BBBBBB&}${escapeAss(promo.subline)}`
    );
  }
  lines.push(
    `Dialogue: 0,0:00:00.00,${end},Card,,0,0,0,,{\\an5\\pos(540,1760)\\fs40\\c&H00999999&}18+ | Gamble responsibly`
  );

  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Card,Arial,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,3,0,5,60,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join("\n")}
`;
}
