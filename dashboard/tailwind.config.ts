import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Not pure black. A projector renders #000 as "no light", and against
        // a lit wall that reads as muddy grey anyway — a very dark blue holds
        // its colour better and looks intentional.
        base: "#05080f",
        panel: "#0b111d",
        edge: "#1b2740",
        accent: "#5eead4",
        accentDim: "#2dd4bf",
        warn: "#fbbf24",
      },
      fontFamily: {
        display: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
