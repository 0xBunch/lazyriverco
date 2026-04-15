import type { Config } from "tailwindcss";

// Design language matches Claude.ai as closely as we can without licensing
// "Anthropic Sans" (proprietary). Values verified this session by fetching
// claude.ai's compiled CSS:
//
//   --brand-100 (dark mode): hsl(15, 63.1%, 59.6%) → #D97757 (Claude orange)
//   --bg-000 (dark):         hsl(60, 2.1%, 18.4%)  → #2F2E2C (warm card)
//   --bg-100 (dark):         hsl(60, 2.7%, 14.5%)  → #252423
//   --bg-200 (dark):         hsl(30, 3.3%, 11.8%)  → #1E1D1C
//   --bg-300 (dark):         hsl(60, 2.6%, 7.6%)   → #141311 (deepest bg)
//   --text-000 (dark):       hsl(48, 33.3%, 97.1%) → #FAF9F5 (warm off-white)
//   --text-200 (dark):       hsl(50, 9%, 73.7%)    → #C6C2B5 (secondary)
//   --text-400 (dark):       hsl(48, 4.8%, 59.2%)  → #9B978D (tertiary)
//
// KB asked for pink instead of Claude's orange. The `claude` ramp below is a
// direct hue rotation from Claude's brand HSL (15° → 325°), preserving
// saturation (63.1%) and lightness (59.6%). That gives #D957A3 as claude-500
// — a dusty rose with the same weight and warmth as the orange it replaces.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm neutrals — keyed to Claude's actual dark-mode bg/text stack.
        bone: {
          50: "#FAF9F5",
          100: "#EFECDF",
          200: "#C6C2B5",
          300: "#9B978D",
          400: "#6E6B64",
          500: "#4A4843",
          600: "#3A3834",
          700: "#2F2E2C",
          800: "#252423",
          900: "#1E1D1C",
          950: "#141311",
        },
        // Muted dusty rose — KB's pink substitute for Claude's #D97757.
        claude: {
          50: "#FBEEF4",
          100: "#F7D5E3",
          200: "#F1B2CB",
          300: "#E88CB0",
          400: "#DE6E9B",
          500: "#D957A3",
          600: "#B54283",
          700: "#8E3364",
          800: "#682447",
          900: "#41172C",
          950: "#230C18",
        },
      },
      fontFamily: {
        // DM Sans: closest free humanist sans to Claude's proprietary
        // Anthropic Sans. One family, weight variance carries the hierarchy.
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
