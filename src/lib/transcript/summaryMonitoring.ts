import "server-only";
import { captureError } from "@/lib/observability";
import type { SummaryFailureReport } from "@/lib/transcriptCleanup";

/**
 * Server-side sink for transcript-summary failures (buildSummary degrades
 * them to "no summary"). Passed as `onSummaryFailure` by every server caller
 * of cleanTranscript. The report is PII-free by construction — a fixed
 * message, the stage, the error class name and an HTTP status — so nothing
 * from the transcript or the model's reply reaches the error monitor.
 */
export function reportSummaryFailureToMonitor(
  report: SummaryFailureReport,
): void {
  captureError(
    new Error(
      report.stage === "call"
        ? "Transcript summary call failed"
        : "Transcript summary response was not valid JSON",
    ),
    {
      route: "transcriptCleanup/buildSummary",
      ...(report.httpStatus ? { httpStatus: report.httpStatus } : {}),
      extra: { stage: report.stage, errorName: report.errorName },
    },
  );
}
