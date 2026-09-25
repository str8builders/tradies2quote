/**
 * Class fragments shared by the kit. Colours come only from ui- tokens.
 */

/**
 * Typography every kit part sets on its own root. The /app shell changes the
 * inherited font (Inter / Plus Jakarta), so relying on inheritance would make
 * a part look different there than on /ui-kit.
 */
export const UI_TEXT = "font-ui-sans font-ui-body text-ui-text";

/** A firm, quick press: transform only, and none at all for reduced motion. */
export const PRESS =
  "transition-transform duration-ui-fast ease-ui-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

/** No grey flash on iOS taps; double-tap zoom off; no text selection on controls. */
export const TAP = "touch-manipulation select-none [-webkit-tap-highlight-color:transparent]";

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";
/**
 * Icon tile colours. Each means one thing everywhere: brand = quotes,
 * ok = money in, info = jobs and dates, violet = people, tools = T2QCAL and
 * tools, bad = overdue, warn = needs a look, neutral = everything else.
 */
export type IconTone = Tone | "brand" | "violet" | "tools";

/** Soft chip behind an icon (list rows, to-do cards, empty states). */
export const ICON_CHIP: Record<IconTone, string> = {
  brand: "bg-ui-brand-soft text-ui-brand-text",
  ok: "bg-ui-ok-soft text-ui-ok",
  warn: "bg-ui-warn-soft text-ui-warn",
  bad: "bg-ui-bad-soft text-ui-bad",
  info: "bg-ui-info-soft text-ui-info",
  violet: "bg-ui-violet-soft text-ui-violet",
  tools: "bg-ui-mark text-ui-on-mark",
  neutral: "bg-ui-surface-2 text-ui-muted",
};

/** The solid colour of each tone, for a card's side stripe. */
export const TONE_STRIPE: Record<IconTone, string> = {
  brand: "bg-ui-brand",
  ok: "bg-ui-ok",
  warn: "bg-ui-warn",
  bad: "bg-ui-bad",
  info: "bg-ui-info",
  violet: "bg-ui-violet",
  tools: "bg-ui-hivis",
  neutral: "bg-ui-line-strong",
};
