/**
 * Design tokens for the marketing videos. Values mirror the site and the app:
 * `src/app/globals.css` (ink scale, brand, hi-vis) and the in-app "premium"
 * finish in `src/app/app/premium.css` (section tones, cards, buttons).
 */
import type { CSSProperties } from "react";
import { fontFamilies } from "./fonts";

export const FONT = {
  /** Headlines, captions and all in-app UI text (the app runs on Plus Jakarta Sans). */
  display: `${fontFamilies.display}, sans-serif`,
  /** Marketing body copy. */
  body: `${fontFamilies.body}, sans-serif`,
  /** `// eyebrow` labels, totals labels, timers. */
  mono: `${fontFamilies.mono}, monospace`,
} as const;

export const C = {
  brand: "#FF5F15",
  brandSoft: "#ff8b4b",
  brandText: "#ff8b54",
  hivis: "#FFEA00",
  ink950: "#0A0A0A",
  ink900: "#111111",
  ink800: "#1A1A1A",
  ink700: "#1F1F1F",
  ink600: "#262626",
  ink500: "#404040",
  ink400: "#737373",
  ink300: "#A8A8A8",
  ink200: "#D4D4D4",
  ink100: "#E5E5E5",
  paper: "#f4f3ef",
  white: "#ffffff",
  emerald: "#10b981",
  emerald300: "#6ee7b7",
  blue300: "#93c5fd",
  mint: "#a9d8c0",
  peach: "#ffd2aa",
  stage: "#0b0c0c",
} as const;

/** In-app section tones (premium.css `--t2q-section-*`). */
export const TONE = {
  quotes: { rgb: "222, 163, 105", light: "#f2c99f", secondary: "91, 167, 146" },
  materials: { rgb: "106, 194, 167", light: "#b3e4d1", secondary: "108, 150, 190" },
  invoices: { rgb: "119, 172, 217", light: "#bddcf5", secondary: "95, 176, 149" },
} as const;
export type Tone = keyof typeof TONE;

export const rgba = (rgb: string, alpha: number) => `rgba(${rgb}, ${alpha})`;

/** `.t2q-card-pro` inside the app shell, per section tone. */
export function cardStyle(tone: Tone = "quotes"): CSSProperties {
  const t = TONE[tone];
  return {
    background: `radial-gradient(ellipse at 0% 0%, ${rgba(t.rgb, 0.18)}, transparent 70%), linear-gradient(145deg, #202a2a, #171e22)`,
    border: `1px solid ${rgba(t.rgb, 0.25)}`,
    borderRadius: 20,
    boxShadow: "inset 0 1px 0 #ffffff08, 0 12px 34px -26px #000b",
  };
}

/** `.t2q-page-intro` inside the app shell. */
export function pageIntroStyle(tone: Tone = "quotes"): CSSProperties {
  const t = TONE[tone];
  return {
    position: "relative",
    overflow: "hidden",
    padding: "25px 20px",
    borderRadius: 21,
    border: `1px solid ${rgba(t.rgb, 0.32)}`,
    background: `radial-gradient(ellipse at 100% 0%, ${rgba(t.secondary, 0.24)}, transparent 66%), linear-gradient(115deg, ${rgba(t.rgb, 0.18)}, #192928)`,
    boxShadow: `inset 0 1px 0 #ffffff0b, 0 20px 50px -38px ${rgba(t.rgb, 0.45)}`,
  };
}

/** Public, client-facing pages keep the plain dark `.t2q-card-pro`. */
export const publicCardStyle: CSSProperties = {
  background:
    "radial-gradient(120% 100% at 0% 0%, rgba(255, 95, 21, 0.06), transparent 55%), linear-gradient(180deg, rgba(255, 255, 255, 0.035) 0%, rgba(255, 255, 255, 0) 60%), #181818",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: 24,
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.18), 0 8px 32px -12px rgba(0, 0, 0, 0.45)",
};

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
