/**
 * Supplier-quote reader eval — RUNS REAL CLAUDE CALLS (one per fixture file).
 *
 * Gated behind RUN_SUPPLIER_EVAL so it never runs during `npm test` or CI (it
 * costs money and is non-deterministic). Run it deliberately, on a machine
 * with the model key:
 *
 *   npm run eval:supplier
 *
 * It reads ANTHROPIC_API_KEY from the shell env or `.env.local`, and sends
 * each synthetic supplier document (src/eval/fixtures/supplier-quotes/, made
 * by scripts/make-supplier-fixtures.mjs) through the SAME code the
 * /api/materials/extract-quote route runs:
 *
 *   prepareSupplierUpload (photo re-encode / PDF check)
 *     → readSupplierDocument (the production prompt, model, retry and time budget)
 *     → mergeExtractions (a quote over several photos)
 *     → validateSupplierQuote (the reconciliation "Create quote" depends on)
 *
 * and asserts, against the exact answers in ./supplier-quote-cases.ts, every
 * line's name, quantity, unit and NET unit price, the printed line totals,
 * the GST basis and the printed totals (subtotal, discount, freight, GST,
 * total) — and that the quote reconciles.
 */
import { afterAll, describe, expect, it } from "vitest";
import type { ScanPage } from "@/lib/materials/mergeExtractions";
import { loadEnvKey } from "./eval-env";
import { SUPPLIER_QUOTE_CASES } from "./supplier-quote-cases";
import { readSupplierCase, supplierCaseDifferences } from "./supplier-quote-scoring";

const ENABLED = process.env.RUN_SUPPLIER_EVAL === "1";

type CaseResult = { id: string; ok: boolean; notes: string[] };
const results: CaseResult[] = [];

describe.skipIf(!ENABLED)("supplier-quote reader eval", () => {
  const apiKey = loadEnvKey("ANTHROPIC_API_KEY");

  it("has an API key", () => {
    expect(apiKey, "Set ANTHROPIC_API_KEY in the env or .env.local to run the supplier eval.").toBeTruthy();
  });

  for (const c of SUPPLIER_QUOTE_CASES) {
    it.skipIf(!apiKey)(
      `${c.id} — ${c.title}`,
      async () => {
        let read: ScanPage;
        try {
          read = await readSupplierCase(apiKey as string, c);
        } catch (e) {
          results.push({ id: c.id, ok: false, notes: [String(e instanceof Error ? e.message : e)] });
          throw e;
        }
        const diffs = supplierCaseDifferences(c, read);
        results.push({ id: c.id, ok: diffs.length === 0, notes: diffs });
        expect(diffs, diffs.join("\n")).toEqual([]);
      },
      240_000,
    );
  }

  afterAll(() => {
    if (results.length === 0) return;
    const passed = results.filter((r) => r.ok).length;
    console.log(
      [
        "",
        "── SUPPLIER-QUOTE EVAL ──────────────────────────────",
        ...results.map((r) => `  ${r.ok ? "PASS" : "FAIL"} ${r.id}${r.ok ? "" : `\n       ${r.notes.join("\n       ")}`}`),
        "─────────────────────────────────────────────────────",
        `  ${passed}/${results.length} documents read exactly right`,
        "",
      ].join("\n"),
    );
  });
});
