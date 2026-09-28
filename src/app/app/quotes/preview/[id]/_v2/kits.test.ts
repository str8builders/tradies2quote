// "Add a kit" on the job page: a saved kit's lines become quote lines the way
// the "Add a line" sheet makes them, so totals, the $0 check, the send gate
// and saving treat them like lines typed by hand.
import { describe, expect, it } from "vitest";
import { computeQuoteTotals } from "@/lib/quote-defaults";
import type { QuoteLineItem } from "@/lib/quote-types";
import { assessQuoteTakeoffSafety, isUnpricedLine } from "@/lib/quote-validation";
import { kitAddedMessage, kitLineCount, kitLines, type JobKit } from "./kits";
import { blankLineForm, newLineFromForm, withLines } from "./lines";

const CYLINDER_SWAP: JobKit = {
  id: "kit-1",
  name: "Hot-water cylinder swap",
  total: 1847.5,
  items: [
    { type: "labour", description: "Swap the cylinder", quantity: 5, unit: "hour", unit_price: 95 },
    { type: "material", description: "180 L mains cylinder", quantity: 1, unit: null, unit_price: 1250 },
    { type: "material", description: "Copper pipe 15 mm", quantity: 3, unit: "m", unit_price: 17.5, library_id: "lib-copper" },
    { type: "other", description: "Old cylinder disposal", quantity: 1, unit: "each", unit_price: 70 },
  ],
};

describe("kitLines", () => {
  it("carries each line's saved name, type, quantity, unit and price, in order", () => {
    const lines = kitLines(CYLINDER_SWAP);
    expect(lines.map((l) => [l.type, l.description, l.quantity, l.unit, l.unit_price, l.line_total])).toEqual([
      ["labour", "Swap the cylinder", 5, "hour", 95, 475],
      ["material", "180 L mains cylinder", 1, "each", 1250, 1250],
      ["material", "Copper pipe 15 mm", 3, "m", 17.5, 52.5],
      ["other", "Old cylinder disposal", 1, "each", 70, 70],
    ]);
  });

  it("builds each line exactly as the Add a line sheet would", () => {
    const [labour] = kitLines(CYLINDER_SWAP);
    const typed = newLineFromForm("labour", {
      ...blankLineForm("labour"),
      description: "Swap the cylinder",
      quantity: "5",
      unit: "hour",
      price: "95",
    });
    expect(labour).toEqual(typed);
    // The tradie's own numbers: never an AI estimate waiting for a check.
    expect(labour).toMatchObject({ quantity_source: "user", quantity_confirmed: true, is_missing_price: false });
  });

  it("keeps the library link when the kit has one", () => {
    const copper = kitLines(CYLINDER_SWAP)[2];
    expect(copper).toMatchObject({ library_id: "lib-copper", material_id: "lib-copper" });
    expect(kitLines(CYLINDER_SWAP)[1].library_id ?? null).toBeNull();
    const fromMaterialId = kitLines({ items: [{ ...CYLINDER_SWAP.items[1], material_id: "mat-9" }] })[0];
    expect(fromMaterialId).toMatchObject({ library_id: "mat-9", material_id: "mat-9" });
  });

  it("a line with no price comes in asking for one, never a hidden $0", () => {
    const [line] = kitLines({ items: [{ type: "material", description: "Tempering valve", quantity: 1, unit: "each", unit_price: 0 }] });
    expect(line.unit_price).toBe(0);
    expect(line.is_missing_price).toBe(true);
    expect(isUnpricedLine(line)).toBe(true);
  });

  it("skips nameless lines and never brings in a negative or broken number", () => {
    const lines = kitLines({
      items: [
        { type: "material", description: "   ", quantity: 2, unit: "each", unit_price: 5 },
        { type: "material", description: "Solder", quantity: -2, unit: "roll", unit_price: Number.NaN },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ description: "Solder", quantity: 0, unit_price: 0, line_total: 0 });
  });

  it("the quote adds them up with the shared totals and the gate lets them through", () => {
    const base: QuoteLineItem[] = [{ type: "labour", description: "Site visit", quantity: 1, unit: "hour", unit_price: 95, line_total: 95 }];
    const lines = [...base, ...kitLines(CYLINDER_SWAP)];
    const data = withLines(
      {
        client: { name: "Sam", address: null, email: "sam@example.com", phone: null },
        job_summary: "Cylinder",
        line_items: base,
        ...computeQuoteTotals(base, 0, 15),
        markup_pct: 0,
        currency: "NZD",
        tax_label: "GST",
        tax_rate: 15,
        terms: "",
        notes: [],
      },
      lines,
    );
    expect(data.total).toBe(computeQuoteTotals(lines, 0, 15).total);
    expect(assessQuoteTakeoffSafety(data)).toMatchObject({ can_send: true, requires_acknowledgement: false });
  });
});

describe("kit words", () => {
  it("counts the lines a kit will add", () => {
    expect(kitLineCount(CYLINDER_SWAP)).toBe("4 lines");
    expect(kitLineCount({ items: [CYLINDER_SWAP.items[0]] })).toBe("1 line");
    expect(kitLineCount({ items: [] })).toBe("No lines yet");
  });

  it("says what went on the quote", () => {
    expect(kitAddedMessage(CYLINDER_SWAP, 4)).toBe("Added Hot-water cylinder swap: 4 lines");
    expect(kitAddedMessage({ name: " " }, 1)).toBe("Added the kit: 1 line");
  });
});
