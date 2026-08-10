import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";
import { company } from "@/lib/copy";

const serif = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: company,
  description: "TODO — the meta description, one sentence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
