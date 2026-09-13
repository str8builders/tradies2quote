"use client";

import { Check, FileText } from "@phosphor-icons/react";

/** The API returns a finished quote, not a percentage. Keep its wait indeterminate. */
export function QuoteGenerationProgress({ complete = false }: { complete?: boolean }) {
  return <div className="t2q-generation-progress" data-complete={complete}>
    <span className="t2q-generation-icon" aria-hidden="true">
      {complete ? <Check size={32} weight="bold" /> : <FileText size={32} weight="duotone" />}
    </span>
    <div role="progressbar" aria-label="Quote generation" aria-valuetext={complete ? "Quote ready" : "Writing your quote"}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={complete ? 100 : undefined}
      className="t2q-generation-track" data-testid="quote-generation-progress">
      <span className="t2q-generation-fill" />
      <span className="t2q-generation-sheen" />
    </div>
    <ol className="t2q-generation-steps" aria-label="Quote progress">
      <li data-done="true"><Check size={14} aria-hidden="true" />Job saved</li>
      <li aria-current={complete ? undefined : "step"}>Writing quote</li>
      <li data-done={complete} aria-current={complete ? "step" : undefined}>Ready to review</li>
    </ol>
  </div>;
}
