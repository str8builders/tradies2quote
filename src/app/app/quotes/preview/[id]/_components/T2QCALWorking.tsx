import React from "react";
import type { QuoteLineItem } from "@/lib/quote-types";
import { formatQuantity } from "@/lib/quantity-display";

type Evidence = Pick<QuoteLineItem, "t2qcal_calculator_snapshot" | "t2qcal_assumptions" | "t2qcal_checks" | "t2qcal_provenance_note">;

export function hasT2QCALWorking(line?: Evidence): boolean {
  return !!line && !!(line.t2qcal_calculator_snapshot || line.t2qcal_provenance_note
    || line.t2qcal_assumptions?.length || line.t2qcal_checks?.length);
}

/** Private quote-review evidence. Never render this on the public client quote. */
export function T2QCALWorking({ line }: { line: Evidence }) {
  if (!hasT2QCALWorking(line)) return null;
  const snapshot = line.t2qcal_calculator_snapshot;
  const inputs = Array.isArray(snapshot?.inputs) ? snapshot.inputs.filter(input => input
    && typeof input.key === "string" && typeof input.label === "string"
    && typeof input.value === "number" && typeof input.unit === "string") : [];
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
                {typeof input.displayLabel === "string" ? input.displayLabel : `${formatQuantity(input.value)} ${input.unit}`.trim()}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {([
        ["Assumptions", line.t2qcal_assumptions],
        ["Checks from the calculator", line.t2qcal_checks],
      ] as const).map(([title, notes]) => Array.isArray(notes) && notes.length > 0 && (
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
