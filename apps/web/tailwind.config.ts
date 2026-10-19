import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#020617",
        surface: {
          1: "#0F172A",
          2: "#1E293B",
          3: "#23293C",
        },
        line: {
          DEFAULT: "#1E293B",
          strong: "#334155",
          muted: "#475569",
        },
        ink: {
          DEFAULT: "#F8FAFC",
          muted: "#94A3B8",
          dim: "#64748B",
        },
        brand: {
          DEFAULT: "#00A2FF",
          bright: "#38BDF8",
          deep: "#00629D",
        },
        danger: {
          DEFAULT: "#A21A24",
          bright: "#EF4444",
          soft: "#FCA5A5",
        },
        status: {
          intake: "#60A5FA",
          briefing: "#FBBF24",
          design: "#C084FC",
          qa: "#818CF8",
          review: "#FB7185",
          delivered: "#34D399",
          cancelled: "#94A3B8",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "headline-xl": ["36px", { lineHeight: "44px", letterSpacing: "-0.025em", fontWeight: "700" }],
        "headline-lg": ["24px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "headline-md": ["20px", { lineHeight: "28px", letterSpacing: "-0.015em", fontWeight: "600" }],
        "headline-sm": ["16px", { lineHeight: "24px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "24px" }],
        "body-md": ["14px", { lineHeight: "20px" }],
        "body-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.01em" }],
        "label-md": ["13px", { lineHeight: "18px", letterSpacing: "-0.01em", fontWeight: "500" }],
        "label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.02em", fontWeight: "500" }],
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        focus: "0 0 16px -4px rgba(0, 162, 255, 0.35)",
        hazard: "0 0 16px -4px rgba(239, 68, 68, 0.40)",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
