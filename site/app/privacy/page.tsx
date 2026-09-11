import Link from "next/link";
import { CONTACT_EMAIL, OPERATOR, RETENTION, THIRD_PARTIES, UPDATED } from "@/lib/legal";

/**
 * Outside both route groups, like /terms and /admin.
 *
 * The (marketing) layer mounts smooth scroll, which is wrong for a document
 * somebody is trying to find one line in, and the (app) shell mounts the
 * corner dock, which is wrong above a privacy policy.
 */
export const metadata = {
  title: "Privacy — LevoZ Labs",
  description: "What Clozet stores, what leaves this server, and how to have it deleted.",
};

/** A heading and its prose, so the page's rhythm is defined once. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-[1.25rem] font-semibold tracking-[-0.01em] text-room-ink">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-room-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 pb-24 pt-24">
      <header>
        <h1 className="display text-[2rem] text-room-ink sm:text-[2.6rem]">Privacy.</h1>
        <p className="mt-5 text-[15px] leading-relaxed text-room-muted">
          Written to be read rather than to be defensible. Last updated {UPDATED}.
        </p>
      </header>

      <Section title="The short version">
        <p>
          Your photographs are never written down. They are sent to Anthropic, read, and
          dropped — there is no folder of them anywhere, and there is no version of this
          site where there is. What is kept is a description of what you liked, filed
          against a random number in a cookie rather than against your name.
        </p>
        <p>
          Nothing here is sold, and nothing is shared with anybody except the five services
          listed below that are needed to make it work. There is no advertising network, no
          tracking pixel, and no third-party analytics script on any page of this site.
        </p>
      </Section>

      <Section title="Your photographs">
        <p>
          They are resized in your browser, sent to our server, and passed straight to
          Anthropic&rsquo;s API to be read. They are never saved to disk and never written to
          the database. When the request finishes they are gone.
        </p>
        <p>
          Anthropic does not train models on what is sent through the API. What comes back to
          us is a description in words — &ldquo;waxed cotton, olive, mid-length&rdquo; — and
          that description is what the searches are built from.
        </p>
        <p>
          If you catalogue clothes you own, the same is true: the photographs pass through,
          and only the written description of each piece is stored.
        </p>
      </Section>

      <Section title="Who you are, as far as this site knows">
        <p>
          If you have never signed in, you are a random identifier in a cookie called{" "}
          <code className="text-room-ink">taste_id</code>. It is not linked to a name, an
          address or an email, and it exists so that the second clozet you build knows what
          you thought of the first. Clearing your cookies ends it permanently — we have no
          way to reconnect you to it, which is the trade that makes it private.
        </p>
        <p>
          If you do sign in, we store your email address and a scrypt hash of your password.
          A hash cannot be turned back into a password, by us or by anybody who takes a copy
          of the database. Your email is used to sign you in and to send you a digest if you
          ask for one. It is never sold, never rented, and never used to send you anything
          you did not ask for.
        </p>
      </Section>

      <Section title="Counting visitors">
        <p>
          We count how many people arrive and where from, because otherwise there is no way
          to know whether any of this is working. It is done without a tracking cookie and
          without a third party.
        </p>
        <p>
          A visitor is counted as a one-way hash of the date, a secret, your IP address and
          your browser&rsquo;s user-agent string. That hash is added to a structure which can
          answer &ldquo;how many different people&rdquo; and cannot answer &ldquo;was this
          one of them&rdquo;. The hash itself is never stored. Because the date is part of
          what is hashed, the same person tomorrow is a different number — so there is
          nothing that follows anybody between days, and nothing to hand over if somebody
          asked.
        </p>
        <p>
          What is kept is counts: how many visits, which pages, which referrer, and how many
          people reached each step. That is the whole of it.
        </p>
      </Section>

      <Section title="What is kept, and for how long">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-room-line">
                <th className="py-2 pr-4 font-semibold text-room-ink">What</th>
                <th className="py-2 pr-4 font-semibold text-room-ink">How long</th>
                <th className="py-2 font-semibold text-room-ink">Why</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION.map((row) => (
                <tr key={row.what} className="border-b border-room-line/60 align-top">
                  <td className="py-3 pr-4 text-room-ink">{row.what}</td>
                  <td className="py-3 pr-4 whitespace-nowrap text-room-muted">{row.how}</td>
                  <td className="py-3 text-room-muted">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Everything above expires on its own. Nothing needs a person to remember to delete
          it, which is the only kind of retention policy that survives contact with reality.
        </p>
      </Section>

      <Section title="What leaves this server">
        <ul className="space-y-4">
          {THIRD_PARTIES.map((party) => (
            <li key={party.name}>
              <p className="font-semibold text-room-ink">{party.name}</p>
              <p className="mt-1">{party.what}</p>
              <p className="mt-1 text-room-faint">{party.why}</p>
            </li>
          ))}
        </ul>
        <p>That is the complete list. If it changes, this page changes with it.</p>
      </Section>

      <Section title="Cookies">
        <p>
          Three, all first-party, none of them for advertising. A random taste identifier; a
          session token if you are signed in; and a short-lived note of which quiz steps you
          have already seen. There is no cookie used to count visitors, which is why there is
          no cookie banner on this site.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          Email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20account`}
            className="text-room-ink underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          from the address you signed up with and we will delete the account, its email
          address, its password hash and its saved clozets within 30 days, usually the same
          week. You do not have to give a reason and you will not be asked for one.
        </p>
        <p>
          If you have never signed in, there is no account to delete: clear your cookies and
          the random identifier is gone, along with our ability to connect anything to you.
        </p>
        <p>
          You can also ask for a copy of what is held about you, or for something to be
          corrected, at the same address.
        </p>
      </Section>

      <Section title="Children">
        <p>
          This site is not for people under 13, and we do not knowingly keep anything about
          anybody under that age. If you believe we have, email us and it will be deleted.
        </p>
      </Section>

      <Section title="Changes, and how to reach us">
        <p>
          If this page changes in a way that matters, the date at the top changes and the
          change is described here rather than quietly absorbed.
        </p>
        <p>
          {OPERATOR} is run by one person, not a company.{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-room-ink underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          reaches them directly.
        </p>
      </Section>

      <p className="mt-14 border-t border-room-line pt-6 text-[13px] text-room-faint">
        See also the <Link href="/terms" className="underline underline-offset-2">terms</Link>.
      </p>
    </main>
  );
}
