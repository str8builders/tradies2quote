import { describe, expect, it } from "vitest";
import {
  GENERIC_PRESET,
  SUPPLIER_PRESETS,
  buildSourceIndex,
  getSupplierPreset,
  normaliseHeader,
  remapCsvWithPreset,
  type SupplierPresetId,
} from "../supplier-presets";
import { parseMaterialsCsvWithPreset } from "../materials";

/* ----------------------------------------------------------------------
 * Header helpers
 * -------------------------------------------------------------------- */
describe("normaliseHeader", () => {
  it("lowercases + trims + collapses whitespace", () => {
    expect(normaliseHeader("  Trade  Price ")).toBe("trade price");
    expect(normaliseHeader("DESCRIPTION")).toBe("description");
    expect(normaliseHeader("Unit of\tMeasure")).toBe("unit of measure");
  });
});

/* ----------------------------------------------------------------------
 * Preset registry shape
 * -------------------------------------------------------------------- */
describe("preset registry", () => {
  it("includes the generic preset first", () => {
    expect(SUPPLIER_PRESETS[0].id).toBe("generic");
  });

  it("covers all four NZ merchants + generic", () => {
    const ids = SUPPLIER_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      "generic",
      "mitre10-trade",
      "bunnings-powerpass",
      "itm-trade",
      "placemakers-trade",
    ]);
  });

  it("every non-generic preset has a defaultSupplier", () => {
    for (const p of SUPPLIER_PRESETS) {
      if (p.id === "generic") continue;
      expect(p.defaultSupplier, `${p.id} should set defaultSupplier`).toBeTypeOf(
        "string",
      );
      expect((p.defaultSupplier as string).length).toBeGreaterThan(0);
    }
  });

  it("every non-generic preset has a portalUrl pointing at the supplier's site", () => {
    for (const p of SUPPLIER_PRESETS) {
      if (p.id === "generic") continue;
      expect(p.portalUrl, `${p.id} should set portalUrl`).toMatch(
        /^https:\/\/(www\.)?(mitre10|bunnings|itm|placemakers)\.co\.nz\b/,
      );
    }
  });

  it("generic preset has no portalUrl", () => {
    expect(GENERIC_PRESET.portalUrl).toBeNull();
  });

  it("every non-generic preset can map name + unit + price", () => {
    for (const p of SUPPLIER_PRESETS) {
      if (p.id === "generic") continue;
      expect(p.candidates.name.length, `${p.id} name`).toBeGreaterThan(0);
      expect(p.candidates.unit.length, `${p.id} unit`).toBeGreaterThan(0);
      expect(
        p.candidates.default_unit_price.length,
        `${p.id} price`,
      ).toBeGreaterThan(0);
    }
  });

  it("getSupplierPreset returns generic for unknown ids", () => {
    // @ts-expect-error — deliberately bad input
    expect(getSupplierPreset("not-a-preset")).toBe(GENERIC_PRESET);
  });
});

/* ----------------------------------------------------------------------
 * Column-index resolution
 * -------------------------------------------------------------------- */
describe("buildSourceIndex", () => {
  it("maps Mitre 10 columns by candidate priority", () => {
    const preset = getSupplierPreset("mitre10-trade");
    const idx = buildSourceIndex(
      ["Description", "Code", "Unit", "Trade Price"],
      preset,
    );
    expect(idx.get(0)).toBe("name");
    expect(idx.get(1)).toBe("code");
    expect(idx.get(2)).toBe("unit");
    expect(idx.get(3)).toBe("default_unit_price");
  });

  it("matches case-insensitively + tolerates extra whitespace", () => {
    const preset = getSupplierPreset("bunnings-powerpass");
    const idx = buildSourceIndex(
      ["  ITEM DESCRIPTION  ", "Item Code", "Unit of Measure", "Trade Price"],
      preset,
    );
    expect(idx.get(0)).toBe("name");
    expect(idx.get(1)).toBe("code");
    expect(idx.get(2)).toBe("unit");
    expect(idx.get(3)).toBe("default_unit_price");
  });

  it("a target field only matches the FIRST candidate that's present", () => {
    const preset = getSupplierPreset("itm-trade");
    // "Trade Price" + "Price" both exist; ITM candidate order is
    // [Trade Price, Price, ...] so Trade Price wins.
    const idx = buildSourceIndex(
      ["Description", "Unit", "Trade Price", "Price"],
      preset,
    );
    expect(idx.get(2)).toBe("default_unit_price");
    // Index 3 ("Price") doesn't get a target — already taken.
    expect(idx.get(3)).toBeUndefined();
  });

  it("returns an empty map when no source headers match", () => {
    const preset = getSupplierPreset("placemakers-trade");
    const idx = buildSourceIndex(
      ["NothingMatching", "AnotherWeirdColumn"],
      preset,
    );
    expect(idx.size).toBe(0);
  });
});

/* ----------------------------------------------------------------------
 * Full CSV remap
 * -------------------------------------------------------------------- */
describe("remapCsvWithPreset", () => {
  it("generic preset returns the input verbatim", () => {
    const text = "name,unit,default_unit_price\nNail,each,0.5\n";
    expect(remapCsvWithPreset(text, GENERIC_PRESET)).toBe(text);
  });

  it("Mitre 10 preset rewrites headers, injects supplier, folds SKU into notes", () => {
    const csv = [
      "Description,Code,Unit,Trade Price",
      `"90x45 H3.2 framing pine 2.4m",MIT-90H32-2400,LM,8.75`,
      `Screw 75mm box,MIT-SCR-75,each,0.30`,
    ].join("\n");
    const remapped = remapCsvWithPreset(csv, getSupplierPreset("mitre10-trade"));
    const lines = remapped.split("\n");
    expect(lines[0]).toBe(
      "name,unit,default_unit_price,supplier,supplier_url,notes",
    );
    // Row 1: SKU folded into notes, supplier set to "Mitre 10".
    expect(lines[1]).toContain(`90x45 H3.2 framing pine 2.4m`);
    expect(lines[1]).toContain("LM");
    expect(lines[1]).toContain("8.75");
    expect(lines[1]).toContain("Mitre 10");
    expect(lines[1]).toContain("SKU: MIT-90H32-2400");
    // Row 2: same pattern.
    expect(lines[2]).toContain("Screw 75mm box");
    expect(lines[2]).toContain("each");
    expect(lines[2]).toContain("0.30");
    expect(lines[2]).toContain("Mitre 10");
    expect(lines[2]).toContain("SKU: MIT-SCR-75");
  });

  it("passes the price cell through intact so the shared parser reads it", () => {
    const csv = [
      "Description,Unit,Trade Price",
      `Plywood sheet,sheet,"$ 1,250.50"`,
    ].join("\n");
    const remapped = remapCsvWithPreset(
      csv,
      getSupplierPreset("bunnings-powerpass"),
    );
    // Kept as written (quoted, because of the comma) — stripping it here
    // turned a decimal comma into thousands and "POA" into $0.
    expect(remapped.split("\n")[1]).toContain('"$ 1,250.50"');
    // …and the currency symbol + thousands comma are understood on parse.
    expect(
      parseMaterialsCsvWithPreset(csv, "bunnings-powerpass").valid[0]
        .default_unit_price,
    ).toBe(1250.5);
  });

  it("PlaceMakers + ITM presets set the supplier field", () => {
    for (const id of [
      "placemakers-trade",
      "itm-trade",
    ] as SupplierPresetId[]) {
      const csv = "Description,Unit,Price\nWidget,each,5.5\n";
      const remapped = remapCsvWithPreset(csv, getSupplierPreset(id));
      const expected = id === "placemakers-trade" ? "PlaceMakers" : "ITM";
      expect(remapped, `${id} should inject supplier`).toContain(expected);
    }
  });

  it("preserves existing notes when also folding SKU", () => {
    const csv = [
      "Description,Code,Unit,Trade Price,Notes",
      `Brick,MIT-BR-01,each,1.5,"Common red"`,
    ].join("\n");
    const remapped = remapCsvWithPreset(csv, getSupplierPreset("mitre10-trade"));
    const lines = remapped.split("\n");
    // Both the original note AND the SKU should be in the notes
    // column, separated by " · ".
    expect(lines[1]).toMatch(/Common red.*SKU: MIT-BR-01/);
  });
});

/* ----------------------------------------------------------------------
 * End-to-end through parseMaterialsCsvWithPreset
 * -------------------------------------------------------------------- */
describe("parseMaterialsCsvWithPreset", () => {
  it("ingests a Mitre 10 CSV cleanly", () => {
    const csv = [
      "Description,Code,Unit,Trade Price",
      "90x45 H3.2 pine framing 2.4m,MIT-90H32-2400,LM,8.75",
      "Screw box of 100,MIT-SCR-75,each,12.50",
    ].join("\n");
    const result = parseMaterialsCsvWithPreset(csv, "mitre10-trade");
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
    expect(result.valid[0].supplier).toBe("Mitre 10");
    expect(result.valid[0].notes).toBe("SKU: MIT-90H32-2400");
    expect(result.valid[0].name).toBe("90x45 H3.2 pine framing 2.4m");
    expect(result.valid[0].unit).toBe("LM");
    expect(result.valid[0].default_unit_price).toBe(8.75);
  });

  it("ingests a Bunnings PowerPass CSV cleanly", () => {
    const csv = [
      "Item Description,Item Code,Unit of Measure,Trade Price",
      "Plywood CD 17mm 2.4x1.2,BUN-PLY-CD17,sheet,89.95",
    ].join("\n");
    const result = parseMaterialsCsvWithPreset(csv, "bunnings-powerpass");
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(0);
    expect(result.valid[0].supplier).toBe("Bunnings");
    expect(result.valid[0].notes).toBe("SKU: BUN-PLY-CD17");
    expect(result.valid[0].default_unit_price).toBe(89.95);
  });

  it("falls back gracefully when a required column is missing", () => {
    const csv = [
      "Description,Code", // no Unit, no Price
      "Widget,MIT-W-01",
    ].join("\n");
    const result = parseMaterialsCsvWithPreset(csv, "mitre10-trade");
    // The existing parser rejects rows lacking required headers — we
    // get an `invalid` entry, NOT a crash.
    expect(result.valid).toHaveLength(0);
    expect(result.invalid.length).toBeGreaterThan(0);
  });

  it("generic preset behaves identically to the existing parser", () => {
    const csv = [
      "name,unit,default_unit_price,supplier",
      "Widget,each,5.5,Self",
    ].join("\n");
    const result = parseMaterialsCsvWithPreset(csv, "generic");
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].supplier).toBe("Self");
    // No SKU folding, no auto-supplier injection.
    expect(result.valid[0].notes).toBe(null);
  });
});
