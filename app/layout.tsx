import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LevoZ — clip anything",
  description:
    "Turn long footage — streams, sports, podcasts, YouTube videos — into ready-to-post vertical clips with AI captions, hooks, and a custom outro.",
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
                Levo<span className="text-brand">Z</span>
              </span>
              <span className="mt-0.5 block h-[3px] w-2/3 rounded-full bg-brand transition-all group-hover:w-full" />
            </Link>
            <nav className="flex items-center gap-4 text-sm font-semibold">
              <Link href="/" className="text-fog/70 transition hover:text-brand">
                Library
              </Link>
              <Link href="/live" className="text-fog/70 transition hover:text-brand">
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" />
                Live
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
