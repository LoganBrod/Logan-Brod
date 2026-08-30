import ClosetTabs from "@/app/components/ClosetTabs";
import JudgePanel from "@/app/components/JudgePanel";
import ScanSettings from "@/app/components/ScanSettings";
import SizingDesk from "@/app/components/SizingDesk";
import Watches from "@/app/components/Watches";

import PageHeader from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * The three things you want while you're actually out looking.
 *
 * These were two pages and a footnote: measurements on /sizing, standing scans
 * on /scan, and "is this any good?" collapsed under the closet form where
 * nobody found it. Splitting them was a mistake of category — they aren't three
 * features, they're three moments of the same one. You're stood in front of
 * something, or scrolling a listing at eleven at night, and you want to know
 * whether it fits, whether it's worth it, and whether to keep looking.
 *
 * Building a clozet is the thing you do once. This is the page you come back to.
 *
 * A tab of Clozet rather than a section of its own, which is what the
 * relationship always was: everything here works off the sizes and the taste a
 * clozet establishes, and none of it makes sense on its own. The "Build a
 * clozet" button that used to sit in this header is gone with the move - it is
 * the tab immediately to the left now.
 */
export default function ToolsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <ClosetTabs />

      <PageHeader
        title={<>For when you&rsquo;re out looking.</>}
        lede="A clozet is one search on one day. These are the three things you want every other day."
      />

      {/* Anchored so the closet page and old bookmarks can point at a section
          rather than dropping someone at the top of a long page. */}
      <div className="space-y-16">
        <Section
          id="fit"
          title="Will it fit?"
          blurb="Your measurements filter every search, every judgement and every scan - a listing that states a size you can't wear is dropped before anyone spends a moment on it. And a 42 from one maker is not a 42 from another: name a brand and it reads that maker's own size guide and what buyers report, then says which size to buy - or says plainly when the evidence is thin."
        >
          <SizingDesk />
        </Section>

        <Section
          id="judge"
          title="Is it any good?"
          blurb="Paste a link to anything you've found. It reads the listing and the photograph and tells you whether it's worth it at that price, in your size, against your taste - not whether it's a nice jacket in the abstract."
        >
          {/* The range is the app's default band rather than anything personal:
              this panel can be used before a clozet has ever been built, so it
              can't depend on one having been. */}
          <JudgePanel range={{ min: 50, max: 250 }} defaultOpen />
        </Section>

        <Section
          id="scans"
          title="Keep looking."
          blurb="Secondhand stock turns over daily, so almost everything that would suit you isn't listed at the moment you look - the right jacket in your size at your price goes up on a Tuesday and is gone by Wednesday. A scan runs your searches twice a day, throws away everything it has already shown you, judges what's left exactly as a clozet would, and emails only what clears the same bar. Most days it finds nothing and says nothing."
        >
          <div className="space-y-10">
            <Watches />
            <ScanSettings />
          </div>
        </Section>
      </div>
    </main>
  );
}

function Section({
  id,
  title,
  blurb,
  children,
}: {
  id: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    // scroll-mt so an anchored jump doesn't put the heading under the top of
    // the window.
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-8">
      <div className="mb-6 max-w-[58ch] border-t border-room-line pt-6">
        <h2
          id={`${id}-heading`}
          className="text-[1.4rem] font-semibold tracking-[-0.02em] text-room-ink sm:text-[1.65rem]"
        >
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-room-muted">{blurb}</p>
      </div>
      {children}
    </section>
  );
}
