import Link from "next/link";
import { House, BookOpen, CalendarBlank, Bell, Exam, ChatCircleDots } from "@phosphor-icons/react/dist/ssr";
import { notifications, tests, idToSlug } from "@/lib/vault";

export async function Nav() {
  const unread = (await notifications()).filter((n) => !n.read).length;
  const next = (await tests())[0];
  const items = [
    { href: "/", label: "Home", Icon: House },
    { href: "/chat", label: "Ask", Icon: ChatCircleDots },
    { href: "/courses", label: "Notes", Icon: BookOpen },
    { href: next ? `/study/${idToSlug(next.id)}` : "/courses", label: "Study", Icon: Exam },
    { href: "/week", label: "Week", Icon: CalendarBlank },
    { href: "/notifications", label: "Inbox", Icon: Bell, badge: unread },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 border-t md:border-t-0 md:border-r md:inset-y-0 md:left-0 md:w-56 md:flex md:flex-col md:pt-7" style={{ background: "rgb(8 8 10 / 0.6)", borderColor: "var(--line)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
      <div className="hidden md:block px-6 pb-8 text-sm tracking-[0.18em] uppercase" style={{ color: "var(--muted)" }}>School OS</div>
      <ul className="grid grid-cols-6 md:flex md:flex-col md:gap-1 md:px-3">
        {items.map(({ href, label, Icon, badge }) => (
          <li key={label}>
            <Link href={href} className="pressable flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 py-2.5 md:px-3 md:py-2 rounded-xl text-[11px] md:text-sm hover:bg-[var(--surface-2)]" style={{ color: "var(--muted)" }}>
              <span className="relative">
                <Icon size={20} weight="light" />
                {badge ? <span className="absolute -top-1.5 -right-2 mono text-[10px] px-1 rounded-full accent-bg" style={{ ["--accent" as string]: 30 }}>{badge}</span> : null}
              </span>
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
