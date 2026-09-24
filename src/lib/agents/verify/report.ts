import type {
  VerificationIssue,
  VerificationReport,
} from "./quoteVerify";

/**
 * Narrow a stored `quote_data.verification` (typed `unknown` on QuoteData,
 * like the other server-side review payloads) back into a report the
 * review page can render. Returns null for anything malformed — a bad or
 * legacy payload simply hides the panel, it never breaks the page.
 * Pure; no server-only imports.
 */
export function parseVerificationReport(
  value: unknown,
): VerificationReport | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { ok?: unknown; issues?: unknown; checkedBy?: unknown };
  if (typeof v.ok !== "boolean" || !Array.isArray(v.issues)) return null;
  if (!Array.isArray(v.checkedBy)) return null;
  const issues: VerificationIssue[] = [];
  for (const raw of v.issues) {
    const i = (raw ?? {}) as Partial<VerificationIssue>;
    if (typeof i.message !== "string" || !i.message.trim()) continue;
    issues.push({
      code: typeof i.code === "string" ? i.code : "check",
      severity: i.severity === "error" ? "error" : "warning",
      message: i.message,
    });
  }
  const checkedBy = v.checkedBy.filter(
    (c): c is "deterministic" | "critic" =>
      c === "deterministic" || c === "critic",
  );
  if (checkedBy.length === 0) return null;
  return { ok: v.ok, issues, checkedBy };
}
