import Clock from "@/components/Clock";
import {
  getBusinesses,
  getOpenQuestions,
  getDecisions,
  getLatestWeekly,
} from "@/lib/memory";

// Never cache. The whole point is that editing a note changes the wall.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const [businesses, questions, decisions, weekly] = await Promise.all([
    getBusinesses(),
    getOpenQuestions(),
    getDecisions(),
    getLatestWeekly(),
  ]);

  return (
    // Flex column rather than a fixed 6-row grid. Grid rows sized by fraction
    // clipped the header the moment the clock grew — flex lets the header take
    // exactly what it needs and gives the rest to the panels.
    <main className="flex h-screen flex-col gap-5 p-8">
      <header className="flex shrink-0 items-start justify-between">
        <Clock />
        <div className="flex items-center gap-3 pt-3 text-sm uppercase tracking-[0.3em] text-accent/60">
          <span className="breathe h-2.5 w-2.5 rounded-full bg-accent" />
          memory online
        </div>
      </header>

      {/* min-h-0 is what stops a flex child from refusing to shrink below its
          content and pushing the panel edges off-screen. */}
      <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-5 gap-5">
        <Panel title="Projects" className="col-span-5 row-span-3">
          {businesses.length === 0 ? (
            <Empty>No files in memory/businesses/</Empty>
          ) : (
            <ul className="space-y-5">
              {businesses.map((b) => (
                <li key={b.slug}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-3xl font-semibold text-white">
                      {b.name}
                    </h3>
                    {b.stage && (
                      <span className="rounded-full border border-edge px-3 py-0.5 text-xs uppercase tracking-wider text-white/50">
                        {firstSentence(b.stage)}
                      </span>
                    )}
                  </div>
                  {b.whatItIs && (
                    <p className="mt-2 text-lg leading-snug text-white/60">
                      {truncate(b.whatItIs, 170)}
                    </p>
                  )}
                  {b.bottleneck && !/^unknown/i.test(b.bottleneck) && (
                    <p className="mt-2 text-base leading-snug text-warn/80">
                      Bottleneck: {truncate(b.bottleneck, 110)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Open questions"
          count={questions.length}
          className="col-span-7 row-span-3"
        >
          {questions.length === 0 ? (
            <Empty>Nothing unresolved.</Empty>
          ) : (
            <ul className="space-y-4">
              {questions.slice(0, 5).map((q, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn/70" />
                  <div className="min-w-0">
                    <p className="text-xl leading-snug text-white/85">
                      {q.question}
                    </p>
                    {q.context && (
                      <p className="mt-1 text-sm leading-snug text-white/35">
                        {truncate(q.context, 105)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
              {questions.length > 5 && (
                <li className="pl-6 text-sm uppercase tracking-widest text-white/25">
                  +{questions.length - 5} more
                </li>
              )}
            </ul>
          )}
        </Panel>

        <Panel title="This week" className="col-span-7 row-span-2">
          {weekly && weekly.lines.length > 0 ? (
            <>
              <p className="mb-2 text-lg text-accent/60">{weekly.heading}</p>
              <ul className="space-y-1.5">
                {weekly.lines.slice(0, 5).map((line, i) => (
                  <li key={i} className="text-lg leading-snug text-white/70">
                    {truncate(line, 110)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty>Nothing written in memory/weekly.md yet.</Empty>
          )}
        </Panel>

        <Panel title="Recent decisions" className="col-span-5 row-span-2">
          {decisions.length === 0 ? (
            <Empty>Nothing logged.</Empty>
          ) : (
            <ul className="space-y-3">
              {decisions.slice(0, 3).map((d, i) => (
                <li key={i} className="flex gap-4">
                  <span className="shrink-0 font-mono text-sm text-accent/50">
                    {d.date.slice(5)}
                  </span>
                  <span className="text-base leading-snug text-white/70">
                    {truncate(d.decision, 85)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  );
}

function Panel({
  title,
  count,
  className = "",
  children,
}: {
  title: string;
  count?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`panel flex min-h-0 flex-col ${className}`}>
      <h2 className="panel-title shrink-0">
        {title}
        {count !== undefined && count > 0 && (
          <span className="ml-2 text-white/30">{count}</span>
        )}
      </h2>
      {/* overflow-hidden here, not on the panel, so the rounded border is
          never clipped by the scrolling box. */}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-lg italic text-white/25">{children}</p>;
}

function firstSentence(text: string): string {
  return (text.split(/\.\s|\./)[0] ?? text).trim();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}
