import type { Recommendation } from "@/lib/crossref";
import type { WebFinding } from "@/lib/research";

// Status is always shown as icon + label, never color alone
const STATUS: Record<
  Recommendation["status"],
  { label: string; icon: string; classes: string }
> = {
  adjust: {
    label: "Adjust",
    icon: "▲",
    classes: "border-roobet-amber/40 bg-roobet-amber/10 text-roobet-amber",
  },
  opportunity: {
    label: "Opportunity",
    icon: "◆",
    classes: "border-roobet-gold/40 bg-roobet-gold/10 text-roobet-gold",
  },
  aligned: {
    label: "Aligned",
    icon: "✓",
    classes: "border-roobet-green/40 bg-roobet-green/10 text-roobet-green",
  },
};

export default function Recommendations({
  recommendations,
  webFindings,
}: {
  recommendations: Recommendation[];
  webFindings: WebFinding[] | null;
}) {
  return (
    <div className="space-y-3">
      {recommendations.map((rec) => {
        const s = STATUS[rec.status];
        return (
          <div
            key={rec.id}
            className="rounded-xl border border-roobet-border bg-roobet-card p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-white">{rec.topic}</h3>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.classes}`}
              >
                {s.icon} {s.label}
              </span>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Your data
                </dt>
                <dd className="mt-0.5 text-gray-200">{rec.yourData}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  What the research says
                </dt>
                <dd className="mt-0.5 text-gray-400">{rec.industry}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Do this
                </dt>
                <dd className="mt-0.5 font-medium text-roobet-gold">{rec.action}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {rec.sources.map((src) => (
                <a
                  key={src.url}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 underline decoration-dotted hover:text-gray-300"
                >
                  {src.name}
                </a>
              ))}
            </div>
          </div>
        );
      })}

      {webFindings && webFindings.length > 0 && (
        <div className="rounded-xl border border-roobet-border bg-roobet-card p-4">
          <h3 className="font-semibold text-white">🌐 Fresh from the web</h3>
          <p className="mt-1 text-xs text-gray-500">
            Live research pulled just now to keep the benchmarks current.
          </p>
          <ul className="mt-3 space-y-3">
            {webFindings.map((f) => (
              <li key={f.url} className="text-sm">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-gray-200 underline decoration-dotted hover:text-roobet-gold"
                >
                  {f.title}
                </a>
                <p className="mt-0.5 text-gray-400">{f.snippet}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {webFindings === null && (
        <p className="text-xs text-gray-600">
          Tip: set <code className="text-gray-500">TAVILY_API_KEY</code> to also pull
          live web research alongside these curated benchmarks.
        </p>
      )}
    </div>
  );
}
