import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Jarvis } from "@/components/Jarvis";
import { brief, tests, daysUntil } from "@/lib/vault";

export const metadata: Metadata = { title: "School OS", description: "Notes, tests and study plan in one place.", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#1a1b20", width: "device-width", initialScale: 1, viewportFit: "cover" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const name = process.env.USER_NAME || "";
  const [b, ts] = await Promise.all([brief(), tests()]);
  const h = new Date().getHours();
  const hello = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const one = b && b.date === new Date().toISOString().slice(0, 10) ? b.text.split(/## One thing/)[1]?.replace(/[#*_]/g, "").trim().split("\n")[0] : "";
  const next = ts[0];
  const greeting = `${hello}${name ? `, ${name}` : ""}. ${one ? one : next ? `${next.course} ${next.kind} in ${daysUntil(next.when)} days. Nothing pressing before then.` : "Nothing on the books today."}`;
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-[100dvh]">
        <Nav />
        <main className="px-4 pt-6 pb-24 md:pb-10 md:pl-64 md:pr-8 max-w-[1400px]">{children}</main>
        <Jarvis wakeWord={process.env.WAKE_WORD || "jarvis"} name={name} voice={process.env.VOICE_NAME} greeting={greeting} />
      </body>
    </html>
  );
}
