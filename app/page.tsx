import Link from "next/link";
import SiteNav from "./components/SiteNav";

const TOOLS = [
  {
    href: "/cards",
    title: "Card Deals",
    description:
      "Scans active eBay sports card listings and flags ones priced at or below a fraction of the market comp price.",
  },
  {
    href: "/buzz",
    title: "Player Buzz",
    description: "Recent Reddit mentions for a player, scored for sentiment.",
  },
  {
    href: "/nba",
    title: "NBA Trends",
    description:
      "Compares a player's recent scoring trend to their season average, alongside a card market price snapshot.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-roobet-dark">
      <header className="border-b border-roobet-border bg-roobet-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-white font-bold text-lg">Tools</h1>
          <SiteNav active="/" />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="bg-roobet-card border border-roobet-border rounded-2xl p-6 card-glow hover:border-roobet-gold/50 transition-colors"
            >
              <h2 className="text-white font-bold text-lg mb-2">{tool.title}</h2>
              <p className="text-gray-400 text-sm">{tool.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
