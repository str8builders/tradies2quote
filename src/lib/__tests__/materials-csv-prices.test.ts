import { describe, expect, it } from "vitest";
import { csvGstStatement, parseMaterialsCsv, parseMaterialsCsvWithPreset } from "../materials";

// Price cells from real exports: decimal commas, POA, blanks and
// accounting-style negatives must never turn into a wrong library price.
const generic = (priceCell: string) =>
  parseMaterialsCsv(`name,unit,default_unit_price\nPine 90x45,length,${priceCell}`);
const mitre10 = (priceCell: string) =>
  parseMaterialsCsvWithPreset(`Description,Unit,Trade Price,Code\nPine 90x45,length,${priceCell},TIM9045`, "mitre10-trade");

describe("CSV import — price cells", () => {
  it("reads a decimal comma as a decimal: \"12,50\" is $12.50, not $1,250", () => {
    expect(generic('"12,50"').valid[0].default_unit_price).toBe(12.5);
    expect(mitre10('"12,50"').valid[0].default_unit_price).toBe(12.5);
    expect(generic('"12,5"').valid[0].default_unit_price).toBe(12.5);
    expect(generic('"1.234,50"').valid[0].default_unit_price).toBe(1234.5);
  });

  it("still reads thousands separators the NZ way", () => {
    expect(generic('"1,234.50"').valid[0].default_unit_price).toBe(1234.5);
    expect(generic('"1,250"').valid[0].default_unit_price).toBe(1250);
    expect(generic('"$1,234.50"').valid[0].default_unit_price).toBe(1234.5);
    expect(mitre10('"NZ$ 1,234.50"').valid[0].default_unit_price).toBe(1234.5);
  });

  it("imports a blank price as 'no price' (null), not a valid $0 row", () => {
    const g = generic("");
    expect(g.invalid).toEqual([]);
    expect(g.valid[0]).toMatchObject({ name: "Pine 90x45", default_unit_price: null });
    expect(mitre10("").valid[0].default_unit_price).toBeNull();
  });

  it("imports POA / TBC as 'no price' (null), never $0", () => {
    for (const cell of ["POA", "poa", "TBC", "N/A", "-", "Price on application"]) {
      expect(generic(cell).valid[0]?.default_unit_price, cell).toBeNull();
      expect(mitre10(cell).valid[0]?.default_unit_price, cell).toBeNull();
    }
  });

  it("rejects an accounting negative \"(5.00)\" instead of importing +$5", () => {
    for (const parse of [generic, mitre10]) {
      const r = parse('"(5.00)"');
      expect(r.valid).toEqual([]);
      expect(r.invalid[0].reason).toMatch(/negative|price/i);
    }
  });

  it("rejects a plain negative price", () => {
    expect(generic("-5").valid).toEqual([]);
    expect(mitre10("-5").valid).toEqual([]);
  });

  it("rejects an ambiguous or garbled price cell with a clear reason", () => {
    expect(generic('"12,5000"').invalid[0].reason).toMatch(/price/i);
    expect(generic("12.4O").invalid[0].reason).toMatch(/price/i);
  });

  it("keeps sub-cent prices as written (0.125 stays 0.125)", () => {
    expect(generic("0.125").valid[0].default_unit_price).toBe(0.125);
  });
});

describe("CSV import — GST basis stated on the review screen", () => {
  it("defaults to 'excluding GST, saved as written'", () => {
    expect(csvGstStatement(false, 0.15)).toMatch(/treated as excluding GST and saved as written/);
  });
  it("says how an inc-GST file is converted", () => {
    expect(csvGstStatement(true, 0.15)).toBe("Prices include GST — each is divided by 1.15 and saved ex-GST (15% GST).");
    expect(csvGstStatement(true, 0.125)).toContain("divided by 1.125");
  });
});
