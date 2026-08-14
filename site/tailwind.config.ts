import type { Config } from "tailwindcss";

// Taken verbatim from the product app in style/ so the site and the app read as
// one thing. Do not "improve" these values.
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Near-white and near-neutral, in the register menswear retail is sold
        // in. Not pure white: the wardrobe footage is warm cream, and against a
        // #FFF page it reads as dingy rather than as light. #F6F5F2 is far
        // enough from the old cream to lose the signature and close enough to
        // the clip that the two belong to the same room.
        room: {
          bg: "#F6F5F2",
          panel: "#FFFFFF",
          sunk: "#F0EFEB",
          line: "#E2E0DA",
          ink: "#131211",
          muted: "#6B6963",
          faint: "#9C9A94",
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
