import { describe, expect, it } from "vitest";
import { mergeExtractions, photoSetLabel, type ScanPage } from "./mergeExtractions";

const item = (name: string, price: number | null = 10): ScanPage["items"][number] => ({
  name, unit: "each", price, sku: null, confidence: 0.9,
});
const page = (over: Partial<ScanPage> = {}): ScanPage => ({
  supplier: null, currency: null, gst_inclusive: null, items: [], notes: [], ...over,
});

describe("mergeExtractions", () => {
  it("returns a single page untouched", () => {
    const only = page({ supplier: "ITM", items: [item("Stud")] });
    expect(mergeExtractions([only])).toBe(only);
  });

  it("concatenates items in photo order and re-indexes row failures", () => {
    const merged = mergeExtractions([
      page({ items: [item("A"), item("B")], row_failures: [{ index: 1, reason: "smudged", raw_text: null }] }),
      page({ items: [item("C")], row_failures: [{ index: 0, reason: "cut off", raw_text: "C…" }] }),
    ]);
    expect(merged.items.map((i) => i.name)).toEqual(["A", "B", "C"]);
    expect(merged.row_failures).toEqual([
      { index: 1, reason: "smudged", raw_text: null },
      { index: 2, reason: "cut off", raw_text: "C…" },
    ]);
  });

  it("takes the first supplier, worst status and any-true gst flag", () => {
    const merged = mergeExtractions([
      page({ supplier: "", extraction_status: "ok", gst_inclusive: false }),
      page({ supplier: "PlaceMakers", extraction_status: "needs_review", gst_inclusive: true }),
      page({ supplier: "Mitre 10", extraction_status: "ok", gst_inclusive: null }),
    ]);
    expect(merged.supplier).toBe("PlaceMakers");
    expect(merged.extraction_status).toBe("needs_review");
    expect(merged.gst_inclusive).toBe(true);
  });

  it("keeps a lone total and sums totals reported by several pages", () => {
    expect(mergeExtractions([page({ total: 120.5 }), page()]).total).toBe(120.5);
    expect(mergeExtractions([page({ total: 10.1, gst: 1.01 }), page({ total: 20.2, gst: 2.02 })])).toMatchObject({ total: 30.3, gst: 3.03 });
    expect(mergeExtractions([page(), page()]).total).toBeNull();
  });

  it("prefixes notes and warnings by photo and de-duplicates", () => {
    const merged = mergeExtractions([
      page({ notes: ["Handwritten"], warnings: ["Blurry"] }),
      page({ notes: ["Handwritten"], warnings: [] }),
    ]);
    expect(merged.notes).toEqual(["Photo 1: Handwritten", "Photo 2: Handwritten"]);
    expect(merged.warnings).toEqual(["Photo 1: Blurry"]);
    expect(merged.attempts).toBe(2);
  });

  it("throws on an empty set", () => {
    expect(() => mergeExtractions([])).toThrow();
  });

  it("does not double the lines or totals when the same page is added twice", () => {
    const itm = (): ScanPage => page({
      supplier: "ITM",
      quote_number: "Q-1001",
      gst_inclusive: false,
      items: [
        { name: "90x45 H1.2", unit: "length", quantity: 10, price: 12.4, source_line_total: 124, sku: null, confidence: 0.9, raw_text: "10 @ 12.40" },
        { name: "GIB 13mm", unit: "sheet", quantity: 4, price: 22, source_line_total: 88, sku: null, confidence: 0.9, raw_text: "4 @ 22.00" },
      ],
      subtotal: 212,
      gst: 31.8,
      total: 243.8,
      extraction_status: "ok",
    });
    const merged = mergeExtractions([itm(), itm()]);
    expect(merged.items).toHaveLength(2);
    expect(merged.subtotal).toBe(212);
    expect(merged.total).toBe(243.8);
    expect(merged.attempts).toBe(1);
    expect((merged.warnings ?? []).join(" ")).toMatch(/photo 2.*same page as photo 1/i);
  });

  it("still merges two different pages that share a quote number", () => {
    const merged = mergeExtractions([
      page({ quote_number: "Q-1", items: [{ ...item("A"), source_line_total: 10, quantity: 1 }], subtotal: 10 }),
      page({ quote_number: "Q-1", items: [{ ...item("B"), source_line_total: 10, quantity: 1 }], subtotal: 10 }),
    ]);
    expect(merged.items.map((i) => i.name)).toEqual(["A", "B"]);
    expect(merged.subtotal).toBe(20);
  });

  it("carries each line's printed total (source_line_total) through the merge", () => {
    const merged = mergeExtractions([
      page({ items: [{ ...item("A"), source_line_total: 235.6 }] }),
      page({ items: [{ ...item("B"), source_line_total: 42 }] }),
    ]);
    expect(merged.items.map((i) => i.source_line_total)).toEqual([235.6, 42]);
  });

  it("warns when photos disagree about whether prices include GST", () => {
    const merged = mergeExtractions([
      page({ gst_inclusive: false, items: [item("A")] }),
      page({ gst_inclusive: true, items: [item("B")] }),
    ]);
    expect((merged.warnings ?? []).join(" ")).toMatch(/GST/);
  });
});

describe("photoSetLabel", () => {
  it("names one file and counts several", () => {
    expect(photoSetLabel([])).toBe("");
    expect(photoSetLabel([{ name: "IMG_1.jpg" }])).toBe("IMG_1.jpg");
    expect(photoSetLabel([{ name: "a" }, { name: "b" }, { name: "c" }])).toBe("3 photos");
  });
});
