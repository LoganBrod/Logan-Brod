import type { Config } from "tailwindcss";

// Taken verbatim from the product app in style/ so the site and the app read as
// one thing. Do not "improve" these values.
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      /*
       * Every colour is a CSS variable, defined twice in globals.css.
       *
       * Chosen over Tailwind's `dark:` variant because these tokens are already
       * used 396 times across 37 files. Pairing every one of them with a dark
       * counterpart would be 396 edits and 396 chances to miss one; redefining
       * seven variables repaints all nine pages at once and cannot drift.
       */
      colors: {
        room: {
          bg: "rgb(var(--room-bg) / <alpha-value>)",
          panel: "rgb(var(--room-panel) / <alpha-value>)",
          sunk: "rgb(var(--room-sunk) / <alpha-value>)",
          line: "rgb(var(--room-line) / <alpha-value>)",
          ink: "rgb(var(--room-ink) / <alpha-value>)",
          muted: "rgb(var(--room-muted) / <alpha-value>)",
          faint: "rgb(var(--room-faint) / <alpha-value>)",
          "on-ink": "rgb(var(--room-on-ink) / <alpha-value>)",
        },
        // The wardrobe footage is filmed, so these stay fixed in both modes:
        // they describe an object in a video, not a surface of the page.
        footage: {
          ink: "rgb(var(--on-footage) / <alpha-value>)",
          muted: "rgb(var(--on-footage-muted) / <alpha-value>)",
        },
        wardrobe: {
          door: "#C6C3BC",
          shadow: "#AFABA3",
          interior: "#DCD3C2",
          rail: "#9E9A92",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
        },
      },
      fontFamily: {
        // No `serif` key at all: without one, a stray `font-serif` anywhere in
        // the tree fails to compile rather than quietly reintroducing the face
        // this redesign removed.
        //
        // Explicit rather than inherited: leaving `sans` to Tailwind's default
        // resolves to the system UI stack, which is the face every web form on
        // the internet is set in.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        // Tinted to the ground rather than pure black, and carried at a higher
        // alpha than the light-mode originals: a shadow that read clearly under
        // a garment on cream disappears entirely on off-black.
        hang: "0 10px 14px rgba(6, 6, 8, 0.45)",
        lift: "0 16px 22px rgba(6, 6, 8, 0.6)",
      },
      animation: {
        sway: "sway 4.5s ease-in-out infinite",
      },
      keyframes: {
        // A hung garment is never perfectly still.
        sway: {
          "0%, 100%": { transform: "rotate(-0.4deg)" },
          "50%": { transform: "rotate(0.4deg)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
