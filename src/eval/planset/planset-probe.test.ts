// Local probe for the plan-set reader on real plan PDFs (never committed
// data). Prints what each module reads off the chosen pages:
//
//   PLANSET_PROBE="/abs/path/plans.pdf:12,13,16" npx vitest run src/eval/planset/planset-probe.test.ts
//
// Skipped unless PLANSET_PROBE is set.
import { describe, it } from "vitest";
import fs from "node:fs";
import { openPlanPdf } from "@/lib/planset/pdf/read";
import { buildChains, checkChains, proveScales, readDimensions } from "@/lib/planset/measure/dimensions";
import { readWalls } from "@/lib/planset/measure/walls";

const probe = process.env.PLANSET_PROBE;

describe.skipIf(!probe)("plan-set probe", () => {
  it("reads the chosen pages", { timeout: 600_000 }, async () => {
    const [file, pageList] = probe!.split(/:(?=[\d,]+$)/);
    const pdf = await openPlanPdf(new Uint8Array(fs.readFileSync(file)));
    const pages = pageList ? pageList.split(",").map(Number) : Array.from({ length: pdf.pageCount }, (_, i) => i + 1);
    for (const n of pages) {
      const t0 = Date.now();
      const sheet = await pdf.readPage(n);
      const dims = readDimensions(sheet);
      const byId = (id: number) => sheet.text[id];
      const proofs = proveScales(dims, byId);
      const chains = buildChains(dims);
      const checks = checkChains(chains, dims);
      const lines: string[] = [
        `── page ${n}: ${sheet.widthMm}×${sheet.heightMm} rot ${sheet.rotate} | text ${sheet.text.length} segs ${sheet.segs.length} fills ${sheet.fills.length} | ${Date.now() - t0} ms`,
        `   dimensions ${dims.length}, with a line ${dims.filter((d) => d.line).length}; scale proofs: ${proofs.map((p) => `1:${p.ratio} ×${p.count} (${Math.round(p.share * 100)}%)`).join(", ") || "none"}`,
        `   chains ${chains.length}; overall checks ${checks.length}: ${checks.map((c) => `${c.chain.sumMm}${c.ok ? "=" : "≠"}${c.overall.mm}`).join(" ")}`,
      ];
      const proof = proofs[0];
      if (proof && proof.ratio >= 50) {
        const walls = readWalls(sheet.fills, { ratio: proof.ratio });
        const colours = [...new Set(walls.pieces.map((p) => p.colour))];
        lines.push(
          `   walls: pieces ${walls.pieces.length} (${colours.join(" ")}), lines ${walls.lines.length}; external ${(walls.externalLengthMm / 1000).toFixed(2)} m, internal ${(walls.internalLengthMm / 1000).toFixed(2)} m; enclosed ${walls.enclosedAreaM2} m²; openings ${walls.lines.reduce((s, l) => s + l.gaps.length, 0)}`,
        );
        const dump = process.env.PLANSET_DUMP;
        if (dump) {
          const rects: Array<{ box: number[]; c: string; w: number; fill?: boolean }> = [];
          for (const l of walls.lines) {
            const half = l.thicknessMm / proof.ratio / 2;
            const box = l.orientation === "h" ? [l.from, l.at - half, l.to, l.at + half] : [l.at - half, l.from, l.at + half, l.to];
            rects.push({ box, c: l.external ? "#ff0000" : "#0060ff", w: 0.25, fill: true });
            for (const g of l.gaps) {
              const gb = l.orientation === "h" ? [g.from, l.at - half - 0.6, g.to, l.at + half + 0.6] : [l.at - half - 0.6, g.from, l.at + half + 0.6, g.to];
              rects.push({ box: gb, c: "#00a000", w: 0.3 });
            }
          }
          fs.writeFileSync(`${dump}/p${n}-walls.json`, JSON.stringify({ rects }));
          fs.writeFileSync(
            `${dump}/p${n}-lines.txt`,
            walls.lines
              .map((l) => `${l.id} ${l.orientation} at=${l.at.toFixed(1)} ${l.from.toFixed(1)}→${l.to.toFixed(1)} t=${l.thicknessMm} ${l.colour} len=${l.lengthMm} ext=${l.external} gaps=${l.gaps.map((g) => g.widthMm).join("/")}`)
              .join("\n"),
          );
        }
      }
      console.log(lines.join("\n"));
    }
    await pdf.close();
  });
});
