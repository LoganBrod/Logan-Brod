import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        roobet: {
          gold: "#FFD700",
          amber: "#F59E0B",
          dark: "#0D0D1A",
          card: "#141428",
          border: "#1E1E3A",
          green: "#00C853",
        },
        // LevoZ brand (channel diagnostics)
        levoz: {
          teal: "#2EE6C8",
          dark: "#0A0F10",
          card: "#101719",
          border: "#1E2D2D",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.5s ease-in-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
