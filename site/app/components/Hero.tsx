import Link from "next/link";
import { hero } from "@/lib/copy";

/**
 * The front door.
 *
 * Sized to what it holds rather than to the viewport: tall enough to read as
 * an opening, short enough that the corridor's frame shows under it on a
 * laptop, so a visitor knows there is more without being told. Centred on
 * purpose - this is a manifesto line, and the one place on the site where
 * centring is the message rather than a default.
 *
 * Plain document flow, no scroll machinery, nothing waiting on an observer:
 * the first still frame of the page is the whole pitch.
 */
export default function Hero() {
  return (
    <section
      aria-label="Clozet"
      className="relative flex min-h-[58svh] w-full flex-col items-center justify-center px-6 pb-10 pt-20 text-center sm:pb-14 sm:pt-28"
    >
      <h1 className="display max-w-[22ch] text-room-ink [font-size:clamp(2.6rem,7vw,5.6rem)] [text-wrap:balance]">
        {hero.line}
      </h1>
      <p className="mt-7 max-w-[46ch] text-[15px] leading-relaxed text-room-muted sm:text-[17px]">
        {hero.sub}
      </p>
      <Link href={hero.href} className="btn-primary mt-10 px-10 py-4 text-[13px]">
        {hero.cta}
      </Link>
      <p className="mt-4 text-[12px] text-room-faint">{hero.note}</p>
    </section>
  );
}
