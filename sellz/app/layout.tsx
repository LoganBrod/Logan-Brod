import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SellZ — listings that learn",
  description:
    "Grade your marketplace listings on real sales, learn why items sell (or don't), research comps, and generate better listings.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-ink-border/60 bg-ink/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <Link href="/" className="group inline-block">
              <span className="text-2xl font-extrabold tracking-tight text-fog">
                Sell<span className="text-brand">Z</span>
              </span>
              <span className="mt-0.5 block h-[3px] w-2/3 rounded-full bg-brand transition-all group-hover:w-full" />
            </Link>
            <nav className="flex items-center gap-4 text-sm font-semibold">
              <Link href="/" className="text-fog/70 transition hover:text-brand">
                Brain
              </Link>
              <Link
                href="/listings"
                className="text-fog/70 transition hover:text-brand"
              >
                Listings
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
