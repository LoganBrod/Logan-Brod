import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const serif = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sports Card Tools",
  description: "Card deal finder, player social buzz, and NBA trend tools.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={serif.variable}>
      <body className="min-h-screen bg-ink-bg antialiased">{children}</body>
    </html>
  );
}
