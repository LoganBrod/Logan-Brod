import ClosetTabs from "@/app/components/ClosetTabs";
import SizingDesk from "@/app/components/SizingDesk";

import PageHeader from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Sizing: what you want while you're actually out looking.
 *
 * This page carried three sections. Two are off it for now - "is it any good?",
 * which still sits under a finished clozet where the question actually comes
 * up, and standing scans, which are off entirely (`lib/features.ts` says why).
 * Neither is deleted: their components, API routes and tests are all still
 * here, and each is a `<Section>` away from coming back.
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
        lede="Your measurements, and how a brand's sizes actually run. Used on every search a clozet makes."
      />

      {/* Anchored so the closet page and old bookmarks can point at a section
          rather than dropping someone at the top of a long page. */}
      <div>
        <Section
          id="fit"
          title="Will it fit?"
          blurb="Five numbers, once. Then nothing you can't wear is ever shown to you again."
        >
          <SizingDesk />
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
