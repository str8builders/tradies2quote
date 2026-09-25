import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { csvGstStatement } from "../materials";
import { gstBasisNote } from "../materials/scanReview";
import { ScanGstNote } from "@/app/app/materials/import-quote/_components/ScanGstNote";

// Audit item 10 — the materials import screens said "GST" to every tradie.
// A UK tradie (VAT, 20 %) or a US tradie (Tax) now sees their own label.

describe("CSV import statement uses the tradie's tax label", () => {
  it("UK: 'Prices include VAT … saved ex-VAT (20% VAT)' (was '… GST …')", () => {
    expect(csvGstStatement(true, 0.2, "VAT")).toBe(
      "Prices include VAT — each is divided by 1.20 and saved ex-VAT (20% VAT).",
    );
    expect(csvGstStatement(false, 0.2, "VAT")).toBe(
      "Prices are treated as excluding VAT and saved as written. Tick the box above if the file's prices include VAT.",
    );
  });

  it("a 0% rate says nothing is taken off (was 'divided by 1.00')", () => {
    expect(csvGstStatement(true, 0, "Tax")).toBe(
      "Prices include Tax — at 0% there's nothing to take off, so they're saved as written.",
    );
  });

  it("NZ wording is unchanged", () => {
    expect(csvGstStatement(true, 0.15, "GST")).toBe(
      "Prices include GST — each is divided by 1.15 and saved ex-GST (15% GST).",
    );
  });
});

describe("supplier-quote scan note uses the tradie's tax label", () => {
  it("UK: names VAT (was GST)", () => {
    expect(gstBasisNote(null, false, "VAT")).toBe(
      "The scan couldn’t tell whether these prices include VAT, so they’re treated as excluding VAT. Tick “Prices include VAT” if the quote shows VAT-inclusive prices.",
    );
    expect(gstBasisNote(null, true, "VAT")).toMatch(/include VAT.*converted to ex-VAT/);
  });

  it("renders with the label", () => {
    const html = renderToStaticMarkup(
      createElement(ScanGstNote, { detected: null, inclusive: false, taxLabel: "VAT" }),
    );
    expect(html).toContain("include VAT");
    expect(html).not.toContain("GST");
  });
});
