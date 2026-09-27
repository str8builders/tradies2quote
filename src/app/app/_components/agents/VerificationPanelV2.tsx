"use client";

import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { Callout } from "@/components/ui/callout";
import type { VerificationReport } from "@/lib/agents/verify/quoteVerify";

/** What each checker did, in plain words. */
const CHECKED_BY: Record<VerificationReport["checkedBy"][number], string> = {
  deterministic: "The sums and prices were double-checked",
  critic: "T2Q read the quote over a second time",
};

/**
 * The verification report in the new look (VerificationPanel look="new").
 * Same states and test ids as the classic panel:
 *   - no issues → a quiet "nothing to fix" line
 *   - warnings  → a warn callout, worth a look
 *   - any error → a bad callout, with "Must fix" on the errors
 */
export function VerificationPanelV2({ report }: { report: VerificationReport }) {
  if (report.issues.length === 0) {
    const checked = report.checkedBy.map((by) => CHECKED_BY[by]).join(", and ");
    return (
      <p data-testid="quote-verification-ok" className="flex items-start gap-2 text-ui-sm text-ui-muted">
        <CheckCircle aria-hidden="true" weight="fill" className="mt-0.5 shrink-0 text-[1.125rem] text-ui-ok" />
        <span>{checked ? `${checked}. Nothing to fix.` : "Checked. Nothing to fix."}</span>
      </p>
    );
  }

  return (
    <div data-testid="quote-verification" data-ok={report.ok ? "true" : "false"}>
      <Callout
        tone={report.ok ? "warn" : "bad"}
        title={report.ok ? "Worth a look before you send" : "Something to fix before you send"}
      >
        <ul className="list-disc space-y-1 pl-5">
          {report.issues.map((issue, i) => (
            <li key={i}>
              {issue.severity === "error" ? <span className="font-semibold">Must fix: </span> : null}
              {issue.message}
            </li>
          ))}
        </ul>
      </Callout>
    </div>
  );
}
