/**
 * New-look design tokens — the single source of truth (redesign phase 1).
 *
 * `src/app/globals.css` carries the same values as CSS: the `@theme` block
 * (sizes, radii, motion) and the `:root` / `[data-contrast="outdoor"]`
 * blocks (every `--ui-*` variable). `tokens.test.ts` parses that file and
 * fails on any drift, and checks the WCAG contrast of both palettes. Change
 * a value here and in globals.css together.
 *
 * Two palettes:
 *   - `default` — dark ink ground, the brand's normal look.
 *   - `outdoor` — a light, glare-proof palette for bright sun, switched on
 *     per device with the `t2q-outdoor` cookie (see ./outdoor.ts). Only the
 *     `ui-` utilities read these variables, so existing screens never change.
 *
 * Brand orange (#FF5F15) is a FILL colour in both palettes. For orange text
 * use `brand-text`, which is tuned per palette to stay readable.
 */

export type UiMode = "default" | "outdoor";

export const UI_COLOR_NAMES = [
  "bg",
  "surface",
  "surface-2",
  "line",
  "line-strong",
  "text",
  "muted",
  "faint",
  "brand",
  "brand-text",
  "on-brand",
  "brand-soft",
  "hivis",
  "mark",
  "on-mark",
  "ok",
  "ok-soft",
  "warn",
  "warn-soft",
  "bad",
  "bad-soft",
  "info",
  "info-soft",
  "focus",
  "scrim",
] as const;

export type UiColorName = (typeof UI_COLOR_NAMES)[number];

export const UI_SHADOW_NAMES = ["card", "raised", "sheet"] as const;
export type UiShadowName = (typeof UI_SHADOW_NAMES)[number];

export interface UiTheme {
  /** `#RRGGBB`, except `scrim`, which is a translucent `rgba()` overlay. */
  colors: Record<UiColorName, string>;
  shadows: Record<UiShadowName, string>;
  /** Body text weight. Outdoor mode thickens letters for glare. */
  bodyWeight: 400 | 500;
  /** Keyboard focus ring thickness. */
  focusWidth: string;
  /** Native control rendering for ui- fields and screens. */
  colorScheme: "dark" | "light";
}

export const UI_THEMES: Readonly<Record<UiMode, UiTheme>> = {
  default: {
    colors: {
      bg: "#111110",
      surface: "#1B1B1A",
      "surface-2": "#242422",
      line: "#34332F",
      "line-strong": "#75736C",
      text: "#F5F4F0",
      muted: "#BDBBB3",
      faint: "#8E8C85",
      brand: "#FF5F15",
      "brand-text": "#FF8A4C",
      "on-brand": "#121211",
      "brand-soft": "#3A1D0E",
      hivis: "#FFEA00",
      mark: "#3B3509",
      "on-mark": "#FFEA00",
      ok: "#3CCB7F",
      "ok-soft": "#15301F",
      warn: "#FFB224",
      "warn-soft": "#35280C",
      bad: "#FF6A5E",
      "bad-soft": "#3A1916",
      info: "#58A6FF",
      "info-soft": "#132A45",
      focus: "#FFEA00",
      scrim: "rgba(0, 0, 0, 0.6)",
    },
    shadows: {
      card: "inset 0 1px 0 0 rgba(255, 255, 255, 0.04), 0 12px 28px -18px rgba(0, 0, 0, 0.8)",
      raised: "0 18px 40px -16px rgba(0, 0, 0, 0.85)",
      sheet: "0 -24px 48px -16px rgba(0, 0, 0, 0.75)",
    },
    bodyWeight: 400,
    focusWidth: "3px",
    colorScheme: "dark",
  },
  outdoor: {
    colors: {
      bg: "#FFFFFF",
      surface: "#F3F3F1",
      "surface-2": "#E8E8E5",
      line: "#6F6E69",
      "line-strong": "#3D3C38",
      text: "#000000",
      muted: "#2E2D2A",
      faint: "#4A4944",
      brand: "#FF5F15",
      "brand-text": "#A63400",
      "on-brand": "#000000",
      "brand-soft": "#FFE4D6",
      hivis: "#FFEA00",
      mark: "#FFEA00",
      "on-mark": "#000000",
      ok: "#0B6B3A",
      "ok-soft": "#DDF3E6",
      warn: "#8A4B00",
      "warn-soft": "#FFEFD2",
      bad: "#B3261E",
      "bad-soft": "#FCE4E2",
      info: "#0B57D0",
      "info-soft": "#DDE8FB",
      focus: "#000000",
      scrim: "rgba(0, 0, 0, 0.5)",
    },
    shadows: {
      card: "0 1px 2px 0 rgba(0, 0, 0, 0.12)",
      raised: "0 8px 20px -8px rgba(0, 0, 0, 0.35)",
      sheet: "0 -8px 24px -8px rgba(0, 0, 0, 0.3)",
    },
    bodyWeight: 500,
    focusWidth: "4px",
    colorScheme: "light",
  },
};

/** Font sizes as [size, line-height]. 13 px is for captions only; body is 17 px. */
export const UI_TEXT = {
  xs: ["0.8125rem", "1.125rem"],
  sm: ["0.9375rem", "1.375rem"],
  base: ["1.0625rem", "1.625rem"],
  lg: ["1.25rem", "1.75rem"],
  xl: ["1.5rem", "1.875rem"],
  "2xl": ["1.875rem", "2.25rem"],
  display: ["2.25rem", "2.5rem"],
} as const satisfies Record<string, readonly [string, string]>;

export const UI_RADIUS = {
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
} as const;

/** Every transition is 250 ms or less and only moves transform/opacity. */
export const UI_DURATION = {
  fast: "120ms",
  base: "200ms",
  slow: "250ms",
} as const;

export const UI_EASE = {
  out: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  "in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/**
 * The `--ui-*` custom properties a palette sets, exactly as globals.css
 * declares them (the drift test compares this map with the stylesheet).
 */
export function uiCssVariables(mode: UiMode): Record<string, string> {
  const theme = UI_THEMES[mode];
  const vars: Record<string, string> = {};
  for (const name of UI_COLOR_NAMES) vars[`--ui-${name}`] = theme.colors[name];
  for (const name of UI_SHADOW_NAMES) vars[`--ui-shadow-${name}`] = theme.shadows[name];
  vars["--ui-body-weight"] = String(theme.bodyWeight);
  vars["--ui-focus-width"] = theme.focusWidth;
  vars["--ui-color-scheme"] = theme.colorScheme;
  return vars;
}
