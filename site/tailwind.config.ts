import type { Config } from "tailwindcss";

// Taken verbatim from the product app in style/ so the site and the app read as
// one thing. Do not "improve" these values.
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        room: {
          bg: "#EDEAE4",
          panel: "#F7F5F1",
          sunk: "#E4E0D8",
          line: "#D6D1C7",
          ink: "#1B1A17",
          muted: "#6F6A62",
          faint: "#9A948B",
        },
        wardrobe: {
          door: "#C6C3BC",
          shadow: "#AFABA3",
          interior: "#DCD3C2",
          rail: "#9E9A92",
        },
        accent: {
          DEFAULT: "#8A7448",
          soft: "#B29A6A",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        // Explicit rather than inherited: leaving `sans` to Tailwind's default
        // resolves to the system UI stack, which is the face every web form on
        // the internet is set in.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        hang: "0 10px 14px rgba(27, 26, 23, 0.28)",
        lift: "0 16px 22px rgba(27, 26, 23, 0.40)",
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
