import type { StyleProfile } from "@/lib/schemas";

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded border border-ink-border px-2 py-0.5 text-[11px] text-gray-400"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export default function ProfileCard({ profile }: { profile: StyleProfile }) {
  return (
    <section className="panel p-6 animate-fade-in">
      <p className="label mb-3 text-ink-gold">Your read</p>
      <p className="mb-6 text-lg leading-relaxed text-gray-200">{profile.summary}</p>

      <div className="mb-6 flex flex-wrap gap-2">
        {profile.palette.map((colour) => (
          <div key={`${colour.name}-${colour.hex}`} className="flex items-center gap-2">
            <span
              className="h-6 w-6 rounded-full border border-ink-border"
              style={{ backgroundColor: colour.hex }}
              aria-hidden
            />
            <span className="text-xs text-gray-400">{colour.name}</span>
          </div>
        ))}
      </div>

      <dl className="grid gap-5 sm:grid-cols-2">
        <div>
          <dt className="label mb-1.5">Aesthetic</dt>
          <dd>
            <Chips items={profile.aesthetics} />
          </dd>
        </div>
        <div>
          <dt className="label mb-1.5">Fabrics</dt>
          <dd>
            <Chips items={profile.fabrics} />
          </dd>
        </div>
        <div>
          <dt className="label mb-1.5">Silhouette</dt>
          <dd className="text-sm text-gray-300">{profile.silhouette}</dd>
        </div>
        <div>
          <dt className="label mb-1.5">Formality</dt>
          <dd className="text-sm text-gray-300">{profile.formality}</dd>
        </div>
        {profile.gaps.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="label mb-1.5">What&rsquo;s missing</dt>
            <dd>
              <Chips items={profile.gaps} />
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
