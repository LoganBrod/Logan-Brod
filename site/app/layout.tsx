import type { Metadata } from "next";
import { Fraunces, Karla } from "next/font/google";
import "./globals.css";
import { company } from "@/lib/copy";
import SideNav from "./components/SideNav";

/**
 * Fraunces for display, Karla for everything else.
 *
 * The previous pairing was Playfair over the system UI stack, and the system
 * stack is the problem: on most machines it resolves to the same face every
 * form on the internet is set in, which is why the pages read as a
 * questionnaire rather than as a shop. Fraunces is a warm old-style serif with
 * real quirks — it sits with the cream and brass instead of arguing with them —
 * and Karla is a grotesque with enough character to look chosen.
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

const sans = Karla({
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
