"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * The one primary action on a screen.
 *
 * Exists as a component rather than a class string because the gradient and
 * the text colour it needs are a pair: `.grad-primary` sets white text, while
 * the flat `bg-brand` buttons used elsewhere set dark text. Hand-applying the
 * gradient across the app would eventually put dark text on a violet button.
 *
 * Tap feedback matches the `whileTap={{ scale: 0.98 }}` already used in
 * app/new, app/generate, app/brain, app/pricing and components/AuthForm — this
 * spreads an existing convention rather than introducing a second one. The
 * global prefers-reduced-motion rule neutralises it for anyone who asks.
 */

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold " +
  "transition-shadow hover:shadow-glow disabled:opacity-50 disabled:pointer-events-none";

/**
 * A short buzz on press, where the platform offers one. Android fires it;
 * iOS Safari has no Vibration API and ignores this silently, which is fine —
 * the scale animation carries the feedback on its own.
 */
function buzz() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(8);
    }
  } catch {
    // Some browsers throw on vibrate inside a non-user gesture. Never let
    // haptics break a button.
  }
}

interface Props {
  children: ReactNode;
  /** Renders a Link when set, a button otherwise. */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  /** Full width on phones, intrinsic from `sm` up — the usual mobile CTA shape. */
  block?: boolean;
}

export default function PrimaryButton({
  children,
  href,
  onClick,
  disabled,
  type = "button",
  className = "",
  block = false,
}: Props) {
  const classes = `${BASE} grad-primary ${block ? "w-full sm:w-auto" : ""} ${className}`;
  const tap = { scale: 0.98 };

  if (href) {
    return (
      <motion.div whileTap={tap} className={block ? "w-full sm:w-auto" : "inline-flex"}>
        <Link href={href} onClick={buzz} className={classes}>
          {children}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      whileTap={tap}
      type={type}
      disabled={disabled}
      onClick={() => {
        buzz();
        onClick?.();
      }}
      className={classes}
    >
      {children}
    </motion.button>
  );
}
