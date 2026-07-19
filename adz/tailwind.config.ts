import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2dd4bf",
          dim: "#14b8a6",
        },
        ink: {
          DEFAULT: "#1b2426",
          deep: "#141b1d",
          card: "#212c2f",
          border: "#313e42",
        },
        fog: "#c9d2d3",
      },
      boxShadow: {
        card: "0 4px 24px rgba(0,0,0,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
