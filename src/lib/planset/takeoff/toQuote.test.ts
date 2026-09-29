import { describe, expect, it } from "vitest";
import { lineSections } from "@/lib/quote-sections";
import type { LibraryMaterial } from "@/lib/quote-types";
import type { PlanTakeoff, PlanTakeoffLine } from "./fromModel";
import { planQuoteLines, planSetQuoteData } from "./toQuote";

const line = (id: string, group: PlanTakeoffLine["group"], name: string, quantity: number, unit: string): PlanTakeoffLine => ({
  id,
  group,
  name,
  quantity,
  unit,
  formula: `${name}: worked out`,
  status: "ok",
  evidence: [],
});

const takeoff: PlanTakeoff = {
  lines: [
    line("gib", "Linings", "10mm GIB Board", 120, "sheets"),
    line("studs", "Framing", "90x45 SG8 Studs", 412, "each"),
    line("w01", "Joinery", "Window W01 — 1200 × 1000", 1, "each"),
    line("plates", "Framing", "90x45 SG8 Plates", 60, "lengths"),
    line("slab", "Slab", "Concrete for the floor slab", 20.3, "m³"),
  ],
  blockers: [],
  assumptions: ["Studs at 600 centres (the plans didn't say)."],
  byOthers: ["Trusses by the truss supplier"],
};

const library: LibraryMaterial[] = [
  { id: "lib-1", name: "90x45 SG8 Studs", unit: "each", default_unit_price: 9.5, supplier: null, supplier_url: null, notes: null, usage_count: 3, is_ai_estimated: false, last_used_at: null },
];

describe("planQuoteLines", () => {
  it("gives every line its trade as the section, in build order", () => {
    const lines = planQuoteLines(takeoff, []);
    expect(lines.map((l) => [l.section, l.description])).toEqual([
      ["Slab", "Concrete for the floor slab"],
      ["Framing", "90x45 SG8 Studs"],
      ["Framing", "90x45 SG8 Plates"],
      ["Joinery", "Window W01 — 1200 × 1000"],
      ["Linings", "10mm GIB Board"],
    ]);
    expect(lines.every((l) => l.type === "material" && l.is_calculated_takeoff)).toBe(true);
  });

  it("prices only from the tradie's own list; everything else waits for a price", () => {
    const lines = planQuoteLines(takeoff, library);
    const studs = lines.find((l) => l.description === "90x45 SG8 Studs")!;
    expect(studs).toMatchObject({ unit_price: 9.5, line_total: 3914, library_id: "lib-1", is_missing_price: false });
    expect(lines.filter((l) => l.is_missing_price).map((l) => l.line_total)).toEqual([0, 0, 0, 0]);
  });
});

describe("planSetQuoteData", () => {
  it("makes a quote that reads as a breakdown by trade, with the assumptions in its notes", () => {
    const q = planSetQuoteData(takeoff, library, { currency: "NZD", taxLabel: "GST", taxRate: 15, markupPct: 0 }, "Materials from the plans (house.pdf)");
    const sections = lineSections(q.line_items, (l) => l);
    expect(sections?.map((s) => [s.title, s.subtotal])).toEqual([
      ["Slab", 0],
      ["Framing", 3914],
      ["Joinery", 0],
      ["Linings", 0],
    ]);
    expect(q.materials_subtotal).toBe(3914);
    expect(q.notes).toEqual(["Assumed: Studs at 600 centres (the plans didn't say).", "Not included (by others on the plans): Trusses by the truss supplier."]);
  });
});
