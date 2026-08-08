import { cookies } from "next/headers";
import StyleRunner from "./components/StyleRunner";
import { CLOSET_COOKIE, readCloset, type Closet } from "@/lib/closet";

export const dynamic = "force-dynamic";

/**
 * Reopen the last closet on arrival. A missing cookie, an expired closet, or
 * unconfigured Redis all mean the same thing here — start fresh — so none of
 * them should surface as an error on a first visit.
 */
async function lastCloset(): Promise<Closet | null> {
  const code = cookies().get(CLOSET_COOKIE)?.value;
  if (!code) return null;
  try {
    return await readCloset(code);
  } catch {
    return null;
  }
}

export default async function Home() {
  const closet = await lastCloset();

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <header className="mb-10">
        <p className="label mb-3">Menswear</p>
        <h1 className="font-serif text-5xl leading-none text-room-ink md:text-6xl">
          Show me what you like.
        </h1>
      </header>

      <StyleRunner initialCloset={closet} />
    </main>
  );
}
