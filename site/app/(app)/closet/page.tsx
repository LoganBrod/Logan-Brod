import { cookies } from "next/headers";
import ClosetTabs from "@/app/components/ClosetTabs";
import Reveal from "@/app/components/Reveal";
import { Sources } from "@/app/components/Story";
import { beats } from "@/lib/copy";
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

export default async function Home() {
  const closet = await lastCloset();

  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <ClosetTabs />

      <PageHeader
        title={<>Show me what you like.</>}
        lede="A few photographs of clothes you like, and it finds real secondhand pieces that belong with them."
      />

      <PageNote>In your size, in your budget, and still for sale.</PageNote>

      <StyleRunner initialCloset={closet} />

      {/* Below the form: what it is about to do, for anyone who arrived here
          without reading the homepage. Kept under the tool rather than above
          it - somebody returning to build their fourth clozet should not have
          to scroll past an explanation to reach the upload. */}
      <section aria-label="What happens next" className="mt-24 border-t border-room-line pt-16">
        <ol className="grid gap-10 sm:grid-cols-2">
          {beats.map((beat, index) => (
            <li key={beat.kicker}>
              <Reveal delay={index * 0.05}>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[12px] tabular-nums text-accent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-room-ink">
                    {beat.heading}
                  </h2>
                </div>
                <p className="mt-2 pl-8 text-[13.5px] leading-relaxed text-room-muted">
                  {beat.body}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-8">
        <Sources />
      </div>
    </main>
  );
}
