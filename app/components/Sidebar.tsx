import Link from "next/link";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/cards", label: "Card Deals" },
  { href: "/buzz", label: "Player Buzz" },
  { href: "/nba", label: "NBA Trends" },
];

function NavItems({ active }: { active: string }) {
  return (
    <>
      {LINKS.map((link) => {
        const isActive = link.href === active;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium uppercase tracking-widest transition-colors ${
              isActive
                ? "bg-ink-maroon text-ink-gold"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {!isActive && <span className="w-1 h-1 rounded-full bg-ink-gold shrink-0" />}
            {link.label}
          </Link>
        );
      })}
    </>
  );
}

export default function Sidebar({ active }: { active: string }) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:shrink-0 border-r border-ink-border bg-ink-bg min-h-screen sticky top-0">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="w-9 h-9 rounded-lg bg-ink-gold text-ink-bg font-bold flex items-center justify-center text-sm shrink-0">
            SC
          </div>
          <div className="leading-tight">
            <p className="text-gray-500 text-[10px] uppercase tracking-widest">Sports Card</p>
            <p className="text-ink-gold font-bold text-sm uppercase tracking-widest">Tools</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 px-3 flex-1">
          <NavItems active={active} />
        </nav>

        <div className="px-5 py-4 border-t border-ink-border">
          <p className="text-gray-600 text-[10px] uppercase tracking-widest">Intelligence v1.0</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden border-b border-ink-border bg-ink-bg sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
          <div className="w-7 h-7 rounded-md bg-ink-gold text-ink-bg font-bold flex items-center justify-center text-xs shrink-0">
            SC
          </div>
          <nav className="flex gap-1 flex-wrap">
            <NavItems active={active} />
          </nav>
        </div>
      </div>
    </>
  );
}
