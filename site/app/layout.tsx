import type { Metadata } from "next";
import { Archivo, Fraunces } from "next/font/google";
import "./globals.css";
import { company } from "@/lib/copy";
import SideNav from "./components/SideNav";

/**
 * Archivo everywhere the product is, Fraunces only on the marketing walk.
 *
 * The interface used to be set in Fraunces over Karla. Warm cream, an old-style
 * serif and a brass accent is a good-looking combination and also, right now,
 * the single most recognisable signature of a generated website — it was the
 * first thing a visitor read, before any of the writing.
 *
 * Archivo is the answer to that: a neutral grotesque with a slightly condensed
 * cut and a wide weight range, which is the register menswear retail is
 * actually set in. It carries a size chart and a price without decorating them.
 *
 * Fraunces survives on the corridor walk, where a display serif is doing the
 * job it is good at. A shop sets its signage in sans and its lookbook in serif;
 * the mistake was setting everything in lookbook.
 *
 * `soft` and `wonk` are Fraunces' own axes: a little of each keeps the display
 * type from looking like a wedding invitation.
 */
const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const sans = Archivo({
  subsets: ["latin"],
  variable: "--font-sans",
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
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <SideNav />
        {children}
      </body>
    </html>
  );
}
