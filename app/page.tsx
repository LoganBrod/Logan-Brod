import Link from "next/link";
import Sidebar from "./components/Sidebar";
import PageHeader from "./components/PageHeader";
import Ticker from "./components/Ticker";

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
    <div className="flex">
      <Sidebar active="/" />

      <main className="flex-1 min-w-0">
        <Ticker
          items={TOOLS.map((t) => ({ label: t.title.toUpperCase(), value: "OPEN", tone: "positive" }))}
        />

        <div className="max-w-5xl mx-auto px-6 py-10">
          <PageHeader
            eyebrow="Live Overview"
            title="Sports Card Intelligence"
            subtitle="Deal scanning, player sentiment, and performance-vs-market tools in one place."
          />

          <div className="grid gap-6 md:grid-cols-3">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="bg-ink-card border border-ink-border rounded-2xl p-6 card-glow hover:border-ink-gold/50 transition-colors"
              >
                <h2 className="text-white font-bold text-lg mb-2">{tool.title}</h2>
                <p className="text-gray-500 text-sm">{tool.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
