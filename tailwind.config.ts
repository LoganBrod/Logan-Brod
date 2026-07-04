import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: "#8b5cf6",
        ink: {
          DEFAULT: "#0e0e16",
          card: "#16161f",
          border: "#26263a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
