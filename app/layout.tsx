import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="min-h-screen bg-roobet-dark antialiased">{children}</body>
    </html>
  );
}
