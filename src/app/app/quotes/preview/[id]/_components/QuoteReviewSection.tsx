"use client";

import { useState, type ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";

/** Native disclosure keeps edits mounted and keyboard-accessible on every screen. */
export function QuoteReviewSection({ sectionId, title, summary, defaultOpen = false, children }: {
  sectionId: string; title: string; summary: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const [initialOpen] = useState(defaultOpen);
  return <details open={initialOpen} className="t2q-review-section" data-testid={`review-section-${sectionId}`}>
    <summary>
      <span className="min-w-0">
        <span className="t2q-review-section-title">{title}</span>
        <span className="t2q-review-section-summary">{summary}</span>
      </span>
      <CaretDown size={18} weight="bold" aria-hidden="true" />
    </summary>
    <div className="t2q-review-section-body">{children}</div>
  </details>;
}
