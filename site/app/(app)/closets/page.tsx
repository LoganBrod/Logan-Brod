import ClosetLibrary from "@/app/components/ClosetLibrary";

import PageHeader from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Every closet this person has built, kept ones first.
 *
 * This page used to carry the standing scans and the owned wardrobe as well,
 * which made it the place three unrelated features went to be overlooked. They
 * have their own pages now; this is the library and nothing else.
 */
export default function ClosetsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <PageHeader
        title={<>Everything you&rsquo;ve built.</>}
        action={{ href: "/closet", label: "Build another" }}
      />

      <ClosetLibrary />
    </main>
  );
}
