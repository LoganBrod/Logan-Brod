import type { Config } from "tailwindcss";

// Palette sampled from the wardrobe render used on the loading screen: warm
// off-white seamless backdrop, soft grey cabinet, warm lit interior. Keeping
// the app in the same range is what stops the animation reading as pasted on.
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        room: {
          bg: "#EDEAE4", // the seamless backdrop
          panel: "#F7F5F1", // a surface catching the light
          sunk: "#E4E0D8", // a recess or an empty slot
          line: "#D6D1C7",
          ink: "#1B1A17",
          muted: "#6F6A62",
          faint: "#9A948B",
        },
        wardrobe: {
          door: "#C6C3BC", // cabinet grey
          shadow: "#AFABA3",
          interior: "#DCD3C2", // the warm lit shelf
          rail: "#9E9A92", // brushed metal
        },
        accent: {
          DEFAULT: "#8A7448", // restrained brass, for emphasis only
          soft: "#B29A6A",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      boxShadow: {
        hang: "0 18px 30px -18px rgba(27, 26, 23, 0.45)",
        lift: "0 26px 44px -20px rgba(27, 26, 23, 0.5)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out both",
        "fade-up": "fadeUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        sway: "sway 4.5s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
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
