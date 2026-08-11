import { cookies } from "next/headers";
import AccountBar from "@/app/components/AccountBar";
import StyleRunner from "@/app/components/StyleRunner";
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
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="label mb-3">Menswear</p>
          <h1 className="font-serif text-5xl leading-none text-room-ink md:text-6xl">
            Show me what you like.
          </h1>
        </div>
        <AccountBar />
      </header>

      <StyleRunner initialCloset={closet} />
    </main>
  );
}
