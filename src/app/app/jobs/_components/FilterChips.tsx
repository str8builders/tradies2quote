"use client";

import { useRef, type KeyboardEvent } from "react";
import { cx } from "@/components/ui/cx";
import { nextSegmentIndex } from "@/components/ui/lib/segments";
import { ICON_CHIP, TAP, TONE_STRIPE, UI_TEXT, type IconTone } from "@/components/ui/styles";
import { FILTER_TONE, JOB_FILTERS, type JobFilter } from "../../_v2/lib/job-board";

/** The chosen chip: a thick edge and soft fill in the filter's own colour. */
const SELECTED: Readonly<Record<IconTone, string>> = {
  brand: "border-ui-brand",
  ok: "border-ui-ok",
  warn: "border-ui-warn",
  bad: "border-ui-bad",
  info: "border-ui-info",
  violet: "border-ui-violet",
  tools: "border-ui-hivis",
  neutral: "border-ui-line-strong",
};

/**
 * All · To send · Waiting · Booked · Unpaid · Done, as big chips: three to a
 * row on a phone so every choice is in view, one row from `sm` up. Each has
 * its colour (a dot, or a coloured edge when chosen) and how many jobs it
 * holds. A radio group underneath (one tab stop, arrow keys move the
 * choice), like the kit's SegmentedControl, which is for two to four options.
 */
export function FilterChips({
  value,
  onChange,
  counts,
}: {
  value: JobFilter;
  onChange: (filter: JobFilter) => void;
  /** Jobs per filter, shown after each label. */
  counts?: Readonly<Record<JobFilter, number>>;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const found = JOB_FILTERS.findIndex((f) => f.id === value);
  const selectedIndex = found === -1 ? 0 : found;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextSegmentIndex(index, event.key, JOB_FILTERS.length);
    if (next === null) return;
    event.preventDefault();
    onChange(JOB_FILTERS[next].id);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Show"
      data-testid="jobs-filters"
      className={cx("grid grid-cols-3 gap-2 sm:grid-cols-6", UI_TEXT)}
    >
      {JOB_FILTERS.map((filter, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={filter.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-filter={filter.id}
            onClick={() => onChange(filter.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              "ui-focus-ring inline-flex min-h-12 items-center justify-center gap-1.5 rounded-ui-md px-2 py-2 text-ui-base font-semibold",
              TAP,
              selected
                ? cx("border-2", SELECTED[FILTER_TONE[filter.id]], ICON_CHIP[FILTER_TONE[filter.id]])
                : "border border-ui-line bg-ui-surface text-ui-muted hover:text-ui-text",
            )}
          >
            {filter.id !== "all" && !selected ? (
              <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-full", TONE_STRIPE[FILTER_TONE[filter.id]])} />
            ) : null}
            <span>{filter.label}</span>
            {counts ? <span className="font-normal tabular-nums opacity-80">{counts[filter.id]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
