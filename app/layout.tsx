import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roobet Wager Leaderboard | lmb1",
  description: "Track the top wagers for the lmb1 Roobet affiliate leaderboard competition.",
  icons: {
    icon: "https://roobet.com/favicon.ico",
  },
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
