// ─────────────────────────────────────────────────────────────────────────
// Plan-reader — lightweight per-sheet observability.
//
// Emits ONE structured JSON line per sheet to stdout so it surfaces in Vercel
// runtime logs (and the eval harness) without a new DB table. Captures exactly
// the signals asked for: sheet type, classification confidence, gate results,
// final status, and any extraction error. Deliberately minimal — no PII, no
// image bytes, no quote contents.
// ─────────────────────────────────────────────────────────────────────────

import type { GateResult } from "./gates";

export type PlanSheetLog = {
  phase: "classify" | "extract";
  file_id: string;
  sheet_id: string;
  sheet_number: number;
  sheet_type: string;
  classification_confidence?: number;
  /** Compact gate verdicts: "scale:pass", "required_dims_present:FAIL(hard)". */
  gates?: string[];
  final_status: string;
  review_required?: boolean;
  /** Non-fatal extraction problems (model error, unparseable, image missing). */
  errors?: string[];
};

export function gateSummary(results: GateResult[]): string[] {
  return results.map(
    (r) => `${r.gate}:${r.pass ? "pass" : r.hard ? "FAIL(hard)" : "fail"}`,
  );
}

/** Emit a single structured log line for one sheet. Never throws. */
export function logPlanSheet(entry: PlanSheetLog): void {
  try {
     
    console.log(`[plan-reader] ${JSON.stringify(entry)}`);
  } catch {
    // Logging must never break the request.
  }
}

export type PlanRunSummary = {
  file_id: string;
  phase: "classify" | "extract";
  total: number;
  by_status: Record<string, number>;
  review_required: number;
  errored: number;
};

/** Roll a set of per-sheet logs into a one-line run summary. */
export function summarizePlanRun(
  file_id: string,
  phase: "classify" | "extract",
  sheets: PlanSheetLog[],
): PlanRunSummary {
  const by_status: Record<string, number> = {};
  let review_required = 0;
  let errored = 0;
  for (const s of sheets) {
    by_status[s.final_status] = (by_status[s.final_status] ?? 0) + 1;
    if (s.review_required) review_required += 1;
    if (s.errors && s.errors.length) errored += 1;
  }
  const summary: PlanRunSummary = {
    file_id,
    phase,
    total: sheets.length,
    by_status,
    review_required,
    errored,
  };
  try {
     
    console.log(`[plan-reader:summary] ${JSON.stringify(summary)}`);
  } catch {
    // ignore
  }
  return summary;
}
