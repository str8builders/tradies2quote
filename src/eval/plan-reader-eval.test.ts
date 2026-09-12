/**
 * Plan-reader eval — RUNS REAL CLAUDE VISION CALLS per fixture sheet.
 *
 * Gated behind RUN_PLAN_EVAL so it never runs in `npm test` / CI (it costs
 * money and is non-deterministic). Run it deliberately:
 *
 *   npm run eval:plans
 *
 * It pulls ANTHROPIC_API_KEY from the shell env or `.env.local`, runs the SAME
 * classifier + extractor the /api/plans routes use against each fixture sheet,
 * and MEASURES (never guesses) baseline quality:
 *
 *   - classification accuracy        predicted sheet_type == hand-labelled truth
 *   - scale-extraction success       scale parsed (conf > 0) vs expectation
 *   - OCR / dimension quality        avg ocr_confidence + expected-dims-found rate
 *   - required-dims-present rate     the required_dims gate outcome
 *   - per-sheet gate outcomes        full gate verdicts + final status
 *
 * A missing-fixture preflight FAILS deliberately; individual absent cases are skipped, so src/eval/plan-reader-cases.ts
 * can document required coverage. Recorded classification, dimensions, scale
 * usability and required-dimension expectations are release assertions.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  classifyFromText,
  classifyFromVision,
  combineClassification,
} from "@/lib/planreader/classify";
import { classificationGate } from "@/lib/planreader/gates";
import { extractSheet } from "@/lib/planreader/extract";
import { isSupportedSheetType } from "@/lib/planreader/schema";
import { PLAN_READER_CASES, type PlanReaderCase } from "./plan-reader-cases";

const ENABLED = process.env.RUN_PLAN_EVAL === "1";
const DRAWINGS_DIR = resolve(process.cwd(), "src/eval/fixtures/drawings");

function resolveApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const m = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env.local — fine.
  }
  return null;
}

function mediaTypeFor(file: string): string {
  const ext = file.toLowerCase().split(".").pop() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

function within(actual: number, expected: number, tolPct: number): boolean {
  if (expected === 0) return Math.abs(actual) < 0.01;
  return Math.abs(actual - expected) / expected <= tolPct / 100;
}

type CaseResult = {
  id: string;
  expectedType: string;
  predictedType: string;
  classOk: boolean;
  confidence: number;
  scaleExpected: boolean | null;
  scaleParsed: boolean;
  scaleOk: boolean | null;
  ocrConfidence: number;
  dimsExpected: number;
  dimsFound: number;
  requiredDimsExpected: boolean | null;
  requiredDimsPass: boolean | null;
  gates: string[];
  finalStatus: string;
};

const results: CaseResult[] = [];

describe.skipIf(!ENABLED)("plan-reader classification + extraction eval", () => {
  const apiKey = resolveApiKey();

  it("has an API key", () => {
    expect(
      apiKey,
      "Set ANTHROPIC_API_KEY in the env or .env.local to run the plan eval.",
    ).toBeTruthy();
  });

  it("has every required, hand-labelled drawing fixture", () => {
    const missing = PLAN_READER_CASES.filter(c => !existsSync(resolve(DRAWINGS_DIR, c.image))).map(c => c.image);
    expect(missing, "Add and hand-verify representative plan sheets before enabling plan reading.").toEqual([]);
  });

  for (const c of PLAN_READER_CASES) {
    const imgPath = resolve(DRAWINGS_DIR, c.image);
    const present = existsSync(imgPath);

    it.skipIf(!present || !apiKey)(
      `${c.id} — ${c.notes ?? c.expect.sheet_type}`,
      async () => {
        const key = apiKey as string;
        const base64 = readFileSync(imgPath).toString("base64");
        const mediaType = mediaTypeFor(c.image);

        // 1. Classify (filename + vision), then gate.
        const textVerdict = classifyFromText({ filename: c.image });
        const vision = await classifyFromVision({ apiKey: key, imageBase64: base64, mediaType });
        const verdict = combineClassification(textVerdict, vision);
        const clsGate = classificationGate(verdict);

        const classOk = verdict.sheet_type === c.expect.sheet_type;

        // 2. Extract — ONLY for supported, gate-passed sheets (mirrors route).
        let ocrConfidence = 0;
        let dimsFound = 0;
        let requiredDimsPass: boolean | null = null;
        let scaleParsed = false;
        let gates: string[] = [`classification:${clsGate.pass ? "pass" : "FAIL"}`];
        let finalStatus = clsGate.pass ? "classified" : "needs_review";

        const runExtract = isSupportedSheetType(verdict.sheet_type) && clsGate.pass;
        if (runExtract) {
          const { extracted, enforcement } = await extractSheet({
            apiKey: key,
            imageBase64: base64,
            mediaType,
            sheetType: verdict.sheet_type,
            filename: c.image,
          });
          ocrConfidence = extracted.ocr_confidence;
          scaleParsed = extracted.scale_confidence > 0;
          const expectedDims = c.expect.expected_dims_m ?? [];
          const tol = c.expect.dim_tolerance_pct ?? 5;
          dimsFound = expectedDims.filter((d) =>
            extracted.dimensions.some((x) => within(x.value_m, d, tol)),
          ).length;
          requiredDimsPass = !enforcement.results.find(
            (r) => r.gate === "required_dims_present",
          )?.pass
            ? false
            : true;
          gates = enforcement.results.map(
            (r) => `${r.gate}:${r.pass ? "pass" : r.hard ? "FAIL(hard)" : "fail"}`,
          );
          finalStatus = enforcement.blocked
            ? "blocked"
            : enforcement.review_required
              ? "needs_review"
              : "extracted";
        }

        const scaleExpected =
          c.expect.scale_should_parse === undefined ? null : c.expect.scale_should_parse;

        results.push({
          id: c.id,
          expectedType: c.expect.sheet_type,
          predictedType: verdict.sheet_type,
          classOk,
          confidence: verdict.confidence,
          scaleExpected,
          scaleParsed,
          scaleOk: scaleExpected === null ? null : scaleParsed === scaleExpected,
          ocrConfidence,
          dimsExpected: (c.expect.expected_dims_m ?? []).length,
          dimsFound,
          requiredDimsExpected:
            c.expect.expect_required_dims_present === undefined
              ? null
              : c.expect.expect_required_dims_present,
          requiredDimsPass,
          gates,
          finalStatus,
        });

        // These expectations must be hand-verified against each fixture.
        // A failed expectation blocks release; it is never just a log line.
        expect(verdict.sheet_type).toBe(c.expect.sheet_type);
        if (c.expect.scale_should_parse !== undefined) expect(scaleParsed).toBe(c.expect.scale_should_parse);
        if (c.expect.expect_required_dims_present !== undefined) expect(requiredDimsPass).toBe(c.expect.expect_required_dims_present);
        expect(dimsFound).toBe((c.expect.expected_dims_m ?? []).length);
      },
      120_000,
    );
  }

  afterAll(() => {
    if (results.length === 0) return;
    const n = results.length;
    const pct = (x: number, d: number) => (d === 0 ? "—" : `${Math.round((x / d) * 100)}%`);

    const classRight = results.filter((r) => r.classOk).length;
    const scaleEval = results.filter((r) => r.scaleOk !== null);
    const scaleRight = scaleEval.filter((r) => r.scaleOk).length;
    const reqEval = results.filter((r) => r.requiredDimsExpected !== null && r.requiredDimsPass !== null);
    const reqRight = reqEval.filter((r) => r.requiredDimsPass === r.requiredDimsExpected).length;
    const extracted = results.filter((r) => r.finalStatus !== "classified" && r.finalStatus !== "needs_review" || r.ocrConfidence > 0);
    const avgOcr = extracted.length
      ? extracted.reduce((s, r) => s + r.ocrConfidence, 0) / extracted.length
      : 0;
    const dimsExp = results.reduce((s, r) => s + r.dimsExpected, 0);
    const dimsFound = results.reduce((s, r) => s + r.dimsFound, 0);

    console.log(
      [
        "",
        "── PLAN-READER EVAL ──────────────────────────────────────────────",
        ...results.map(
          (r) =>
            `  ${r.classOk ? "✅" : "❌"} ${r.id.padEnd(22)} ` +
            `pred=${r.predictedType}(${r.confidence.toFixed(2)}) ` +
            `scale=${r.scaleParsed ? "y" : "n"} ocr=${r.ocrConfidence.toFixed(2)} ` +
            `dims=${r.dimsFound}/${r.dimsExpected} → ${r.finalStatus}`,
        ),
        "  gate detail:",
        ...results.map((r) => `    ${r.id.padEnd(22)} ${r.gates.join(" ")}`),
        "──────────────────────────────────────────────────────────────────",
        `  classification accuracy:   ${classRight}/${n} (${pct(classRight, n)})`,
        `  scale-extraction success:  ${scaleRight}/${scaleEval.length} (${pct(scaleRight, scaleEval.length)})`,
        `  required-dims gate match:  ${reqRight}/${reqEval.length} (${pct(reqRight, reqEval.length)})`,
        `  expected dims found:       ${dimsFound}/${dimsExp} (${pct(dimsFound, dimsExp)})`,
        `  avg OCR confidence:        ${avgOcr.toFixed(2)} (over ${extracted.length} extracted sheets)`,
        "──────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  });
});

// Re-export for ad-hoc tooling / type sharing.
export type { PlanReaderCase };
