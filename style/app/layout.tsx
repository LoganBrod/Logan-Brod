import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const serif = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Closet — men's style recommender",
  description:
    "Upload a few pieces you like, get a read on the style, and find real menswear in your price range.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
