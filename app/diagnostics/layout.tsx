import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Channel Diagnostics | YouTube & Twitch Analytics",
  description:
    "Run diagnostics on any YouTube or Twitch channel: see which videos perform best and why.",
};

export default function DiagnosticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
