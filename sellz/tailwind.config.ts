import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2dd4bf",
          dim: "#14b8a6",
        },
        ink: {
          DEFAULT: "rgb(var(--color-ink) / <alpha-value>)",
          deep: "rgb(var(--color-ink-deep) / <alpha-value>)",
          card: "rgb(var(--color-ink-card) / <alpha-value>)",
          border: "rgb(var(--color-ink-border) / <alpha-value>)",
        },
        fog: "rgb(var(--color-fog) / <alpha-value>)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        glow: "var(--shadow-glow)",
      },
      keyframes: {
        blob: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(4%, -6%) scale(1.08)" },
          "66%": { transform: "translate(-3%, 4%) scale(0.96)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        emerge: {
          from: { opacity: "0", transform: "scale(0.94)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        blob: "blob 18s ease-in-out infinite",
        "blob-slow": "blob 26s ease-in-out infinite reverse",
        shimmer: "shimmer 1.8s linear infinite",
        // Entrances run in CSS, not JS, so content is never stuck invisible
        // if hydration is slow or scripts fail.
        rise: "rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        emerge: "emerge 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both",
      },
    },
  },
  plugins: [],
};

export default config;
