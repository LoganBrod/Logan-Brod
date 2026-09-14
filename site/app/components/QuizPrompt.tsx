"use client";

import { useRouter } from "next/navigation";

/**
 * The offer to take the calibration quiz, above the three steps.
 *
 * A link to `/closet?quiz=1` did not work, and the reason is worth writing
 * down. The parameter is read once, in the runner's mount effect. Clicking a
 * link to the page you are already on is a soft navigation: the address
 * changes, React keeps the runner in the same slot, the effect never runs
 * again, and nothing happens. It worked from the front page - a real
 * navigation, a real mount - and silently did nothing everywhere else, which
 * is the worst shape a bug can have.
 *
 * So it asks the runner directly. The event is cancellable and the runner
 * calls preventDefault on it, which is how this knows somebody was listening:
 * if nothing was - the quiz is not on this page - it falls back to navigating,
 * and the mount effect handles it the old way.
 */
export default function QuizPrompt() {
  const router = useRouter();

  function open() {
    const heard = !window.dispatchEvent(new CustomEvent("clozet:quiz", { cancelable: true }));
    if (!heard) router.push("/closet?quiz=1");
  }

  return (
    <button
      type="button"
      onClick={open}
      className="panel mb-6 flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 text-left transition-colors duration-200 ease-out hover:border-accent/30"
    >
      <span className="text-[14px] font-semibold text-room-ink">Take the 15-swipe quiz first</span>
      <span className="text-[13px] text-room-muted">
        One minute, and it makes everything it picks far more your taste.
      </span>
      <span aria-hidden className="ml-auto text-[13px] font-semibold text-accent">
        Start &rarr;
      </span>
    </button>
  );
}
