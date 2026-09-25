import { describe, expect, it } from "vitest";
import { runTakeoff as runOrchestratedTakeoff } from "../index";
import { legacyScopeCoverage } from "../legacyCoverage";
import {
  canRunCalculator,
  parseTakeoffDescription,
  runTakeoff as runLegacyTakeoff,
} from "@/lib/aiTakeoffParser";
import type { ScopeResult } from "../schemas";

// A realistic deck drawing transcript as emitted by ScanPanel's
// buildFinalTranscript (structured markers first, then the boilerplate
// timber instruction that mentions "stud", then the scanned annotations).
const DECK_DRAWING = [
  "[T2Q_PLAN] type=deck length_m=8 width_m=6 joist_spacing_mm=450",
  "[T2Q_TIMBER] stock_length_m=6",
  "Job type: Deck.",
  "Tradie buys timber in 6m lengths. Calculate board / stud / plate / decking counts in whole 6m lengths with a 10% waste factor.",
  "What is being built: timber deck.",
  "DIMENSIONS (tradie-confirmed):\n8m x 6m deck",
  "STRUCTURAL ELEMENTS & FIXINGS:\nJOISTS 140x45 H3.2\nBEARERS 140x45 H3.2\nDECKING 140x19",
].join("\n\n");

// Mirror the generate route's decision: a blocked orchestrator-only scope
// on a drawing becomes a hard-blocking takeoff line. We assert that for a
// deck drawing no such blocked line is produced.
function orchestratorOnlyBlockedScopes(transcript: string): ScopeResult[] {
  const parsed = parseTakeoffDescription(transcript);
  const useCalculator = canRunCalculator(parsed);
  const covers = legacyScopeCoverage(parsed.type, useCalculator);
  const orchestrated = runOrchestratedTakeoff(transcript);
  return orchestrated.scopes.filter(
    (s) => !covers.has(s.scope) && s.status === "blocked",
  );
}

describe("deck drawing — phantom framing block", () => {
  it("documents the root cause: the orchestrator raises a blocked framing scope from the boilerplate 'stud' wording", () => {
    const orchestrated = runOrchestratedTakeoff(DECK_DRAWING);
    const framing = orchestrated.scopes.find((s) => s.scope === "framing");
    expect(framing).toBeDefined();
    expect(framing?.status).toBe("blocked");
  });

  it("does NOT yield a blocked takeoff line for a deck drawing", () => {
    const blocked = orchestratorOnlyBlockedScopes(DECK_DRAWING);
    expect(blocked.map((s) => s.scope)).toEqual([]);
    // Specifically, the framing scope is covered by the deck legacy
    // calculator and never surfaces as orchestrator-only.
    expect(blocked.some((s) => s.scope === "framing")).toBe(false);
  });

  it("still produces the deck's normal materials (joists/bearers/decking)", () => {
    const parsed = parseTakeoffDescription(DECK_DRAWING);
    expect(parsed.type).toBe("deck");
    expect(canRunCalculator(parsed)).toBe(true);
    const calc = runLegacyTakeoff(parsed);
    expect(calc).not.toBeNull();
    expect(calc!.materials.length).toBeGreaterThan(0);
    const names = calc!.materials.map((m) => m.name.toLowerCase()).join(" ");
    expect(names).toMatch(/joist/);
    expect(names).toMatch(/decking|deck board/);
  });
});

describe("legacyScopeCoverage", () => {
  it("deck covers deck + framing + fixing when the calculator ran", () => {
    const covers = legacyScopeCoverage("deck", true);
    expect(covers.has("deck")).toBe(true);
    expect(covers.has("framing")).toBe(true);
    expect(covers.has("fixing")).toBe(true);
  });

  it("covers nothing when the legacy calculator did not run", () => {
    expect(legacyScopeCoverage("deck", false).size).toBe(0);
  });

  it("leaves wall/subfloor coverage unchanged (cladding covers framing too — cladding-drawing-coverage.test.ts)", () => {
    // The deck fix ONLY widened deck coverage; cladding later got the same
    // framing coverage for the same boilerplate reason. Wall and subfloor
    // keep exactly the scopes they covered before, so no framing regression.
    expect([...legacyScopeCoverage("wall", true)].sort()).toEqual([
      "fixing",
      "framing",
      "insulation",
      "lining",
    ]);
    expect([...legacyScopeCoverage("cladding", true)].sort()).toEqual(["cladding", "framing"]);
    expect([...legacyScopeCoverage("subfloor", true)].sort()).toEqual([
      "framing",
      "lining",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Regression guard: a REAL framing drawing must keep its safety behaviour.
// The deck fix must never suppress a genuine framing scope.
// ─────────────────────────────────────────────────────────────────────────
describe("real framing drawing — safety preserved (no regression)", () => {
  // A framing job with no usable wall dimensions: the legacy wall
  // calculator can't run, so the orchestrator's framing scope is the
  // safety net and must still surface as a blocking takeoff line.
  const FRAMING_DRAWING = [
    "Frame an interior partition wall.",
    "Studs at 600 centres, top plate, bottom plate, noggins.",
  ].join("\n");

  it("is not a deck job (the deck coverage change can't touch it)", () => {
    expect(parseTakeoffDescription(FRAMING_DRAWING).type).not.toBe("deck");
  });

  it("still raises a blocked framing scope when dimensions are missing", () => {
    const orchestrated = runOrchestratedTakeoff(FRAMING_DRAWING);
    const framing = orchestrated.scopes.find((s) => s.scope === "framing");
    expect(framing).toBeDefined();
    expect(framing?.status).toBe("blocked");
  });

  it("framing still surfaces as an orchestrator-only blocking line", () => {
    const blocked = orchestratorOnlyBlockedScopes(FRAMING_DRAWING);
    expect(blocked.some((s) => s.scope === "framing")).toBe(true);
  });
});
