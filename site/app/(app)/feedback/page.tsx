import FeedbackForm from "@/app/components/FeedbackForm";
import PageHeader, { PageNote } from "@/app/components/PageHeader";

export const metadata = {
  title: "Tell us what's wrong — Clozet",
  description: "Report a bug or suggest something. No account needed.",
};

/**
 * Where a beta sends people who found something.
 *
 * Its own route rather than a widget in a corner, because a page can be linked
 * to - from the beta notice, from a reply, from a TikTok comment - and a
 * widget can only be found by someone already looking at the right screen.
 */
export default function FeedbackPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-14 pt-6">
      <PageHeader
        title={<>Tell us what&rsquo;s wrong.</>}
        lede="This is a beta and it has rough edges. Pointing at one is the most useful thing you can do."
        action={{ href: "/closet", label: "Back to Clozet" }}
      />

      <PageNote>
        Everything here is read by the person building it, usually the same day. If something
        recommended you a jacket in the wrong size, hung on a search that never finished, or
        just picked badly, that is worth knowing — &ldquo;the results were bad&rdquo; is a
        report, and so is &ldquo;this button did nothing&rdquo;.
      </PageNote>

      <FeedbackForm />
    </main>
  );
}
