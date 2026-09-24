import { describe, expect, it } from "vitest";
import { sanitisePlan, type ScannedPlan } from "@/lib/scan-drawing";
import {
  extractStructuredPlanMarker,
  parseTakeoffDescription,
  runTakeoff,
} from "@/lib/aiTakeoffParser";
import { TIMEOUTS } from "@/lib/fetchTimeout";
import {
  applyDimensionEdits,
  buildFinalTranscript,
  SCAN_SLOW_NOTICE,
  SCAN_SLOW_NOTICE_MS,
  SCAN_TIMEOUT_MS,
  scanErrorMessage,
  type JobType,
  type ScanResult,
} from "./ScanPanel";

// ─────────────────────────────────────────────────────────────────────────
// Drawing-scan review: the screen tells the tradie "edit any number we got
// wrong — the materials list will use these". The takeoff used to keep the
// AI's plan marker anyway: the wall run always came from the marker, and a
// deck/subfloor correction under 25% was dropped by the marker-vs-text
// cross-check. Every corrected value must reach the quantities.
// ─────────────────────────────────────────────────────────────────────────

function scan(
  detectedType: JobType,
  buildType: string,
  plan: ScannedPlan | null,
  dimensions: string,
  structural = "",
): ScanResult {
  return {
    buildType,
    summary: "",
    dimensions,
    structural,
    notes: "",
    plan,
    documentType: "drawing",
    detectedType,
  };
}

function finalFor(result: ScanResult, edited: string): string {
  return buildFinalTranscript(result.detectedType, 6, result, edited);
}

const HOUSE_PLAN = sanitisePlan({
  shape: "rect",
  length_m: 12,
  width_m: 8,
  wall_run_m: 40,
  exterior_wall_run_m: 40,
  height_m: 2.4,
  stud_spacing_mm: 600,
  door_count: 4,
  window_count: 6,
});

const HOUSE_DIMS = [
  "Overall 12.0m x 8.0m",
  "EXTERIOR WALL RUN = 12.0 + 8.0 + 12.0 + 8.0 = 40.0m",
  "TOTAL WALL RUN = 40.0m",
  "Stud height 2.4m",
  "Studs at 600mm centres",
  "Doors: 4",
  "Windows: 6",
].join("\n");

const HOUSE = scan(
  "Framing",
  "Single-storey house floor plan",
  HOUSE_PLAN,
  HOUSE_DIMS,
  "90x45 H1.2 framing. GIB both sides.",
);

function wallLength(transcript: string): number | undefined {
  const r = parseTakeoffDescription(transcript);
  if (r.type !== "wall") throw new Error(`expected wall, got ${r.type}`);
  return r.input.wallLengthM;
}

describe("scan review edits flow into the wall takeoff", () => {
  it("a wall run corrected 40 m → 52 m frames 52 m (not the AI's 40 m)", () => {
    const edited = HOUSE_DIMS.replace("TOTAL WALL RUN = 40.0m", "TOTAL WALL RUN = 52.0m");
    const transcript = finalFor(HOUSE, edited);
    expect(extractStructuredPlanMarker(transcript)?.wallRunM).toBe(52);
    expect(wallLength(transcript)).toBe(52);

    const calc = runTakeoff(parseTakeoffDescription(transcript));
    const studs = calc?.materials.find((m) => m.id === "studs-90x45")?.quantity;
    // ceil(52000 / 600) + 1 = 88 base studs + (4 doors + 6 windows) × 4 = 128.
    expect(studs).toBe(128);
  });

  it("a corrected wall-run ADDEND (total left alone) re-totals the run", () => {
    const edited = HOUSE_DIMS.replace(
      "TOTAL WALL RUN = 40.0m",
      "TOTAL WALL RUN = 40.0 + 12.0 = 40.0m",
    );
    // The tradie added the missing 12 m of partitions as an addend but left
    // the stated total — the sum of the addends is the corrected run.
    expect(wallLength(finalFor(HOUSE, edited))).toBe(52);
  });

  it("an exterior-run correction flows too (insulation is sized off it)", () => {
    const edited = HOUSE_DIMS.replace(
      "EXTERIOR WALL RUN = 12.0 + 8.0 + 12.0 + 8.0 = 40.0m",
      "EXTERIOR WALL RUN = 12.0 + 8.0 + 12.0 + 8.0 = 36.0m",
    );
    const r = parseTakeoffDescription(finalFor(HOUSE, edited));
    if (r.type !== "wall") throw new Error("not wall");
    expect(r.input.exteriorWallLengthM).toBe(36);
  });

  it("stud height and opening counts flow from the review screen", () => {
    const edited = HOUSE_DIMS.replace("Stud height 2.4m", "Stud height 2.7m")
      .replace("Doors: 4", "Doors: 5")
      .replace("Studs at 600mm centres", "Studs at 400mm centres");
    const r = parseTakeoffDescription(finalFor(HOUSE, edited));
    if (r.type !== "wall") throw new Error("not wall");
    expect(r.input.wallHeightM).toBe(2.7);
    expect(r.input.numberOfDoors).toBe(5);
    expect(r.input.studSpacingMm).toBe(400);
  });

  it("no edits → the marker is exactly the AI plan (unchanged behaviour)", () => {
    const transcript = finalFor(HOUSE, HOUSE_DIMS);
    const marker = transcript.split("\n")[0];
    expect(marker).toBe(
      "[T2Q_PLAN] type=wall length_m=12 width_m=8 height_m=2.4 wall_run_m=40 exterior_wall_run_m=40 stud_spacing_mm=600 door_count=4 window_count=6",
    );
    expect(wallLength(transcript)).toBe(40);
  });
});

const DECK_PLAN = sanitisePlan({
  shape: "rect",
  length_m: 6,
  width_m: 4.8,
  joist_spacing_mm: 450,
});

const DECK_DIMS = [
  "Deck length 6000mm = 6.0m",
  "Deck width 4800mm = 4.8m",
  "Joists at 450mm centres",
  "Post depth 600mm",
].join("\n");

const DECK = scan("Deck", "Timber deck", DECK_PLAN, DECK_DIMS);

function deckDims(transcript: string): [number | undefined, number | undefined] {
  const r = parseTakeoffDescription(transcript);
  if (r.type !== "deck") throw new Error(`expected deck, got ${r.type}`);
  return [r.input.deckLengthM, r.input.deckWidthM];
}

describe("scan review edits flow into the deck / subfloor takeoff", () => {
  it("a deck width corrected 4.8 m → 5.4 m (a 12.5% change) is used", () => {
    const edited = DECK_DIMS.replace("Deck width 4800mm = 4.8m", "Deck width 5400mm = 5.4m");
    expect(deckDims(finalFor(DECK, edited))).toEqual([6, 5.4]);
  });

  it("a small correction (4.8 → 4.9 m, 2%) is used too — any size of change", () => {
    const edited = DECK_DIMS.replace("Deck width 4800mm = 4.8m", "Deck width 4900mm = 4.9m");
    expect(deckDims(finalFor(DECK, edited))).toEqual([6, 4.9]);
  });

  it("an unlabelled '4800mm = 4.8m' line is matched to the plan by value", () => {
    const plain = scan("Deck", "Timber deck", DECK_PLAN, "6000mm = 6.0m\n4800mm = 4.8m");
    expect(deckDims(finalFor(plain, "6000mm = 6.0m\n5400mm = 5.4m"))).toEqual([6, 5.4]);
  });

  it("only the metres restatement edited ('4800mm = 5.4m') still wins", () => {
    const edited = DECK_DIMS.replace("Deck width 4800mm = 4.8m", "Deck width 4800mm = 5.4m");
    expect(deckDims(finalFor(DECK, edited))).toEqual([6, 5.4]);
  });

  it("a footprint pair line 'Deck 6m x 4.8m' → 'Deck 6m x 5.4m'", () => {
    const pair = scan("Deck", "Timber deck", DECK_PLAN, "Deck 6m x 4.8m\nPost depth 600mm");
    expect(deckDims(finalFor(pair, "Deck 6m x 5.4m\nPost depth 600mm"))).toEqual([6, 5.4]);
  });

  it("a stair / step width edit never touches the deck footprint", () => {
    const withStair = scan(
      "Deck",
      "Timber deck",
      DECK_PLAN,
      DECK_DIMS + "\nStair width 4.8m",
    );
    const edited = withStair.dimensions.replace("Stair width 4.8m", "Stair width 1.2m");
    expect(deckDims(finalFor(withStair, edited))).toEqual([6, 4.8]);
  });

  it("a subfloor width corrected 4.8 m → 5.4 m is used", () => {
    const plan = sanitisePlan({ shape: "rect", length_m: 8, width_m: 4.8 });
    const dims = "Floor length 8000mm = 8.0m\nFloor width 4800mm = 4.8m";
    const sub = scan("Framing", "Subfloor framing", plan, dims);
    const r = parseTakeoffDescription(
      finalFor(sub, dims.replace("4800mm = 4.8m", "5400mm = 5.4m")),
    );
    if (r.type !== "subfloor") throw new Error(`expected subfloor, got ${r.type}`);
    expect(r.input.floorLengthM).toBe(8);
    expect(r.input.floorWidthM).toBe(5.4);
  });

  it("a nonsense correction is flagged by the takeoff, not quoted", () => {
    const edited = DECK_DIMS.replace("Deck width 4800mm = 4.8m", "Deck width 54m");
    const r = parseTakeoffDescription(finalFor(DECK, edited));
    expect(runTakeoff(r)).toBeNull();
    expect(r.missingFields.length).toBeGreaterThan(0);
  });
});

describe("applyDimensionEdits", () => {
  it("returns the plan untouched when nothing was edited", () => {
    const out = applyDimensionEdits(DECK_PLAN, DECK_DIMS, DECK_DIMS);
    expect(out.plan).toBe(DECK_PLAN);
    expect(out.edits).toEqual([]);
  });

  it("reports what changed, field by field", () => {
    const out = applyDimensionEdits(
      DECK_PLAN,
      DECK_DIMS,
      DECK_DIMS.replace("4800mm = 4.8m", "5400mm = 5.4m").replace(
        "Joists at 450mm centres",
        "Joists at 400mm centres",
      ),
    );
    expect(out.plan?.width_m).toBe(5.4);
    expect(out.plan?.joist_spacing_mm).toBe(400);
    expect(out.edits.map((e) => e.field).sort()).toEqual(["joist_spacing_mm", "width_m"]);
  });

  it("works with no AI plan at all: the corrected lines build one", () => {
    const out = applyDimensionEdits(null, "TOTAL WALL RUN = 40m", "TOTAL WALL RUN = 52m");
    expect(out.plan?.wall_run_m).toBe(52);
  });
});

describe("scanErrorMessage — no raw codes shown to the tradie", () => {
  it("trial_expired → plain words", () => {
    expect(scanErrorMessage(402, { error: "trial_expired" })).toBe(
      "Your free trial has ended. Subscribe to keep scanning drawings.",
    );
  });

  it.each([
    [429, "rate_limited", /limit/i],
    [403, "ai_consent_required", /turn on ai features/i],
    [401, "Unauthorized", /sign in/i],
  ])("%s %s → friendly message", (status, code, expected) => {
    const msg = scanErrorMessage(status, { error: code });
    expect(msg).toMatch(expected);
    expect(msg).not.toContain(code);
  });

  it("an unknown code falls back to a generic message", () => {
    const msg = scanErrorMessage(500, { error: "vision_quota_exhausted" });
    expect(msg).not.toMatch(/vision_quota_exhausted/);
    expect(msg).toMatch(/scan failed/i);
  });

  it("human-written route messages still come through", () => {
    expect(
      scanErrorMessage(422, {
        error: "Couldn't read anything off that drawing. Try a clearer photo.",
      }),
    ).toBe("Couldn't read anything off that drawing. Try a clearer photo.");
  });

  it("server configuration detail is never shown to the tradie", () => {
    const msg = scanErrorMessage(503, {
      error: "Drawing scan is not configured. Set ANTHROPIC_API_KEY.",
    });
    expect(msg).not.toMatch(/ANTHROPIC|configured/);
  });

  it("an empty / non-JSON body gets the generic message with the status", () => {
    expect(scanErrorMessage(500, {})).toMatch(/scan failed \(500\)/i);
    expect(scanErrorMessage(500, null)).toMatch(/scan failed \(500\)/i);
  });
});

describe("the phone waits as long as the scan route may take", () => {
  it("aborts only after 300 s — one 140 s model attempt plus a retry fits", () => {
    expect(SCAN_TIMEOUT_MS).toBe(300_000);
    expect(SCAN_TIMEOUT_MS).toBeGreaterThanOrEqual(2 * TIMEOUTS.generation);
  });

  it("after ~30 s it says plainly that a large plan takes a while", () => {
    expect(SCAN_SLOW_NOTICE_MS).toBe(30_000);
    expect(SCAN_SLOW_NOTICE).toMatch(/still reading the drawing/i);
    expect(SCAN_SLOW_NOTICE).toMatch(/couple of minutes/);
  });
});
