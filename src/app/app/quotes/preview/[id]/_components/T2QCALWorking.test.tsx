import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QuoteLineItem } from "@/lib/quote-types";
import { applyLineEdit } from "@/lib/t2qcalLineEdit";
import { hasT2QCALWorking, T2QCALWorking } from "./T2QCALWorking";

const line: QuoteLineItem = {
  type: "material", description: "Post-hole concrete", quantity: 0.237504404611388,
  unit: "m³", unit_price: 400, line_total: 95, quantity_source: "calculator",
  t2qcal_calculator_snapshot: { toolSlug: "post-holes", toolName: "Post holes", inputs: [
    { key: "postShape", label: "Post deduction", value: 2, unit: "", displayLabel: "Round post" },
    { key: "postDiameter", label: "Post diameter", value: 100, unit: "mm" },
  ] },
  t2qcal_assumptions: ["Entered embedment only"],
  t2qcal_checks: ["The post fits inside the hole"],
};

function render(value: QuoteLineItem) { return renderToStaticMarkup(createElement(T2QCALWorking, { line: value })); }

describe("private native calculator evidence", () => {
  it("shows recorded inputs, named choices, assumptions and checks", () => {
    const html = render(line);
    for (const value of ["Post holes", "Round post", "100 mm", "Entered embedment only", "The post fits inside the hole"]) expect(html).toContain(value);
  });
  it("keeps old records readable without the optional choice label", () => {
    const old = structuredClone(line);
    delete old.t2qcal_calculator_snapshot!.inputs[0].displayLabel;
    expect(render(old)).toContain(">2<");
  });
  it("does not retain calculator evidence after an edited quantity", () => {
    const edited = applyLineEdit(line, { quantity: 1 });
    expect(render(edited)).not.toContain("Round post");
    expect(render(edited)).toContain("edited and confirmed");
  });
  it("does not create empty working panels for ordinary lines", () => {
    expect(hasT2QCALWorking()).toBe(false);
    expect(render({ type: "material", description: "Other", quantity: 1, unit: "each", unit_price: 1, line_total: 1 })).toBe("");
  });
  it("escapes input labels and tolerates malformed recovered input rows", () => {
    const recovered = structuredClone(line);
    recovered.t2qcal_calculator_snapshot!.inputs = [null, { key: "safe", label: "<script>alert(1)</script>", value: 3, unit: "mm" }] as unknown as NonNullable<QuoteLineItem["t2qcal_calculator_snapshot"]>["inputs"];
    const html = render(recovered);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
