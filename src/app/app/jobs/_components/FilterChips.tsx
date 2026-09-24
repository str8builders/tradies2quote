"use client";

import { useRef, type KeyboardEvent } from "react";
import { cx } from "@/components/ui/cx";
import { nextSegmentIndex } from "@/components/ui/lib/segments";
import { TAP, UI_TEXT } from "@/components/ui/styles";
import { JOB_FILTERS, type JobFilter } from "../../_v2/lib/job-board";

/**
 * All · To send · Waiting · Booked · Unpaid · Done, as big chips: three to a
 * row on a phone so every choice is in view, one row from `sm` up. A radio
 * group underneath (one tab stop, arrow keys move the choice), like the
 * kit's SegmentedControl, which is for two to four options.
 */
export function FilterChips({ value, onChange }: { value: JobFilter; onChange: (filter: JobFilter) => void }) {
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
              "ui-focus-ring min-h-12 rounded-ui-md px-2 py-2 text-ui-base font-semibold",
              TAP,
              selected
                ? "border-2 border-ui-brand bg-ui-brand-soft text-ui-text"
                : "border border-ui-line bg-ui-surface text-ui-muted hover:text-ui-text",
            )}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
