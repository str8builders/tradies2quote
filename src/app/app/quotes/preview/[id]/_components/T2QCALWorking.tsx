import React from "react";
import type { QuoteLineItem } from "@/lib/quote-types";
import { formatQuantity } from "@/lib/quantity-display";

type Evidence = Pick<QuoteLineItem, "t2qcal_calculator_snapshot" | "t2qcal_assumptions" | "t2qcal_checks" | "t2qcal_provenance_note">;

export function hasT2QCALWorking(line?: Evidence): boolean {
  return !!line && !!(line.t2qcal_calculator_snapshot || line.t2qcal_provenance_note
    || line.t2qcal_assumptions?.length || line.t2qcal_checks?.length);
}

type Input = NonNullable<Evidence["t2qcal_calculator_snapshot"]>["inputs"][number];

/** A recorded input as the calculator showed it ("Round post", "100 mm"). */
function inputValue(input: Input): string {
  return typeof input.displayLabel === "string" ? input.displayLabel : `${formatQuantity(input.value)} ${input.unit}`.trim();
}

/** The calculator's notes on the line, titled, in the order both looks list them. */
function noteGroups(line: Evidence) {
  return [
    ["Assumptions", line.t2qcal_assumptions],
    ["Checks from the calculator", line.t2qcal_checks],
  ] as const;
}

/**
 * Private quote-review evidence. Never render this on the public client quote.
 * `look="new"` draws the same record with ui- tokens (the new job page's More
 * tools), so it reads in dark and outdoor mode.
 */
export function T2QCALWorking({ line, look = "classic" }: { line: Evidence; look?: "classic" | "new" }) {
  if (!hasT2QCALWorking(line)) return null;
  const snapshot = line.t2qcal_calculator_snapshot;
  const inputs = Array.isArray(snapshot?.inputs) ? snapshot.inputs.filter(input => input
    && typeof input.key === "string" && typeof input.label === "string"
    && typeof input.value === "number" && typeof input.unit === "string") : [];
  if (look === "new") return <NewLookRecord line={line} toolName={snapshot?.toolName} inputs={inputs} />;
  return (
    <div data-testid="t2qcal-working-evidence" className="space-y-3 border-t border-ink-700 pt-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand">
          T2QCAL calculation record
        </p>
        {typeof snapshot?.toolName === "string" && <p className="mt-1 text-sm text-white">{snapshot.toolName}</p>}
        {typeof line.t2qcal_provenance_note === "string" && <p className="mt-1 leading-relaxed text-ink-300">{line.t2qcal_provenance_note}</p>}
      </div>
      {inputs.length > 0 && (
        <dl className="space-y-1.5" aria-label="Recorded calculator inputs">
          {inputs.map(input => (
            <div key={input.key} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt className="text-ink-300">{input.label}</dt>
              <dd className="break-words font-mono text-white">
                {inputValue(input)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {noteGroups(line).map(([title, notes]) => Array.isArray(notes) && notes.length > 0 && (
        <div key={title}>
          <p className="font-medium text-white">{title}</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-ink-300">
            {notes.filter(note => typeof note === "string").map((note, i) => <li key={`${i}-${note}`}>{note}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The record in the new look: the same rows in the same order and the same
 * words, in ui- tokens. The label is sentence case now, not a code-style
 * caption, and the values line up with tabular figures instead of mono.
 */
function NewLookRecord({ line, toolName, inputs }: { line: Evidence; toolName: unknown; inputs: Input[] }) {
  return (
    <div data-testid="t2qcal-working-evidence" className="space-y-3 border-t border-ui-line pt-3">
      <div>
        <p className="text-ui-sm font-semibold text-ui-brand-text">T2QCAL calculation record</p>
        {typeof toolName === "string" && <p className="mt-1 text-ui-text">{toolName}</p>}
        {typeof line.t2qcal_provenance_note === "string" && <p className="mt-1 text-ui-muted">{line.t2qcal_provenance_note}</p>}
      </div>
      {inputs.length > 0 && (
        <dl className="space-y-1.5" aria-label="Recorded calculator inputs">
          {inputs.map(input => (
            <div key={input.key} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt className="text-ui-muted">{input.label}</dt>
              <dd className="break-words font-semibold text-ui-text tabular-nums">{inputValue(input)}</dd>
            </div>
          ))}
        </dl>
      )}
      {noteGroups(line).map(([title, notes]) => Array.isArray(notes) && notes.length > 0 && (
        <div key={title}>
          <p className="font-semibold text-ui-text">{title}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ui-muted">
            {notes.filter(note => typeof note === "string").map((note, i) => <li key={`${i}-${note}`}>{note}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
