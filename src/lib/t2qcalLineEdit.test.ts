import { describe, expect, it } from "vitest";
import type { QuoteLineItem } from "./quote-types";
import { applyLineEdit } from "./t2qcalLineEdit";

const line: QuoteLineItem = {
  type: "material", description: "Decking", quantity: 20, unit: "m",
  unit_price: 8, line_total: 160, quantity_source: "calculator",
  quantity_confirmed: true, is_calculated_takeoff: true,
  formula: "boards × run × allowance", library_id: "material-1",
  material_id: "material-1", price_match_key: "material-1|basis",
  price_source: "user_library", price_confidence: "high",
  t2qcal_source_key: "deck-boards.lineal-order",
  t2qcal_basis_fingerprint: "v1|deck-board|l0=140",
  t2qcal_checks: ["finite"],
  t2qcal_calculator_snapshot: { toolSlug: "deck-boards", toolName: "Deck",
    inputs: [{ key: "width", label: "Width", value: 4, unit: "m" }] },
};

describe("applyLineEdit", () => {
  it("turns an edited calculated quantity into user evidence and retires old working", () => {
    const next = applyLineEdit(line, { quantity: 21 });
    expect(next.quantity_source).toBe("user");
    expect(next.quantity_confirmed).toBe(true);
    expect(next.is_calculated_takeoff).toBe(false);
    expect(next.formula).toBeUndefined();
    expect(next.t2qcal_calculator_snapshot).toBeUndefined();
  });

  it("clears material price identity and package basis when the selling unit changes", () => {
    const next = applyLineEdit(line, { unit: "ft" });
    expect(next.is_calculated_takeoff).toBe(false);
    expect(next.formula).toBeUndefined();
    expect(next.t2qcal_calculator_snapshot).toBeUndefined();
    expect(next.unit_price).toBe(0);
    expect(next.library_id).toBeNull();
    expect(next.price_match_key).toBeUndefined();
    expect(next.t2qcal_basis_fingerprint).toBeUndefined();
  });

  it("retires the material basis and calculation proof when its description changes", () => {
    const next = applyLineEdit(line, { description: "Different decking profile" });
    expect(next.t2qcal_basis_fingerprint).toBeUndefined();
    expect(next.quantity_source).toBe("user");
    expect(next.formula).toBeUndefined();
  });

  it("does not retire evidence for an unrelated price edit", () => {
    const next = applyLineEdit(line, { unit_price: 9 });
    expect(next.quantity_source).toBe("calculator");
    expect(next.formula).toBe(line.formula);
  });

  // ─── Audit 2026-09-24, item 2 — a rename must never wipe a price ───────
  const labour: QuoteLineItem = {
    type: "labour", description: "Labour", quantity: 10, unit: "hour",
    unit_price: 75, line_total: 750, is_missing_price: false,
  };

  it("renaming a labour line keeps its price (10 h × $75 stays $75)", () => {
    const next = applyLineEdit(labour, { description: "Labour — frame and line walls" });
    expect(next.unit_price).toBe(75);
    expect(next.is_missing_price).toBe(false);
    expect(next.price_source).toBeUndefined();
  });

  it("renaming a manual material keeps its price and library link", () => {
    const manual: QuoteLineItem = {
      type: "material", description: "Pine 90x45", quantity: 12, unit: "m",
      unit_price: 6.5, line_total: 78, library_id: "lib-1",
      price_source: "user_library", price_confidence: "high",
    };
    const next = applyLineEdit(manual, { description: "Pine 90x45 H1.2" });
    expect(next.unit_price).toBe(6.5);
    expect(next.library_id).toBe("lib-1");
  });

  it("changing the UNIT resets the price (a per-hour rate means nothing per day)", () => {
    const next = applyLineEdit(labour, { unit: "day" });
    expect(next.unit_price).toBe(0);
    expect(next.is_missing_price).toBe(true);
  });

  it("renaming a CALCULATOR-sourced line still resets its price", () => {
    const next = applyLineEdit(line, { description: "Different decking profile" });
    expect(next.unit_price).toBe(0);
    expect(next.is_missing_price).toBe(true);
    expect(next.library_id).toBeNull();
  });

  it("typing a unit price clears is_missing_price (not only Suggest Price)", () => {
    const pending: QuoteLineItem = {
      type: "other", description: "Skip bin", quantity: 1, unit: "each",
      unit_price: 0, line_total: 0, is_missing_price: true, price_source: "missing_price",
    };
    const next = applyLineEdit(pending, { unit_price: 450 });
    expect(next.unit_price).toBe(450);
    expect(next.is_missing_price).toBe(false);
    expect(next.price_source).toBeUndefined();
  });

  it("typing $0 marks the line missing again", () => {
    const next = applyLineEdit(labour, { unit_price: 0 });
    expect(next.is_missing_price).toBe(true);
  });

  it("an explicit is_missing_price in the patch (Suggest Price) is respected", () => {
    const pending: QuoteLineItem = { ...labour, unit_price: 0, is_missing_price: true };
    const next = applyLineEdit(pending, { unit_price: 80, is_missing_price: false });
    expect(next.unit_price).toBe(80);
    expect(next.is_missing_price).toBe(false);
  });
});

