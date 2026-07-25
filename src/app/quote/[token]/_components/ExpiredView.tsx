"use client";

import { Warning } from "@phosphor-icons/react/dist/ssr";

type Props = {
  reason: "expired" | "not_found" | "unavailable";
  /**
   * Overrides the default `expired-<reason>` testid. Lets the two distinct
   * not_found causes (a genuine RPC miss vs a token on a non-live/draft
   * quote) carry different testids without changing the customer-facing
   * copy — so they're never again conflated the way they were in the
   * 2026-07-17 outage.
   */
  testId?: string;
};

const COPY = {
  expired: {
    title: "Quote expired",
    body: "This quote has passed its valid-until date. Please contact the tradie for an updated quote.",
  },
  not_found: {
    title: "Quote not found",
    body: "We couldn't find a quote at this link. Double-check the URL or contact the tradie.",
  },
  unavailable: {
    title: "Quote no longer available",
    body: "This quote has been withdrawn by the tradie. Please get in touch with them for an updated quote.",
  },
} as const;

export function ExpiredView({ reason, testId }: Props) {
  const { title, body } = COPY[reason];
  return (
    <section
      data-testid={testId ?? `expired-${reason}`}
      className="t2q-card-pro p-6 sm:p-8 text-center"
    >
      <Warning
        size={32}
        weight="bold"
        className="mx-auto text-hivis"
        aria-hidden="true"
      />
      <h1 className="mt-3 font-display text-2xl uppercase tracking-tight">
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm text-ink-300">{body}</p>
    </section>
  );
}
