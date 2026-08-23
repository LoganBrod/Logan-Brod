import CalibrationSwipe from "@/app/components/CalibrationSwipe";

import PageHeader, { PageNote } from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * A minute of yes and no, before the app has ever watched you choose anything.
 *
 * The taste memory is the strongest signal here and it only exists after
 * somebody has built a closet and reacted to it — which means the first run,
 * the one that decides whether anyone comes back, is the run with no taste data
 * at all. This fills that in first.
 */
export default function CalibratePage() {
  return (
    <main className="mx-auto max-w-xl px-6 pb-14 pt-6">
      <PageHeader
        title={<>Teach it your eye.</>}
        lede="Fifteen real pieces, yes or no. About a minute."
      />

      <PageNote>
        What you turn down matters as much as what you keep. It is the fastest way to stop the
        first clozet guessing.
      </PageNote>

      <CalibrationSwipe />
    </main>
  );
}
