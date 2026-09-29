// End-to-end run of the plan-set reader on real plan PDFs (local only; the
// PDFs are never committed). Reads every page, runs the set-level steps
// (register, borrowed scales, model), prints the model and the materials,
// and checks the expectations given for that set.
//
//   PLANSET_E2E="/abs/a.pdf;/abs/b.pdf" npx vitest run src/eval/planset/planset-e2e.test.ts --reporter=verbose
//   PLANSET_EXPECT=/abs/expectations.json   (optional, local file — see README)
//
// The AI reading is skipped unless ANTHROPIC_API_KEY is set.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { openPlanPdf } from "@/lib/planset/pdf/read";
import { readSheetFacts } from "@/lib/planset/sheetFacts";
import { finishPlanSet } from "@/lib/planset/finish";
import { applyAnswers } from "@/lib/planset/model/answers";
import { planTakeoff } from "@/lib/planset/takeoff/fromModel";

const files = (process.env.PLANSET_E2E ?? "").split(";").filter(Boolean);
type Expect = { floorAreaM2?: number; externalWallM?: number; windows?: string[]; doors?: number; lintels?: number; minProven?: number };
const expectations: Record<string, Expect> = process.env.PLANSET_EXPECT ? JSON.parse(fs.readFileSync(process.env.PLANSET_EXPECT, "utf8")) : {};

describe.skipIf(!files.length)("plan-set end to end", () => {
  for (const file of files) {
    it(path.basename(file), { timeout: 900_000 }, async () => {
      const bytes = new Uint8Array(fs.readFileSync(file));
      const pdf = await openPlanPdf(bytes);
      const facts = [];
      const t0 = Date.now();
      for (let n = 1; n <= pdf.pageCount; n++) facts.push(readSheetFacts(await pdf.readPage(n)));
      await pdf.close();
      const readMs = Date.now() - t0;
      const result = await finishPlanSet({ setId: "local", userId: "local", facts, pdf: bytes, progress: async () => {} });
      const model = applyAnswers(result.model, {});
      const takeoff = planTakeoff(model);
      const lines = [
        `══ ${path.basename(file)} — ${facts.length} pages read in ${(readMs / 1000).toFixed(1)} s`,
        `   register: ${result.register.entries.length} entries, index ${result.register.index.length}, missing ${result.register.missing.map((m) => m.sheetId).join(",") || "none"}, buildings ${result.register.buildings.join(",") || "one"}, revisions ${result.register.revisions.join(",")}`,
        `   kinds: ${Object.entries(facts.reduce<Record<string, number>>((a, f) => ((a[f.kind] = (a[f.kind] ?? 0) + 1), a), {})).map(([k, v]) => `${k}×${v}`).join(" ")}`,
        `   project: ${model.project.kind}; approved ${model.project.approved} ${model.project.consentNumber ?? ""}; sheets proven ${model.sheets.provenScale}/${model.sheets.drawings}`,
        model.walls
          ? `   walls (p${model.walls.page}, 1:${model.walls.ratio} ${model.walls.scaleBasis}): outside ${(model.walls.externalLengthMm.value / 1000).toFixed(2)} m, inside ${(model.walls.internalLengthMm.value / 1000).toFixed(2)} m, area ${model.walls.enclosedAreaM2?.value} m² (${model.walls.enclosedAreaM2?.status}) vs printed ${model.walls.printedAreaM2?.value ?? "—"}`
          : "   walls: none",
        `   openings: ${model.openings.map((o) => `${o.mark} ${o.widthMm}×${o.heightMm}${o.wall ? (o.sizeCheck === "ok" ? "✓" : o.sizeCheck === "differs" ? "≠" : "?") : "∅"}`).join(" ")}`,
        `   lintels: ${model.lintels.map((l) => `${l.mark}=${l.spec}`).join(" ")}`,
        `   roof: area ${model.roof.areaM2?.value ?? "—"} pitch ${model.roof.pitchDeg?.value ?? "—"}; other schedules: ${Object.entries(model.schedules).map(([k, v]) => `${k}×${v.length}`).join(" ") || "none"}`,
        `   AI: ${JSON.stringify(result.aiUsage)} kept ${model.ai.itemsKept} dropped ${model.ai.itemsDropped}; stud ${model.heights.studMm?.value ?? "—"} (${model.heights.studMm?.status ?? ""}), ceiling ${model.heights.ceilingMm?.value ?? "—"}, pitch ${model.roof.pitchDeg?.value ?? "—"}, roofing ${model.roof.material?.value ?? "—"}`,
        `   zones: wind ${model.zones.wind?.value ?? "—"}, EQ ${model.zones.earthquake?.value ?? "—"}, exposure ${model.zones.exposure?.value ?? "—"}; consent: ${model.consent.inspections.length} inspections, ${model.consent.documents.length} documents, ${model.consent.conditions.length} conditions; by others: ${model.byOthers.map((f) => f.value).join("; ") || "—"}`,
        `   specs: ${Object.entries(model.specs).map(([k, v]) => `${k}=${v.map((f) => f.value).join(" / ")}`).join(" | ").slice(0, 1500)}`,
        `   flags (${model.flags.length}): ${model.flags.map((f) => `[${f.level}] ${f.message}`).join(" | ").slice(0, 1500)}`,
        `   takeoff: ${takeoff.blockers.length ? `BLOCKED: ${takeoff.blockers.map((b) => b.message).join(" | ")}` : takeoff.lines.map((l) => `${l.name}: ${l.quantity} ${l.unit}`).join("; ")}`,
      ];
      console.log(lines.join("\n"));
      const exp = expectations[path.basename(file)];
      if (exp) {
        if (exp.floorAreaM2) expect(Math.abs((model.walls?.enclosedAreaM2?.value ?? 0) - exp.floorAreaM2) / exp.floorAreaM2).toBeLessThan(0.015);
        if (exp.externalWallM) expect(Math.abs((model.walls?.externalLengthMm.value ?? 0) / 1000 - exp.externalWallM) / exp.externalWallM).toBeLessThan(0.03);
        if (exp.windows) expect(model.openings.filter((o) => o.kind === "window").map((o) => o.mark).sort()).toEqual([...exp.windows].sort());
        if (exp.doors !== undefined) expect(model.openings.filter((o) => o.kind === "door")).toHaveLength(exp.doors);
        if (exp.lintels !== undefined) expect(model.lintels).toHaveLength(exp.lintels);
        if (exp.minProven !== undefined) expect(model.sheets.provenScale).toBeGreaterThanOrEqual(exp.minProven);
      }
    });
  }
});
