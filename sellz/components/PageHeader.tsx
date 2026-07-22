"use client";

import { motion } from "framer-motion";

export default function PageHeader({
  title,
  accent,
  subtitle,
}: {
  title: string;
  accent?: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h1 className="text-3xl font-extrabold tracking-tight text-fog">
        {title}
        {accent && <span className="text-brand">{accent}</span>}
      </h1>
      {subtitle && <p className="mt-1 text-fog/50">{subtitle}</p>}
    </motion.div>
  );
}
