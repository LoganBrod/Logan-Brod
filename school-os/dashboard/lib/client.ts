// Browser-side helpers shared by the chat and the voice panel.

/** Parse a JSON reply, or explain what came back instead: a timeout page, a login redirect, an empty body. */
export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as T & { error?: string };
    if (!res.ok && data && typeof data === "object" && "error" in data && data.error) throw new Error(String(data.error));
    return data;
  } catch (e) {
    if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
    const hint = /TIMEOUT/i.test(text) ? "the server ran out of time (on Vercel: Settings → Functions → enable Fluid Compute, then Redeploy)"
      : res.status === 401 ? "you are logged out; reload the page"
      : !text.trim() ? "the server sent back nothing"
      : text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
    throw new Error(`server said ${res.status}: ${hint}`);
  }
}
