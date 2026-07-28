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
      {/* No drifting blurred circles behind the page any more: they tinted
          every surface and made the whole app read as floating. The page is a
          flat white sheet, and the banner carries the colour. */}
      <body className="min-h-screen antialiased">
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
