"use client";
import { useEffect, useState } from "react";

/** The first thing you see: a greeting that fades in, then the brief. */
export function Greeting({ name, hasBrief, subtitle }: { name: string; hasBrief: boolean; subtitle: string }) {
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);
  const word = hour === null ? "Hello" : hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <header className="pt-2 md:pt-8 pb-2">
      <h1 className="display text-4xl md:text-6xl leading-[1.05] rise" style={{ ["--i" as string]: 0 }}>
        {word}{name ? `, ${name}` : ""}.
      </h1>
      <p className="mt-3 text-lg md:text-xl rise" style={{ color: "var(--muted)", ["--i" as string]: 1 }}>
        {hasBrief ? "Here's your brief for today." : subtitle}
      </p>
    </header>
  );
}
