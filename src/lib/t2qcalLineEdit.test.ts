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
    expect(next.unit_price).toBe(0);
    expect(next.library_id).toBeNull();
    expect(next.price_match_key).toBeUndefined();
    expect(next.t2qcal_basis_fingerprint).toBeUndefined();
  });

  it("does not retire evidence for an unrelated price edit", () => {
    const next = applyLineEdit(line, { unit_price: 9 });
    expect(next.quantity_source).toBe("calculator");
    expect(next.formula).toBe(line.formula);
  });
});
