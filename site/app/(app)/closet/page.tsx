import { cookies } from "next/headers";
import ClosetTabs from "@/app/components/ClosetTabs";
import HowItWorks from "@/app/components/HowItWorks";
import Sources from "@/app/components/Sources";
import StyleRunner from "@/app/components/StyleRunner";
import { CLOSET_COOKIE, readCloset, type Closet } from "@/lib/closet";

import PageHeader, { PageNote } from "@/app/components/PageHeader";

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

/**
 * Two ways to say "not that one, a new one".
 *
 * `?quiz=1` is what the front page's Get started button sends, and it used to
 * land somebody in the clozet they built last week: the cookie reopened it,
 * the runner mounted in its filled state, and the quiz - which only ever
 * opens over the form - never appeared. Pressing the site's main call to
 * action and being shown last week's wardrobe is the worst version of this
 * page, and it was the default for anyone who had ever used it.
 *
 * `?new=1` is the same instruction, said by the "Start another" link in the
 * header. A parameter rather than client state so the link is a link: it
 * survives a refresh, can be bookmarked, and needs nothing hydrated to work.
 */
function wantsFresh(params: { quiz?: string; new?: string }): boolean {
  return params.quiz === "1" || params.new === "1";
}

export default async function Home({
  searchParams,
}: {
  searchParams: { quiz?: string; new?: string };
}) {
  const fresh = wantsFresh(searchParams);
  const closet = fresh ? null : await lastCloset();

  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <ClosetTabs />

      <PageHeader
        title={<>Show me what you like.</>}
        lede="A few photographs of clothes you like, and it finds real secondhand pieces that belong with them."
        /* The way out of a reopened clozet, at the top of the page rather than
           under the wardrobe, the accessories offer and the share card. There
           is a button down there too and it is better - it swaps the form in
           without a reload - but it is only better if you find it. */
        action={closet ? { href: "/closet?new=1", label: "Start another" } : undefined}
      />

      <PageNote>In your size, in your budget, and still for sale.</PageNote>

      {/*
        Keyed, so that "Start another" actually starts another.
        
        The runner reads `initialCloset` once, when it mounts, to decide whether
        it opens on the form or on a filled wardrobe. Moving between /closet and
        /closet?new=1 is a soft navigation: the server re-renders with no
        closet, React keeps the component in the same slot, and its state - the
        old wardrobe - survives the prop that was meant to clear it. A key that
        changes forces a remount, which is the only thing that resets state a
        component owns.
      */}
      <StyleRunner key={closet?.code ?? "fresh"} initialCloset={closet} />

      {/* Below the form: what to actually do, for anyone who arrived here
          without reading the homepage. Kept under the tool rather than above
          it - somebody returning to build their fourth clozet should not have
          to scroll past an explanation to reach the upload. */}
      <HowItWorks />

      <div className="mt-8">
        <Sources />
      </div>
    </main>
  );
}
