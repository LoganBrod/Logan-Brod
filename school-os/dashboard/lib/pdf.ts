// A tiny PDF writer: one JPEG per page, nothing else. Enough to turn handwritten pages from the
// iPad into a single file the brain reads like any scan. Runs in the browser, no library.
export function jpegsToPdf(pages: { jpeg: Uint8Array; width: number; height: number }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => { const b = typeof chunk === "string" ? enc.encode(chunk) : chunk; parts.push(b); length += b.length; };
  const obj = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\n`);
    if (stream) { push("stream\n"); push(stream); push("\nendstream\n"); }
    push("endobj\n");
  };
  push("%PDF-1.4\n%âãÏÓ\n");
  const total = 3 + pages.length * 3;
  const kids = pages.map((_, i) => `${4 + i * 3} 0 R`).join(" ");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  obj(3, "<< /Producer (School OS) >>");
  pages.forEach((p, i) => {
    const page = 4 + i * 3, img = page + 1, content = page + 2;
    // US Letter in points; the image is scaled to fit the page width.
    const w = 612, h = Math.round((612 * p.height) / p.width);
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${img} 0 R >> >> /Contents ${content} 0 R >>`);
    obj(img, `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`, p.jpeg);
    const draw = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`);
    obj(content, `<< /Length ${draw.length} >>`, draw);
  });
  const xref = length;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= total; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
