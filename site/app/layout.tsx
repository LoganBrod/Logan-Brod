import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { company } from "@/lib/copy";
import SideNav from "./components/SideNav";

/**
 * Display, text, and figures.
 *
 * The interface was Fraunces over Karla, then Archivo with Fraunces kept for
 * the marketing walk. Fraunces has to go: an old-style display serif over a
 * warm cream ground is the single most recognisable signature of a generated
 * website, and keeping it "only on the walk" still meant it was the first thing
 * anybody read.
 *
 * The replacement is not another serif. Reaching for a serif because a brief
 * feels creative is the same reflex that produced the first one. Outfit is a
 * geometric sans that holds up at poster size, which is the register retail
 * signage is actually set in -- a shop sets its windows in sans and its
 * lookbook in serif, and the mistake was setting everything in lookbook.
 *
 * Archivo stays for text and the interface. It is a neutral grotesque with a
 * slightly condensed cut that carries a size chart and a price without
 * decorating them, and it is better at 13px than a display face is. Display and
 * text as two faces is an ordinary pairing; what is not ordinary, and is banned
 * here, is dropping a serif word into a sans headline for emphasis. That comes
 * from weight or italic of the same family.
 *
 * JetBrains Mono carries prices, sizes, timers and counts. Tabular figures stop
 * a running timer from reflowing the layout every second.
 *
 * (Geist would have been the first choice; it is not in this version of
 * next/font/google, checked rather than assumed.)
 */
const display = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sans = Archivo({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: company,
  description:
    "Clozet reads the clothes you already like and finds real secondhand pieces that belong with them — in your size, in your budget, and still for sale.",
};

/**
 * The shell both halves share: one font, one stylesheet, one palette. The
 * marketing walk and the product each add their own layer on top — see the
 * (marketing) and (app) route groups.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <SideNav />
        {children}
      </body>
    </html>
  );
}
