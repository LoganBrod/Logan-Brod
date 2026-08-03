"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const STORAGE_KEY = "levoz-theme";

/** Page background per theme, kept in step with the tokens in globals.css. */
const CHROME_COLOR = { dark: "#0f0f11", light: "#fcfbf9" };

/**
 * Point the browser chrome at the theme the user just chose.
 *
 * The tag is rendered server-side for the dark default; without updating it
 * here, switching to light leaves a phone with a dark status bar above a light
 * page, which looks broken in a way that is hard to attribute.
 */
function syncChrome(dark: boolean) {
  const tag = document.querySelector('meta[name="theme-color"]');
  if (tag) tag.setAttribute("content", dark ? CHROME_COLOR.dark : CHROME_COLOR.light);
}

function SunIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="4.5" />
      <path
        d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4l1.4-1.4M18 6l1.4-1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      syncChrome(next);
      return next;
    });
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="relative flex h-7 w-14 shrink-0 items-center rounded-full border border-ink-border bg-ink-deep px-1 transition-colors"
    >
      <span className="flex w-full items-center justify-between px-0.5 text-fog/40">
        <SunIcon />
        <MoonIcon />
      </span>
      {dark !== null && (
        <motion.span
          initial={false}
          animate={{ x: dark ? 26 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="absolute left-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-ink shadow"
        >
          {dark ? <MoonIcon /> : <SunIcon />}
        </motion.span>
      )}
    </button>
  );
}
