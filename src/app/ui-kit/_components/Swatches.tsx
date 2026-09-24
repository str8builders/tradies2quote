import { contrastRatio, formatRatio } from "@/lib/ui/contrast";
import { UI_COLOR_NAMES, UI_THEMES, type UiColorName, type UiMode } from "@/lib/ui/tokens";

/** Which token each colour is read against, for the printed contrast ratio. */
const READ_ON: Partial<Record<UiColorName, UiColorName>> = {
  text: "bg",
  muted: "bg",
  faint: "surface-2",
  "brand-text": "surface",
  "on-brand": "brand",
  "on-mark": "mark",
  ok: "surface",
  warn: "surface",
  bad: "surface",
  info: "surface",
  "line-strong": "surface-2",
  focus: "bg",
};

const USE: Partial<Record<UiColorName, string>> = {
  bg: "Screen background",
  surface: "Cards",
  "surface-2": "Raised parts, keys",
  line: "Card edges",
  "line-strong": "Field and switch edges",
  text: "Body text",
  muted: "Second line of text",
  faint: "Hints, placeholders",
  brand: "Orange fill (main button)",
  "brand-text": "Orange words and links",
  "on-brand": "Words on orange",
  "brand-soft": "Orange tint",
  hivis: "Hi-vis fill",
  mark: "Highlighted words",
  "on-mark": "Words on highlight",
  ok: "Done, paid",
  "ok-soft": "Done tint",
  warn: "Needs attention",
  "warn-soft": "Attention tint",
  bad: "Problem, overdue",
  "bad-soft": "Problem tint",
  info: "Information",
  "info-soft": "Information tint",
  focus: "Keyboard focus ring",
  scrim: "Dims the page behind a sheet",
};

function ratioFor(mode: UiMode, name: UiColorName): string | null {
  const against = READ_ON[name];
  if (!against) return null;
  const colors = UI_THEMES[mode].colors;
  return formatRatio(contrastRatio(colors[name], colors[against]));
}

/**
 * Every ui colour. The swatch shows the live palette (flip outdoor mode to
 * see it change); the text lists both palettes' values from tokens.ts.
 */
export function Swatches() {
  return (
    <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
      {UI_COLOR_NAMES.map((name) => {
        const ratioDefault = ratioFor("default", name);
        const ratioOutdoor = ratioFor("outdoor", name);
        return (
          <li key={name} className="flex items-center gap-3 rounded-ui-lg border border-ui-line bg-ui-surface p-3">
            <span
              aria-hidden="true"
              className="h-14 w-14 shrink-0 rounded-ui-md border border-ui-line-strong"
              style={{ background: `var(--ui-${name})` }}
            />
            <span className="min-w-0 text-ui-sm">
              <span className="block text-ui-base font-semibold text-ui-text">{name}</span>
              <span className="block text-ui-muted">{USE[name]}</span>
              <span className="block text-ui-xs text-ui-faint">
                {UI_THEMES.default.colors[name]} · outdoor {UI_THEMES.outdoor.colors[name]}
              </span>
              {ratioDefault && ratioOutdoor ? (
                <span className="block text-ui-xs text-ui-faint">
                  Contrast on {READ_ON[name]}: {ratioDefault} · outdoor {ratioOutdoor}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
