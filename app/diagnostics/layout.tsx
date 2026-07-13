import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LevoZ | Channel Diagnostics",
  description:
    "LevoZ channel diagnostics: analyze any YouTube, Twitch, or Kick channel to see which videos perform best and why.",
};

export default function DiagnosticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-levoz-dark">
      <header className="flex justify-center pt-8">
        <a
          href="/diagnostics"
          className="levoz-glow rounded-2xl border border-levoz-border bg-levoz-card px-8 py-3 text-2xl font-extrabold tracking-tight text-white"
        >
          Levo<span className="text-levoz-teal">Z</span>
        </a>
      </header>
      {children}
    </div>
  );
}
