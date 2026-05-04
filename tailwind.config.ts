import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17201c",
        gumleaf: "#2f6f5e",
        jacaranda: "#6d5dfc",
        sandstone: "#f6f1e8"
      },
      boxShadow: {
        soft: "0 20px 50px rgba(23, 32, 28, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
