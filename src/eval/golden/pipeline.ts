// ─────────────────────────────────────────────────────────────────────────
// Golden jobs — the deterministic half of the production quote pipeline.
//
// `runQuotePipeline` (src/lib/quote-generation/run.ts) needs a database and a
// model, so it can't run in `npm test`. Everything it does to MATERIAL
// QUANTITIES is deterministic, though, and lives in exported functions. This
// file calls those same functions in the same order, with the same inputs:
//
//   raw transcript
//     → applyDeterministicCorrections      (run.ts: spoken numbers → digits)
//     → parseTakeoffDescription            (legacy wall/deck/cladding/subfloor)
//     → canRunCalculator → runTakeoff      (legacy calculator lines)
//     → takeoff orchestrator runTakeoff    (roofing, fencing, concrete, …)
//     → legacyScopeCoverage                (drop orchestrator scopes the
//                                           legacy calculator already covers)
//     → voiceTakeoffSizesNeeded            (voice/typed: a calculator job
//                                           missing a size gets one blocked
//                                           line naming it)
//     → guardLinesForScope                 (strip deck-only lines from a
//                                           non-deck job)
//
// Keep it in step with run.ts: if run.ts changes how calculator lines reach a
// quote, change this mirror too (the golden jobs would otherwise stop proving
// what production does). No AI lines are produced here — the model's output
// is not deterministic; its labour/other lines are supplied per job instead.
// ─────────────────────────────────────────────────────────────────────────

import {
  canRunCalculator,
  parseTakeoffDescription,
  runTakeoff as runLegacyTakeoff,
  voiceTakeoffSizesNeeded,
  type ParsedTakeoffResult,
} from "@/lib/aiTakeoffParser";
import { runTakeoff as runOrchestratedTakeoff } from "@/lib/takeoff";
import { legacyScopeCoverage, orchestratorSizedLegacyJob } from "@/lib/takeoff/legacyCoverage";
import { guardLinesForScope, scopeFamilyForType } from "@/lib/takeoff/scopeFamily";
import type { TakeoffResult } from "@/lib/takeoff/schemas";
import { applyDeterministicCorrections } from "@/lib/transcriptCleanup";

/** One material line the pipeline would put on the quote (before pricing). */
export type PipelineLine = {
  /** Calculator line id (legacy `m.id` / orchestrator `l.id`), or `blocked:<scope>`. */
  id: string;
  /** Where it came from: "legacy:<type>" or "orchestrator:<scope>". */
  source: string;
  description: string;
  quantity: number;
  unit: string;
  /** run.ts takeoff_status for the line. */
  status: "ok" | "assumed" | "needs_review" | "blocked";
};

export type PipelineResult = {
  /** The transcript every calculator read (after the deterministic cleanup). */
  transcript: string;
  parsed: ParsedTakeoffResult;
  useCalculator: boolean;
  orchestrated: TakeoffResult;
  lines: PipelineLine[];
};

export function runDeterministicPipeline(rawTranscript: string): PipelineResult {
  // run.ts: vocab-free deterministic cleanup (a tradie with no custom vocab).
  const transcript =
    applyDeterministicCorrections(rawTranscript).cleanedTranscript.trim() ||
    rawTranscript;

  const parsed = parseTakeoffDescription(transcript);
  const useCalculator = canRunCalculator(parsed);
  const isDrawing = /\[T2Q_(?:PLAN|TIMBER)\]/i.test(transcript);
  // run.ts audit item 2: a VOICE/typed calculator job whose size is missing
  // or can't be right gets one blocked line naming the size needed.
  const voiceSizesNeeded =
    !isDrawing && !useCalculator ? voiceTakeoffSizesNeeded(parsed, transcript) : null;

  const orchestrated = runOrchestratedTakeoff(transcript, {
    licenseContext: { scanType: parsed.type },
  });
  const legacyCovers = legacyScopeCoverage(parsed.type, useCalculator);
  const voiceSizesStillNeeded =
    voiceSizesNeeded && !orchestratorSizedLegacyJob(parsed.type, orchestrated.scopes)
      ? voiceSizesNeeded
      : null;

  const lines: PipelineLine[] = [];

  if (useCalculator) {
    const statusByFormula = new Map<string, PipelineLine["status"]>();
    for (const scope of orchestrated.scopes) {
      for (const l of scope.lines) statusByFormula.set(l.basis.formula, l.status);
    }
    const calc = runLegacyTakeoff(parsed);
    for (const m of calc?.materials ?? []) {
      const base = statusByFormula.get(m.formula) ?? "ok";
      const status: PipelineLine["status"] = m.blocked
        ? "blocked"
        : m.requiresReview && (base === "ok" || base === "assumed")
          ? "needs_review"
          : base;
      lines.push({
        id: m.id,
        source: `legacy:${parsed.type}`,
        description: m.name,
        quantity: m.quantity,
        unit: m.unit,
        status,
      });
    }
  }

  for (const scope of orchestrated.scopes.filter((s) => !legacyCovers.has(s.scope))) {
    if (scope.status === "blocked") {
      // Voice/typed: a note only. Drawings: an explicit blocked line.
      if (isDrawing) {
        lines.push({
          id: `blocked:${scope.scope}`,
          source: `orchestrator:${scope.scope}`,
          description: `${scope.scope} takeoff — needs dimensions before it can be quoted`,
          quantity: 0,
          unit: "each",
          status: "blocked",
        });
      }
      continue;
    }
    for (const l of scope.lines) {
      lines.push({
        id: l.id,
        source: `orchestrator:${scope.scope}`,
        description: l.name,
        quantity: l.quantity,
        unit: l.unit,
        status: l.status,
      });
    }
  }

  if (isDrawing && !useCalculator && parsed.type !== "unknown") {
    lines.push({
      id: `blocked:${parsed.type}`,
      source: `legacy:${parsed.type}`,
      description: `${parsed.type} takeoff — needs dimensions before it can be quoted`,
      quantity: 0,
      unit: "each",
      status: "blocked",
    });
  }
  if (voiceSizesStillNeeded) {
    lines.push({
      id: `blocked:${parsed.type}`,
      source: `legacy:${parsed.type}`,
      description: `${parsed.type} takeoff — needs dimensions before it can be quoted`,
      quantity: 0,
      unit: "each",
      status: "blocked",
    });
  }

  // run.ts scope-family guard: deck-only lines never survive on a non-deck job.
  const guarded = guardLinesForScope(lines, scopeFamilyForType(parsed.type));

  return {
    transcript,
    parsed,
    useCalculator,
    orchestrated,
    lines: guarded.kept,
  };
}
