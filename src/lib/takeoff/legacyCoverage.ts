import type { ScopeType } from "./schemas";

// Maps the legacy aiTakeoffParser type → the orchestrator scopes it
// already covers. When the legacy deterministic calculator runs for a
// drawing (useCalculator === true), any orchestrator scope listed here is
// suppressed in the generate route so the orchestrator can neither
// double-up materials nor raise a phantom BLOCKED line for a sub-scope the
// legacy calculator already handles.
//
// `deck` covers `framing` and `fixing`: a deck's joists/bearers ARE its
// structural framing (the deck calculator emits them), and the scan's
// boilerplate "Calculate board / stud / plate / decking counts"
// instruction trips the framing scope-router on the word "stud" for EVERY
// deck drawing — the framing extractor then has no wall dimensions and
// returns status "blocked". Without this coverage that became a
// "framing takeoff — needs dimensions before it can be quoted" line that
// hard-blocked sending on every deck drawing. A deck-typed scan never
// carries a genuinely-separate wall-framing or interior-fixing scope, so
// suppressing them here is safe.
//
// `cladding` covers `framing` for the same reason: every cladding scan has
// the same boilerplate plus "Job type: Framing.", and there the framing
// scope DID find dimensions — it sized studs, plates and nogs off the
// cladding run (a 12 m re-clad got 21 studs, 8 plates, 3 nogs and nails): a
// new wall frame nobody asked for. Cladding goes over existing framing (the
// cladding calculator emits the battens, wrap and fixings it needs).
export const LEGACY_SCOPE_COVERAGE: Record<string, ScopeType[]> = {
  deck: ["deck", "framing", "fixing"],
  cladding: ["cladding", "framing"],
  wall: ["framing", "lining", "insulation", "fixing"],
  subfloor: ["framing", "lining"],
};

/**
 * The set of orchestrator scopes already covered by the legacy
 * calculator for this drawing. Empty when the legacy calculator did not
 * run (useCalculator === false) — in that case every orchestrator scope
 * is "orchestrator-only".
 */
export function legacyScopeCoverage(
  legacyType: string,
  useCalculator: boolean,
): Set<ScopeType> {
  return useCalculator
    ? new Set(LEGACY_SCOPE_COVERAGE[legacyType] ?? [])
    : new Set<ScopeType>();
}

/**
 * Whether the orchestrator already SIZED a voice/typed job of this legacy
 * type: some scope that job type owns (fixings alone don't count) came back
 * unblocked with counted lines. Then the job needs no "sizes needed" blocked
 * line — e.g. a frame-only wall, or a ceiling or partition lined by area,
 * which the legacy wall calculator can't size but the orchestrator can.
 * Used by run.ts and mirrored by the golden-job pipeline.
 */
export function orchestratorSizedLegacyJob(
  legacyType: string,
  scopes: ReadonlyArray<{ scope: ScopeType; status: string; lines: ReadonlyArray<unknown> }>,
): boolean {
  const owned: readonly ScopeType[] = (LEGACY_SCOPE_COVERAGE[legacyType] ?? []).filter((s) => s !== "fixing");
  return scopes.some((s) => s.status !== "blocked" && s.lines.length > 0 && owned.includes(s.scope));
}
