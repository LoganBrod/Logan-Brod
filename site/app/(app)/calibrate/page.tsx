import AccountBar from "@/app/components/AccountBar";
import CalibrationSwipe from "@/app/components/CalibrationSwipe";

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
      <header className="mb-8">
        <div className="mb-6 flex justify-end">
          <AccountBar />
        </div>
        <h1 className="text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.03em] text-room-ink md:text-[2.5rem]">
          Teach it your eye.
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-room-muted">
          Fifteen real pieces, yes or no. About a minute. What you turn down matters as much as
          what you keep &mdash; it&rsquo;s the fastest way to stop the first clozet guessing.
        </p>
      </header>

      <CalibrationSwipe />
    </main>
  );
}
