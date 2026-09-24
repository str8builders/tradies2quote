"use client";

import { CheckCircle, Warning } from "@phosphor-icons/react";
import type { VerificationReport } from "@/lib/agents/verify/quoteVerify";

/**
 * Renders a quote's verification report. Pure + presentational so it can be
 * render-tested directly (the parent agent gates it behind `result` state).
 *   - no issues  → a quiet green "checks passed" line
 *   - warnings   → amber callout, "worth a glance"
 *   - any error  → red callout, "fix before sending"
 */
export function VerificationPanel({ report }: { report: VerificationReport }) {
  if (report.issues.length === 0) {
    return (
      <p
        data-testid="quote-verification-ok"
        className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300"
      >
        <CheckCircle size={13} weight="fill" />
        {`// verification — ${report.checkedBy.join(" + ")} checks passed`}
      </p>
    );
  }

  return (
    <div
      data-testid="quote-verification"
      data-ok={report.ok ? "true" : "false"}
      className={`rounded-sm border p-4 ${
        report.ok ? "border-hivis/40 bg-hivis/10" : "border-red-500/50 bg-red-500/10"
      }`}
    >
      <p
        className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] ${
          report.ok ? "text-hivis" : "text-red-300"
        }`}
      >
        <Warning size={13} weight="fill" />
        {report.ok
          ? "// verification — worth a glance"
          : "// verification — fix before sending"}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-ink-100">
        {report.issues.map((iss, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span
              aria-hidden="true"
              className={`mt-0.5 shrink-0 ${
                iss.severity === "error" ? "text-red-300" : "text-hivis"
              }`}
            >
              {iss.severity === "error" ? "✕" : "→"}
            </span>
            <span>{iss.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
