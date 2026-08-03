import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
import SiteFooter from "@/components/SiteFooter";
import PageTransition from "@/components/PageTransition";
import { ToastProvider } from "@/components/Toast";
import { SessionProvider } from "next-auth/react";

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

/**
 * Dark is the default, not the system preference.
 *
 * This is a brand decision rather than a technical one: the apps this audience
 * already lives in are dark, and a light flash on first paint reads as "website"
 * where dark reads as "app". Light mode stays available through the toggle —
 * it genuinely helps when someone is photographing items in daylight, which is
 * exactly when they use this — but it is now opt-in rather than inherited.
 *
 * `stored ? ... : true` is the whole change: an explicit choice still wins.
 */
const THEME_INIT_SCRIPT = `
  try {
    var stored = localStorage.getItem("levoz-theme");
    var isDark = stored ? stored === "dark" : true;
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
`;

/**
 * Without this, mobile Safari paints a white status bar above a dark app —
 * the single most obvious "this is a website in a browser" tell there is.
 * ThemeToggle rewrites the tag when the user switches, so the chrome follows.
 */
export const viewport: Viewport = {
  themeColor: "#0f0f11",
  colorScheme: "dark light",
};

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
        <SessionProvider>
          <ToastProvider>
            <TopNav />
            <main className="relative">
              <PageTransition>{children}</PageTransition>
            </main>
            <SiteFooter />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
