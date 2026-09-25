import { describe, expect, it } from "vitest";
import { runTakeoff as runOrchestratedTakeoff } from "../index";
import { legacyScopeCoverage } from "../legacyCoverage";
import { canRunCalculator, parseTakeoffDescription } from "@/lib/aiTakeoffParser";

// Golden C05 / C03. Every cladding scan carries the scan boilerplate ("…board
// / stud / plate counts…") and "Job type: Framing.", which route an
// orchestrator FRAMING scope. It sizes studs, plates and nogs off the
// cladding run — a whole new wall frame nobody asked for on a re-clad — and
// the cladding legacy calculator didn't suppress it the way the deck one
// does. A 12 m cladding scan got 21 studs, 8 plates, 3 nogs and a box of nails.

const CLADDING_SCAN = [
  "[T2Q_PLAN] type=cladding length_m=12 height_m=2.4",
  "[T2Q_TIMBER] stock_length_m=4.8",
  "Job type: Framing.",
  "Tradie buys timber in 4.8m lengths. Calculate board / stud / plate counts in whole 4.8m lengths with a 10% waste factor.",
  "What is being built: weatherboard cladding.",
].join("\n");

function orchestratorOnlyScopes(transcript: string): string[] {
  const parsed = parseTakeoffDescription(transcript);
  const covers = legacyScopeCoverage(parsed.type, canRunCalculator(parsed));
  return runOrchestratedTakeoff(transcript)
    .scopes.filter((s) => !covers.has(s.scope))
    .map((s) => s.scope);
}

describe("cladding scan — no phantom wall framing (golden C05)", () => {
  it("documents the cause: the boilerplate routes a framing scope that sizes studs off the cladding run", () => {
    const framing = runOrchestratedTakeoff(CLADDING_SCAN).scopes.find((s) => s.scope === "framing");
    expect(framing?.lines.find((l) => l.id === "studs-90x45")?.quantity).toBe(21);
  });

  it("the cladding calculator covers the framing scope, so none of it reaches the quote", () => {
    expect([...legacyScopeCoverage("cladding", true)].sort()).toEqual(["cladding", "framing"]);
    expect(orchestratorOnlyScopes(CLADDING_SCAN)).toEqual([]);
  });

  it("a cladding job the calculator can't size keeps every orchestrator scope (nothing suppressed)", () => {
    expect(legacyScopeCoverage("cladding", false).size).toBe(0);
  });
});
