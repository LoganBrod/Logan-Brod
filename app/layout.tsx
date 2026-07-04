import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clip Factory",
  description:
    "Turn raw gambling stream footage into ready-to-post vertical clips with AI captions and hooks.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-ink-border bg-ink-card/60">
          <div className="mx-auto flex max-w-5xl items-baseline gap-3 px-4 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              🎬 Clip <span className="text-brand">Factory</span>
            </Link>
            <span className="text-sm text-neutral-400">
              raw footage → posted clip
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
