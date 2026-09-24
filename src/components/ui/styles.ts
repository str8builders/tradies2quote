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
export type IconTone = Tone | "brand";

/** Soft chip behind an icon (list rows, to-do cards, empty states). */
export const ICON_CHIP: Record<IconTone, string> = {
  brand: "bg-ui-brand-soft text-ui-brand-text",
  ok: "bg-ui-ok-soft text-ui-ok",
  warn: "bg-ui-warn-soft text-ui-warn",
  bad: "bg-ui-bad-soft text-ui-bad",
  info: "bg-ui-info-soft text-ui-info",
  neutral: "bg-ui-surface-2 text-ui-muted",
};
