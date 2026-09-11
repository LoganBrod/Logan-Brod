import Link from "next/link";
import { CONTACT_EMAIL, JURISDICTION, MIN_AGE, OPERATOR, UPDATED } from "@/lib/legal";

export const metadata = {
  title: "Terms — LevoZ Labs",
  description: "What Clozet does, what it doesn't promise, and the rules for using it.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-[1.25rem] font-semibold tracking-[-0.01em] text-room-ink">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-room-muted">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 pb-24 pt-24">
      <header>
        <h1 className="display text-[2rem] text-room-ink sm:text-[2.6rem]">Terms.</h1>
        <p className="mt-5 text-[15px] leading-relaxed text-room-muted">
          Using this site means agreeing to these. Last updated {UPDATED}.
        </p>
      </header>

      <Section title="What this is">
        <p>
          {OPERATOR} runs Clozet, which reads photographs of clothes you like and finds real
          listings that go with them. It is run by one person, not a company.
        </p>
        <p>
          It is a beta. Things will break, recommendations will sometimes be wrong, and
          features will change or disappear. If something breaks, the{" "}
          <Link href="/feedback" className="text-room-ink underline underline-offset-2">
            report page
          </Link>{" "}
          is read by the person who can fix it.
        </p>
      </Section>

      <Section title="We sell nothing">
        <p>
          Every piece Clozet shows you belongs to somebody else — eBay sellers, retailers,
          and the brands&rsquo; own shops. We hold no stock, take no payment for anything you
          buy, and are not a party to any purchase you make. The price, the condition, the
          description, the photographs, the shipping, the returns policy and the
          authenticity of a listing are the seller&rsquo;s, not ours.
        </p>
        <p>
          Listings move fast. Something shown here may already be sold, may cost something
          different by the time you click, or may not be what its listing claims. Check
          before you buy, and take any problem with a purchase up with the seller.
        </p>
        <p>
          We are not paid by anybody to show you anything. There are no affiliate links, no
          sponsored placements and no arrangement with any brand named anywhere on this site.
          Naming a brand is not an endorsement by them of us, or by us of them. If that ever
          changes, it will be disclosed on the page where it applies before it goes live.
        </p>
      </Section>

      <Section title="Sizing and fit are opinions, not promises">
        <p>
          The sizing tool reads published size guides and compares them to the measurements
          you gave us. It is a considered guess and nothing more. Brands are inconsistent,
          size guides are often wrong, garments vary between production runs, and a
          secondhand piece may have shrunk or been altered.
        </p>
        <p>
          Do not treat &ldquo;medium is recommended&rdquo; as a guarantee that a medium will
          fit. Check the seller&rsquo;s own measurements and their returns policy before
          buying something you cannot send back. We are not responsible for a garment that
          does not fit.
        </p>
      </Section>

      <Section title="Your photographs and your account">
        <p>
          Upload only photographs you have the right to use. You keep whatever rights you
          have in them; you give us permission to send them to be analysed for the purpose
          of building you a clozet, and nothing else. We do not store them — see the{" "}
          <Link href="/privacy" className="text-room-ink underline underline-offset-2">
            privacy page
          </Link>
          .
        </p>
        <p>
          Keep your password to yourself, and tell us if you think somebody else has it. You
          are responsible for what happens under your account.
        </p>
        <p>
          You must be at least {MIN_AGE} years old to use this site, or older if the law
          where you live sets a higher age for agreeing to something like this.
        </p>
      </Section>

      <Section title="Fair use">
        <p>Don&rsquo;t:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>scrape the site, or automate it in a way a person could not do by hand;</li>
          <li>
            work around the limits on how many clozets, searches or lookups you can run —
            each one costs real money to answer;
          </li>
          <li>upload anything illegal, or anything that is not a photograph of clothing;</li>
          <li>
            try to break the site, read other people&rsquo;s saved clozets, or get at
            anything you have not been given.
          </li>
        </ul>
        <p>
          We can suspend or delete an account that does any of these, or that is costing more
          to serve than is reasonable, without notice. We would rather write to you first,
          and usually will.
        </p>
      </Section>

      <Section title="Free and paid">
        <p>
          The free tier gives you three clozets a week, resetting every Monday. Those numbers
          can change, and if they do the site will say so rather than quietly refusing you.
        </p>
        <p>
          There is nothing to pay for today. If paid membership arrives, its price and terms
          will be shown before you are asked for anything, and nothing you have already built
          will be taken away from you to sell back.
        </p>
      </Section>

      <Section title="No warranty, and what we are liable for">
        <p>
          The site is provided as it is. We do not promise it will be available, that it will
          be free of mistakes, or that anything it recommends will suit you, fit you, still
          be for sale, or be genuine.
        </p>
        <p>
          To the fullest extent the law allows, {OPERATOR} is not liable for anything you
          lose through using the site — including a purchase that disappointed you, a
          garment that did not fit, a listing that turned out to be misdescribed, or a clozet
          that expired. Nothing here limits liability for anything that cannot lawfully be
          limited, including death or personal injury caused by negligence, or fraud.
        </p>
        <p>
          Your consumer rights against the actual seller of anything you buy are unaffected
          by this page, and are not ours to limit.
        </p>
      </Section>

      <Section title="Ending it">
        <p>
          You can stop using the site whenever you like, and have your account deleted by
          emailing{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20account`}
            className="text-room-ink underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
          . Saved clozets expire ninety days after they are built whether or not you do
          anything.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          These terms will change as the product does. The date at the top says when they
          last did. Carrying on using the site after a change means accepting it; if you
          don&rsquo;t, stop using it and ask us to delete your account.
        </p>
        {JURISDICTION && <p>These terms are governed by the laws of {JURISDICTION}.</p>}
        <p>
          Questions go to{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-room-ink underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <p className="mt-14 border-t border-room-line pt-6 text-[13px] text-room-faint">
        See also the{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          privacy page
        </Link>
        .
      </p>
    </main>
  );
}
