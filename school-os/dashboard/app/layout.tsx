import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Jarvis } from "@/components/Jarvis";

export const metadata: Metadata = { title: "School OS", description: "Notes, tests and study plan in one place.", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#1a1b20", width: "device-width", initialScale: 1, viewportFit: "cover" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-[100dvh]">
        <Nav />
        <main className="px-4 pt-6 pb-24 md:pb-10 md:pl-64 md:pr-8 max-w-[1400px]">{children}</main>
        <Jarvis wakeWord={process.env.WAKE_WORD || "jarvis"} name={process.env.USER_NAME || ""} />
      </body>
    </html>
  );
}
