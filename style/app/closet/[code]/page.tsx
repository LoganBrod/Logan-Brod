import Link from "next/link";
import { notFound } from "next/navigation";
import ClosetView from "@/app/components/ClosetView";
import { normalizeCode, readCloset } from "@/lib/closet";

export const dynamic = "force-dynamic";

/** Shareable permalink for a saved closet — /closet/ABC234. */
export default async function ClosetPage({ params }: { params: { code: string } }) {
  const code = normalizeCode(params.code);
  const closet = await readCloset(code).catch(() => null);

  if (!closet) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2 text-ink-gold">Saved closet</p>
          <h1 className="font-mono text-3xl tracking-[0.3em] text-white">{closet.code}</h1>
          <p className="mt-2 text-xs text-gray-600">
            Updated {new Date(closet.updatedAt).toLocaleDateString()}
          </p>
        </div>
        <Link href="/" className="btn-ghost">
          Start a new one
        </Link>
      </header>

      <ClosetView closet={closet} />
    </main>
  );
}
