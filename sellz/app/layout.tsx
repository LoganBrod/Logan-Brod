import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import PageTransition from "@/components/PageTransition";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "SellZ — listings that learn",
  description:
    "Grade your marketplace listings on real sales, learn why items sell (or don't), research comps, and generate better listings.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] animate-blob rounded-full bg-brand/10 blur-3xl" />
          <div className="absolute -right-32 top-1/3 h-[26rem] w-[26rem] animate-blob-slow rounded-full bg-brand/5 blur-3xl" />
        </div>
        <ToastProvider>
          <Sidebar />
          <main className="relative ml-60 min-h-screen px-8 py-8">
            <div className="mx-auto max-w-5xl">
              <PageTransition>{children}</PageTransition>
            </div>
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
