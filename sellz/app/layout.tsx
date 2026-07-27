import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
import SiteFooter from "@/components/SiteFooter";
import PageTransition from "@/components/PageTransition";
import { ToastProvider } from "@/components/Toast";

// Self-hosted at build time by next/font, so no render-blocking Google link
// and no layout shift while the face loads.
const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "LevoZ: listings that learn",
  description:
    "Photograph an item and LevoZ identifies it, prices it against real sales, writes the listing, and posts it to eBay once you approve.",
};

const THEME_INIT_SCRIPT = `
  try {
    var stored = localStorage.getItem("levoz-theme");
    var isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={outfit.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] animate-blob rounded-full bg-brand/10 blur-3xl" />
          <div className="absolute -right-32 top-1/3 h-[26rem] w-[26rem] animate-blob-slow rounded-full bg-brand/5 blur-3xl" />
        </div>
        <ToastProvider>
          <TopNav />
          <main className="relative">
            <PageTransition>{children}</PageTransition>
          </main>
          <SiteFooter />
        </ToastProvider>
      </body>
    </html>
  );
}
