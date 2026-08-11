import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";
import { company } from "@/lib/copy";
import SideNav from "./components/SideNav";

const serif = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: company,
  description: "TODO — the meta description, one sentence.",
};

/**
 * The shell both halves share: one font, one stylesheet, one palette. The
 * marketing walk and the product each add their own layer on top — see the
 * (marketing) and (app) route groups.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable}>
      <body className="min-h-screen antialiased">
        <SideNav />
        {children}
      </body>
    </html>
  );
}
