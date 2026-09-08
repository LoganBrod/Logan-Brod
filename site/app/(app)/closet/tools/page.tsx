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
          blurb="Five numbers, once. Then nothing you can't wear is ever shown to you again."
        >
          <SizingDesk />
        </Section>

        <Section
          id="judge"
          title="Is it any good?"
          blurb="Paste a link to anything you've found. It reads the photograph and answers."
        >
          {/* The range is the app's default band rather than anything personal:
              this panel can be used before a clozet has ever been built, so it
              can't depend on one having been. */}
          <JudgePanel range={{ min: 50, max: 250 }} defaultOpen />
        </Section>

        <Section
          id="scans"
          title="Keep looking."
          blurb="Your searches, run twice a day. It emails you only when something clears the bar."
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
