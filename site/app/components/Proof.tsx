import { FINAL_PICKS, MAX_BATCHES, MAX_VIEWED } from "@/lib/batching";
import { proof } from "@/lib/copy";
import Reveal from "./Reveal";

/**
 * One claim, three figures, three cards.
 *
 * The page used to answer "what does it do" in four full-screen beats with a
 * macro photograph of cloth in two of them. Every word was true and almost
 * none of it was read: somebody who has not used the thing will not scroll
 * through four screens of prose to decide whether they want to.
 *
 * So the argument is made the way it is actually made - by the arithmetic.
 * Ninety-six looked at and twelve returned says more about how selective this
 * is than a paragraph about selectivity, and a reader takes half a second
 * over it. The three cards under it are the three questions that follow, one
 * sentence each.
 *
 * Both figures are computed from the constants that govern a run, so the page
 * cannot drift from the app. `lib/batching.ts` holds no SDK - the browser
 * bundle imports it already - so this costs nothing.
 */
export default function Proof() {
  const stats = [
    { value: String(MAX_BATCHES * MAX_VIEWED), label: proof.stats.seen, accent: false },
    { value: String(FINAL_PICKS), label: proof.stats.picks, accent: true },
    // The one figure that is a nought, and the one that surprises people:
    // nothing about a run is typed. It is the whole premise, stated as a count.
    { value: "0", label: proof.stats.keywords, accent: false },
  ];

  return (
    <section aria-label="How it picks" className="w-full border-y border-room-line bg-room-panel">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <Reveal>
          <div className="mx-auto max-w-[36ch] text-center">
            <h2 className="display text-room-ink [font-size:clamp(1.9rem,4.2vw,3.1rem)] [text-wrap:balance]">
              {proof.heading}
            </h2>
          </div>
          <p className="mx-auto mt-6 max-w-[58ch] text-center text-[15px] leading-relaxed text-room-muted sm:text-[16px]">
            {proof.body}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          {/*
            Three abreast at every width. They are short enough to stay
            readable on a phone, and stacked they stop being a comparison -
            which is the only reason to put three numbers next to each other.
          */}
          <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-x-4 sm:mt-20">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <dd
                  className={`display leading-none [font-size:clamp(2.6rem,7vw,4.75rem)] ${
                    stat.accent ? "text-accent" : "text-room-ink"
                  }`}
                >
                  {stat.value}
                </dd>
                <dt className="mx-auto mt-4 max-w-[16ch] text-[12px] leading-snug text-room-muted sm:text-[13px]">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal delay={0.16}>
          <ul className="mt-16 grid gap-4 sm:mt-20 md:grid-cols-3">
            {proof.cards.map((card) => (
              <li
                key={card.title}
                className="rounded-[14px] border border-room-line bg-room-bg px-6 py-7"
              >
                <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-room-ink">
                  {card.title}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-room-muted">{card.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
