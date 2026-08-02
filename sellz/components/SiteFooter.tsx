import Link from "next/link";

const GROUPS = [
  {
    title: "Sell",
    links: [
      { href: "/new", label: "New listing" },
      { href: "/generate", label: "Write from text" },
      { href: "/listings", label: "All listings" },
    ],
  },
  {
    title: "Insights",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/analytics", label: "Profit and margins" },
    ],
  },
  {
    title: "Setup",
    links: [
      { href: "/brain", label: "The Brain" },
      { href: "/brain", label: "Connect eBay" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-ink-border/70 bg-ink-deep/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-lg font-extrabold tracking-tight text-fog">
            Levo<span className="text-brand">Z</span>
          </p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-fog/50">
            Listings that learn what sells, priced against what actually sold.
          </p>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="text-sm font-semibold text-fog/60">{g.title}</p>
            <ul className="mt-3 space-y-2">
              {g.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-fog/60 transition-colors hover:text-brand"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-border/60">
        <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-fog/35">
          LevoZ is an independent tool. Not affiliated with eBay or Depop.
        </p>
      </div>
    </footer>
  );
}
