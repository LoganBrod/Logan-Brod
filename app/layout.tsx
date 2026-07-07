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
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-fog/40">
              long footage → posted clip
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
