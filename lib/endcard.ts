import type { PromoSettings } from "./store";

/** "#2dd4bf" -> ASS BGR color "&H00BFD42D" */
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
 * ASS document for the outro card (1080x1920): small headline, big accent
 * main line (handle/code), subline, socials row, and an optional footer
 * (e.g. an 18+ disclosure for casino content).
 */
export function buildEndCardAss(promo: PromoSettings, durationSec: number): string {
  const end = assTime(durationSec);
  const accent = hexToAss(promo.accent);
  const line = (y: number, tags: string, text: string) =>
    `Dialogue: 0,${assTime(0)},${end},Card,,0,0,0,,{\\an5\\pos(540,${y})${tags}}${escapeAss(text)}`;

  // Shrink long lines so they never overflow the 1080px frame
  // (~0.54 * fontsize average glyph width for bold Arial, 960px usable width)
  const fit = (text: string, maxFs: number, minFs = 26) =>
    Math.round(
      Math.max(minFs, Math.min(maxFs, 960 / (0.54 * Math.max(1, text.trim().length))))
    );

  const lines: string[] = [];
  if (promo.headline.trim()) {
    lines.push(line(660, `\\fs${fit(promo.headline, 64)}\\c&H00D3D2C9&`, promo.headline));
  }
  if (promo.main.trim()) {
    lines.push(line(870, `\\fs${fit(promo.main, 150)}\\c${accent}`, promo.main));
  }
  if (promo.subline.trim()) {
    lines.push(line(1060, `\\fs${fit(promo.subline, 56)}\\c&H00D3D2C9&`, promo.subline));
  }
  if (promo.socials.trim()) {
    // Accent underline echoing the LevoZ logo, then the socials row
    lines.push(line(1180, `\\fs30\\c${accent}\\bord0`, "―――――"));
    lines.push(line(1280, `\\fs${fit(promo.socials, 46)}\\c&H00A8B2B4&`, promo.socials));
  }
  if (promo.footer.trim()) {
    lines.push(line(1760, `\\fs${fit(promo.footer, 40)}\\c&H00808A8C&`, promo.footer));
  }

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
