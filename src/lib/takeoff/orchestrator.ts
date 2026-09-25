// ─────────────────────────────────────────────────────────────────────────
// Takeoff orchestrator — main entry point.
//
// Pipeline:
//
//   text/image/form  →  routeScope()       (which scopes apply)
//                    →  extractFromText()  (per scope; LLM hooks via
//                                           extractFromLLM)
//                    →  validate()         (block / flag / pass)
//                    →  buildClarifications()  (when blocked)
//                    →  runCalculator()    (per scope; pure)
//                    →  explainScope()     (render working narrative)
//                    →  TakeoffResult
//
// The orchestrator is pure code — no LLM calls. When a caller wants to
// feed LLM-supplied structured extraction (instead of regex), it can
// call extractFromLLM and then `runTakeoffWithExtraction` directly.
// ─────────────────────────────────────────────────────────────────────────

import { runCalculator } from "./calculators";
import { buildClarifications } from "./clarify";
import { evaluateScope, evaluateTakeoff } from "./evaluate";
import { explainScope } from "./explain";
import { extractFromLLM, extractFromText } from "./extraction";
import { licenseScopes, type LicenseContext } from "./license";
import { routeScope } from "./scope-router";
import type {
  ClarificationQuestion,
  ExtractedExtraction,
  ScopeResult,
  ScopeType,
  TakeoffResult,
} from "./schemas";
import { worstStatus } from "./schemas";
import { validateExtractionForScope } from "./validate";

export type OrchestratorOptions = {
  /**
   * Provide a pre-built extraction (from the LLM) for one or more
   * scopes. If a scope is in this map the orchestrator skips the
   * regex extraction for that scope and uses the supplied one.
   */
  llmExtractions?: Partial<Record<ScopeType, ExtractedExtraction>>;
  /**
   * If true, fall through to the generic calculator when a more
   * specific scope is blocked. Defaults to false — we prefer to
   * surface a clarification rather than emit shaky numbers.
   */
  allowGenericFallback?: boolean;
  /**
   * Context for the positive scope-licensing layer (license.ts) —
   * e.g. the legacy scan classification, which is positive deck
   * evidence when type=deck.
   */
  licenseContext?: LicenseContext;
};

/**
 * One-shot entry — feed a raw description, get a structured
 * TakeoffResult back.
 */
export function runTakeoff(
  description: string,
  options: OrchestratorOptions = {},
): TakeoffResult {
  const route = routeScope(description);
  const scopes: ScopeResult[] = [];
  const allClarifications: ClarificationQuestion[] = [];
  const warnings: string[] = [];

  // ── Positive scope licensing (P0) ───────────────────────────────────
  // The router SUGGESTS scopes; the license layer decides what is
  // actually allowed to calculate. A denied scope (e.g. deck routed off
  // bare joist/bearer keywords with no deck evidence) produces NO lines
  // — only a visible warning + non-blocking clarification so the tradie
  // can supply the evidence and regenerate.
  const { licenses, denials } = licenseScopes(
    description,
    route,
    options.licenseContext,
  );
  for (const denial of denials) {
    warnings.push(`${denial.scope}: ${denial.reason}`);
    allClarifications.push({
      id: `${denial.scope}.license`,
      scope: denial.scope,
      field: "license",
      question: denial.reason,
      blocking: false,
    });
  }
  const licensedScopes = licenses.map((l) => l.scope);
  // Everything denied → run generic (same fallback as a no-match route)
  // so the tradie still gets a stock/coverage result instead of nothing.
  if (licensedScopes.length === 0) licensedScopes.push("generic");

  for (const scope of licensedScopes) {
    // 1. Get the extraction — LLM if supplied, else regex.
    const ext: ExtractedExtraction =
      options.llmExtractions?.[scope] ?? extractFromText(description, scope);

    // 2. Validate.
    const validation = validateExtractionForScope(ext, scope);

    // 3. If blocked, build clarifications and skip the calculator.
    if (validation.status === "blocked") {
      const { questions, blocking } = buildClarifications(
        scope,
        ext,
        validation.problems,
      );
      allClarifications.push(...questions);
      warnings.push(...validation.reasons.map((r) => `${scope}: ${r}`));
      const blockedScope: ScopeResult = {
        scope,
        status: "blocked",
        summary: {
          primary_metric: "n/a",
          primary_value: 0,
          unit: "",
          inputs: {},
        },
        lines: [],
        warnings: validation.reasons,
        assumptions: [],
        clarifications: questions,
        explanation: "Calculation blocked — clarification required.",
      };
      scopes.push(blockedScope);
      // If a critical scope is blocked AND the caller opted in to
      // generic fallback, run the generic calculator on the same
      // extraction so the tradie still has *something*.
      if (blocking && options.allowGenericFallback) {
        const generic = runCalculator("generic", { ...ext, scope_type: "generic" });
        generic.assumptions.unshift(
          `Falling back to generic calculator after ${scope} scope was blocked.`,
        );
        generic.explanation = explainScope(generic);
        scopes.push(generic);
      }
      continue;
    }

    // 4. Run the calculator.
    const result = runCalculator(scope, ext);
    // Flags from validation roll up into the scope result.
    if (validation.flags.length > 0) {
      result.warnings.push(...validation.flags);
      // Promote status to needs_review if validate flagged something
      // but the calculator was happy.
      if (result.status === "ok" || result.status === "assumed") {
        result.status = "needs_review";
        for (const l of result.lines) {
          if (l.status === "ok") l.status = "needs_review";
          l.validation_flags.push(...validation.flags);
        }
      }
    }
    // Post-calc plausibility pass (advisory; never changes quantities).
    result.evaluator = evaluateScope(result, ext);
    result.explanation = explainScope(result);
    scopes.push(result);
    allClarifications.push(...result.clarifications);
  }

  const status = worstStatus(scopes.map((s) => s.status));
  const evaluator = evaluateTakeoff(
    scopes.flatMap((s) => (s.evaluator ? [s.evaluator] : [])),
  );
  // Primary must be a LICENSED scope — a denied route.primary (e.g. deck
  // routed off joist keywords) must not present itself as the job type.
  const primary_scope = licensedScopes.includes(route.primary)
    ? route.primary
    : licensedScopes[0];
  return {
    status,
    primary_scope,
    scopes,
    clarifications: allClarifications,
    warnings,
    evaluator,
    licenses,
    license_denials: denials,
  };
}

/**
 * Alternative entry — caller already has a validated extraction (from
 * the LLM extraction agent or from a manual form). Skips the routing
 * step and runs the calculator directly.
 *
 * LICENSING NOTE: `ext.scope_type` here is treated as the caller's own
 * positive scope evidence (a manual form selection is user-confirmed;
 * a marker is scan evidence). Free-text inputs must go through
 * `runTakeoff`, where the license layer gates deck on explicit
 * evidence. The insulation exterior-wall gate still applies here via
 * validate.ts + the calculator's own guard — it cannot be bypassed.
 */
export function runTakeoffWithExtraction(
  ext: ExtractedExtraction,
): TakeoffResult {
  const validation = validateExtractionForScope(ext, ext.scope_type);
  if (validation.status === "blocked") {
    const { questions } = buildClarifications(
      ext.scope_type,
      ext,
      validation.problems,
    );
    return {
      status: "blocked",
      primary_scope: ext.scope_type,
      scopes: [
        {
          scope: ext.scope_type,
          status: "blocked",
          summary: {
            primary_metric: "n/a",
            primary_value: 0,
            unit: "",
            inputs: {},
          },
          lines: [],
          warnings: validation.reasons,
          assumptions: [],
          clarifications: questions,
          explanation: "Calculation blocked — clarification required.",
        },
      ],
      clarifications: questions,
      warnings: validation.reasons,
    };
  }
  const result = runCalculator(ext.scope_type, ext);
  if (validation.flags.length > 0) {
    result.warnings.push(...validation.flags);
    if (result.status === "ok" || result.status === "assumed") {
      result.status = "needs_review";
    }
  }
  result.evaluator = evaluateScope(result, ext);
  result.explanation = explainScope(result);
  return {
    status: result.status,
    primary_scope: ext.scope_type,
    scopes: [result],
    clarifications: result.clarifications,
    warnings: [...result.warnings],
    evaluator: result.evaluator,
  };
}

// Re-export the most-used symbols so callers can do a single import.
import { CALCULATORS } from "./calculators";
const CALCULATORS_KEYS = Object.keys(CALCULATORS) as ScopeType[];
export {
  buildClarifications,
  CALCULATORS_KEYS,
  extractFromLLM,
  extractFromText,
  routeScope,
  validateExtractionForScope,
};
