import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./data/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0A0A0A",
        panel: "#141414",
        card: "#181818",
        elev: "#1F1F1F",
        line: {
          DEFAULT: "#272727",
          strong: "#3A3A3A",
        },
        ink: {
          DEFAULT: "#FFFFFF",
          mute: "#A3A3A3",
          dim: "#666666",
        },
        accent: {
          DEFAULT: "#DFFF2A",
          strong: "#C9EB0E",
          soft: "rgba(223, 255, 42, 0.08)",
          glow: "rgba(223, 255, 42, 0.4)",
        },
        pink: {
          DEFAULT: "#FF2D7A",
          soft: "rgba(255, 45, 122, 0.12)",
        },
        ok: {
          DEFAULT: "#4ADE80",
          soft: "rgba(74, 222, 128, 0.12)",
        },
        warn: {
          DEFAULT: "#FFB020",
          soft: "rgba(255, 176, 32, 0.12)",
        },
        paper: "#FFFFFF",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "8px",
        md: "10px",
        lg: "14px",
        xl: "18px",
        "2xl": "22px",
        "3xl": "28px",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 30px -16px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(223,255,42,0.6), 0 0 24px rgba(223,255,42,0.25)",
        pinkGlow: "0 0 24px rgba(255,45,122,0.25)",
      },
      letterSpacing: {
        eye: "0.14em",
        tight: "-0.015em",
        tighter: "-0.03em",
      },
    },
  },
  plugins: [],
};

export default config;
