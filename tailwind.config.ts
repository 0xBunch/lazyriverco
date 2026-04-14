import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        river: {
          50: "#ecfeff",
          500: "#06b6d4",
          900: "#164e63",
        },
      },
    },
  },
  plugins: [],
};

export default config;
