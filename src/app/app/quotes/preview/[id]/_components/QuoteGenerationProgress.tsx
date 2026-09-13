"use client";

import { Check } from "@phosphor-icons/react";
import { AppLoadingTape } from "@/app/app/_components/AppLoadingTape";

/** The API returns a finished quote, not a percentage. Keep its wait indeterminate. */
export function QuoteGenerationProgress({ complete = false }: { complete?: boolean }) {
  return <div className="t2q-generation-progress" data-complete={complete}>
    <AppLoadingTape complete={complete} label={complete ? "Quote ready" : "Writing your quote"}
      testId="quote-generation-progress" />
    <ol className="t2q-generation-steps" aria-label="Quote progress">
      <li data-done="true"><Check size={14} aria-hidden="true" />Job saved</li>
      <li aria-current={complete ? undefined : "step"}>Writing quote</li>
      <li data-done={complete} aria-current={complete ? "step" : undefined}>Ready to review</li>
    </ol>
  </div>;
}
