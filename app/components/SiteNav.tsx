import Link from "next/link";

const LINKS = [
  { href: "/", label: "Leaderboard" },
  { href: "/cards", label: "Card Deals" },
  { href: "/buzz", label: "Player Buzz" },
  { href: "/nba", label: "NBA Trends" },
];

export default function SiteNav({ active }: { active: string }) {
  return (
    <nav className="flex gap-1 flex-wrap">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            link.href === active
              ? "bg-roobet-gold text-roobet-dark"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
