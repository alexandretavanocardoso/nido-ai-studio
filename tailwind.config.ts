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
        bg: "#0b0a0a",
        panel: "#131112",
        card: "#181516",
        elev: "#1f1c1d",
        line: {
          DEFAULT: "#272324",
          strong: "#3a3536",
        },
        ink: {
          DEFAULT: "#f1ece2",
          mute: "#9b9389",
          dim: "#6d665e",
        },
        accent: {
          DEFAULT: "#fdf327",
          strong: "#e6dc12",
          soft: "rgba(253, 243, 39, 0.08)",
          glow: "rgba(253, 243, 39, 0.4)",
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
        // Casca nova do app (sidebar, barra e Home): design "Home NIDO v2".
        nido: {
          bg: "#0b0a0a",
          panel: "#131112",
          ink: "#f1ece2",
          paper: "#f6f1e7",
          soft: "#c9c1b5",
          mute: "#9b9389",
          dim: "#6d665e",
          yellow: "#fdf327",
          "yellow-hi": "#fff86b",
          ocre: "#aa7d43",
          red: "#ff4b3e",
        },
      },
      fontFamily: {
        sans: ["Geist", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Archivo", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'Geist Mono'", "'JetBrains Mono'", "ui-monospace", "monospace"],
        geist: ["Geist", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        "geist-mono": ["'Geist Mono'", "'JetBrains Mono'", "ui-monospace", "monospace"],
        archivo: ["Archivo", "Inter", "ui-sans-serif", "sans-serif"],
      },
      keyframes: {
        "nido-rise": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "none" },
        },
        "nido-pulse": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
        // Check-in dos pontos: o dia "estoura", os pontos sobem e somem, faíscas se espalham.
        "ponto-pop": {
          "0%": { transform: "scale(0.6)" },
          "55%": { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
        "ponto-sobe": {
          "0%": { opacity: "0", transform: "translate(-50%, 4px) scale(0.8)" },
          "20%": { opacity: "1", transform: "translate(-50%, -8px) scale(1.1)" },
          "100%": { opacity: "0", transform: "translate(-50%, -44px) scale(1)" },
        },
        "ponto-faisca": {
          "0%": { opacity: "1", transform: "rotate(var(--giro)) translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "rotate(var(--giro)) translateY(-26px) scale(0.3)" },
        },
        "nido-drift-1": {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(-9%,7%) scale(1.18)" },
        },
        "nido-drift-2": {
          "0%,100%": { transform: "translate(0,0) scale(1.05)" },
          "50%": { transform: "translate(10%,-6%) scale(0.92)" },
        },
      },
      animation: {
        "nido-rise": "nido-rise .5s cubic-bezier(.16,1,.3,1) both",
        "nido-pulse": "nido-pulse 1.6s infinite",
        "ponto-pop": "ponto-pop .45s cubic-bezier(.2,1.4,.4,1) both",
        "ponto-sobe": "ponto-sobe 1.1s ease-out both",
        "ponto-faisca": "ponto-faisca .6s ease-out both",
        "nido-drift-1": "nido-drift-1 18s ease-in-out infinite",
        "nido-drift-2": "nido-drift-2 22s ease-in-out infinite",
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
        glow: "0 0 0 1px rgba(253,243,39,0.6), 0 0 24px rgba(253,243,39,0.25)",
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
