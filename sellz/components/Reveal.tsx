"use client";

import { motion } from "framer-motion";

/** Staggered fade-up wrapper for grids/lists. Wrap each item with `<Reveal index={i}>`. */
export default function Reveal({
  children,
  index = 0,
  className = "",
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className={`min-w-0 ${className}`}
    >
      {children}
    </motion.div>
  );
}
