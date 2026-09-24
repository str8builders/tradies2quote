import { UI_TEXT } from "@/lib/ui/tokens";
import { cx } from "@/components/ui/cx";

const ROWS: Array<{ name: keyof typeof UI_TEXT; className: string; sample: string; use: string }> = [
  { name: "display", className: "text-ui-display font-bold tabular-nums", sample: "$4,819.88", use: "Big totals" },
  { name: "2xl", className: "ui-heading text-ui-2xl", sample: "Morning, Mike", use: "Page headings (Archivo Black)" },
  { name: "xl", className: "text-ui-xl font-semibold", sample: "$6,070.00 owed", use: "Figures in tiles" },
  { name: "lg", className: "ui-title text-ui-lg", sample: "What's in the job", use: "Section titles, main button" },
  { name: "base", className: "text-ui-base", sample: "Deck at 14 Rata St is done", use: "Body text and labels" },
  { name: "sm", className: "text-ui-sm text-ui-muted", sample: "Sam Taylor · 3 days", use: "Second lines, hints" },
  { name: "xs", className: "text-ui-xs text-ui-muted", sample: "Accepted", use: "Captions only (progress labels, tab names)" },
];

const px = (rem: string) => `${Math.round(parseFloat(rem) * 16)} px`;

/** The seven text sizes. Nothing smaller than 13 px exists in the kit. */
export function TypeScale() {
  return (
    <ul className="divide-y divide-ui-line rounded-ui-lg border border-ui-line bg-ui-surface">
      {ROWS.map((row) => (
        <li key={row.name} className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-baseline sm:gap-6">
          <span className="w-44 shrink-0 text-ui-sm text-ui-muted">
            <span className="font-semibold text-ui-text">text-ui-{row.name}</span> · {px(UI_TEXT[row.name][0])}
          </span>
          <span className={cx("min-w-0 text-ui-text", row.className)}>{row.sample}</span>
          <span className="text-ui-sm text-ui-faint sm:ml-auto sm:text-right">{row.use}</span>
        </li>
      ))}
    </ul>
  );
}
