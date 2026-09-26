import { describe, expect, it } from "vitest";
import {
  MAX_PRICE_LIST_ROWS,
  analysePriceTable,
  columnChoices,
  decodeTextBytes,
  dedupeByName,
  detectColumns,
  detectDelimiter,
  headerGstKind,
  parseDelimitedText,
  parsePriceListText,
  priceListFileKind,
  priceListFromScan,
} from "./priceList";

// Supplier exports as they really arrive: title and account lines above the
// header, semicolons or tabs, quoted cells over two lines, Windows encoding,
// NZ column names, GST stated in the header, no unit column.

describe("delimited text", () => {
  it("finds the separator: comma, semicolon (with decimal commas) or tab", () => {
    expect(detectDelimiter("Description,Unit,Price\nPine,m,4.85\n")).toBe(",");
    expect(detectDelimiter("Description;Unit;Price\nPine 90x45;m;4,85\nNails;box;12,50\n")).toBe(";");
    expect(detectDelimiter("Code\tDescription\tPrice\nX1\tPine, 90x45\t4.85\nX2\tNails, 75mm\t12\n")).toBe("\t");
    // A decimal comma inside quotes is not a separator.
    expect(detectDelimiter('name,unit,price\nPine,m,"12,50"\n')).toBe(",");
  });

  it("keeps a quoted cell with a line break in one row, so row numbers match the sheet", () => {
    const rows = parseDelimitedText('Description,Unit,Price\n"Joist hanger\n190mm",each,4.20\n\nNails,box,10\n');
    expect(rows.map((r) => r.row)).toEqual([1, 2, 3, 4]);
    expect(rows[1].cells[0]).toBe("Joist hanger\n190mm");
    expect(rows[2].cells).toEqual([""]);
    expect(rows[3].cells).toEqual(["Nails", "box", "10"]);
  });

  it("reads escaped quotes and CRLF line endings", () => {
    const rows = parseDelimitedText('a,b\r\n"say ""hi""",2\r\n');
    expect(rows).toEqual([
      { row: 1, cells: ["a", "b"] },
      { row: 2, cells: ['say "hi"', "2"] },
    ]);
  });

  it("falls back to windows-1252 when UTF-8 shows replacement characters (Windows m²)", () => {
    const text = "Description,Unit,Price\nGIB board,m²,12.50\n";
    const bytes = Uint8Array.from(text, (ch) => ch.charCodeAt(0)); // windows-1252: ² is 0xB2
    expect(decodeTextBytes(bytes)).toContain("m²");
    expect(parsePriceListText(decodeTextBytes(bytes)).valid[0].unit).toBe("m²");
  });

  it("reads UTF-8 (with or without a byte-order mark) and Excel's UTF-16 text", () => {
    const utf8 = new TextEncoder().encode("﻿Description,Price\nGIB m²,12\n");
    expect(decodeTextBytes(utf8)).toBe("Description,Price\nGIB m²,12\n");
    const text = "Description\tPrice\nPine\t4.85\n";
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) utf16[2 + i * 2] = text.charCodeAt(i);
    expect(parsePriceListText(decodeTextBytes(utf16)).valid[0]).toMatchObject({ name: "Pine", default_unit_price: 4.85 });
  });
});

describe("finding the header and the columns", () => {
  const withTitle = [
    "Kauri Timber Supplies Ltd — Trade price list",
    "Account: 10442,,Printed 12/09/2026",
    "",
    "Item Code,Description,UOM,Nett Price",
    "KT9045,90x45 H1.2 SG8 Pine,m,4.85",
    "KT14045,140x45 H3.2 SG8 Pine,m,9.10",
  ].join("\n");

  it("skips title and account lines above the real header", () => {
    const parse = parsePriceListText(withTitle);
    expect(parse.headerIndex).toBe(3);
    expect(parse.needsMapping).toBe(false);
    expect(parse.valid).toEqual([
      { row: 5, name: "90x45 H1.2 SG8 Pine", unit: "m", default_unit_price: 4.85, sku: "KT9045", supplier: null, supplier_url: null, notes: null },
      { row: 6, name: "140x45 H3.2 SG8 Pine", unit: "m", default_unit_price: 9.1, sku: "KT14045", supplier: null, supplier_url: null, notes: null },
    ]);
  });

  it("understands NZ column names and prefers the ex-GST price", () => {
    const d = detectColumns(["Product Code", "Product Description", "U.O.M.", "Price incl. GST", "Price excl. GST"]);
    expect(d.mapping).toMatchObject({ code: 0, name: 1, unit: 2, price: 4 });
    expect(d.gstInclusive).toBe(false);
    for (const header of ["Nett", "Net Price", "Trade", "Price ex GST", "Unit Price", "Sell", "Cost"]) {
      expect(detectColumns(["Item", header]).mapping.price, header).toBe(1);
    }
    expect(detectColumns(["Description", "Qty", "Disc %", "Line Total", "Nett"]).mapping.price).toBe(4);
  });

  it("puts the code column in the code, never in the notes", () => {
    const parse = parsePriceListText("Item,Description,Unit,Price\nPLY17,Ply CD 17mm,sheet,89.95\n");
    expect(parse.valid[0]).toMatchObject({ name: "Ply CD 17mm", sku: "PLY17", notes: null });
  });

  it("keeps the supplier presets' column names as extra synonyms", () => {
    const parse = parsePriceListText("Item Description,Item Code,Unit of Measure,Trade Price\nPly,BUN-1,sheet,89.95\n");
    expect(parse.valid[0]).toMatchObject({ name: "Ply", sku: "BUN-1", unit: "sheet", default_unit_price: 89.95 });
    const preset = parsePriceListText("Description,Unit,Price\nWidget,each,5.5\n", { presetId: "itm-trade" });
    expect(preset.valid[0].supplier).toBe("ITM");
  });

  it("detects GST-inclusive prices from the header and says why", () => {
    const parse = parsePriceListText("Description,Unit,Price incl GST\nHinge,each,11.50\n");
    expect(parse.gst.inclusive).toBe(true);
    expect(parse.gst.reason).toContain("Price incl GST");
    expect(headerGstKind("Retail (GST incl.)")).toBe("incl");
    expect(headerGstKind("Price + GST")).toBe("excl");
    expect(headerGstKind("Price")).toBeNull();
  });

  it("reads 'All prices include GST' from a title line", () => {
    const parse = parsePriceListText("Kauri Timber — all prices include GST\nDescription,Price\nHinge,11.50\n");
    expect(parse.gst.inclusive).toBe(true);
    expect(parse.gst.reason).toMatch(/The file says/);
  });

  it("asks for the columns when it can't find the price, then uses the tradie's choice", () => {
    const text = "Product,Amount,Notes\nGIB 10mm,24.50,cut to size\n";
    const parse = parsePriceListText(text);
    expect(parse.needsMapping).toBe(true);
    expect(parse.valid).toEqual([]);
    const mapped = parsePriceListText(text, { mapping: { ...parse.mapping, name: 0, price: 1 } });
    expect(mapped.needsMapping).toBe(false);
    expect(mapped.valid[0]).toMatchObject({ name: "GIB 10mm", default_unit_price: 24.5, notes: "cut to size" });
  });

  it("can treat the first row as a product when the file has no headings", () => {
    const rows = parseDelimitedText("Pine 90x45,4.85\nNails 75mm,12\n");
    const parse = analysePriceTable(rows, {
      hasHeader: false,
      mapping: { name: 0, price: 1, unit: null, code: null, supplier: null, url: null, notes: null },
    });
    expect(parse.valid.map((r) => [r.row, r.name])).toEqual([[1, "Pine 90x45"], [2, "Nails 75mm"]]);
  });

  it("offers each column with its heading and first value for the mapping step", () => {
    const rows = parseDelimitedText("Title line\nProduct,Amount\nGIB 10mm,24.50\n");
    expect(columnChoices(rows, 1)).toEqual([
      { index: 0, label: "Product (column A)", sample: "GIB 10mm" },
      { index: 1, label: "Amount (column B)", sample: "24.50" },
    ]);
  });
});

describe("building the rows", () => {
  it("defaults a missing unit instead of rejecting the row", () => {
    const parse = parsePriceListText("Description,Price\nHinge,4.50\n");
    expect(parse.skipped).toEqual([]);
    expect(parse.valid[0]).toMatchObject({ name: "Hinge", unit: null, default_unit_price: 4.5 });
  });

  it("skips headings and totals with a reason, numbered as spreadsheet rows", () => {
    const text = [
      "Price list", // 1
      "Code,Description,Unit,Price", // 2
      ",TIMBER,,", // 3 — a heading
      'KT1,"Pine\n90x45",m,4.85', // 4 — one row in the sheet
      "", // 5
      "KT2,Nails,box,-5", // 6 — negative price
      ",,,", // 7 — blank
      "KT3,,box,12", // 8 — no name
      ",Total,,16.85", // 9 — a total
    ].join("\n");
    const parse = parsePriceListText(text);
    expect(parse.valid.map((r) => [r.row, r.name])).toEqual([[4, "Pine 90x45"]]);
    expect(parse.skipped.map((s) => [s.row, s.reason])).toEqual([
      [3, "Looks like a heading (no price, unit or code)"],
      [6, 'Negative price "-5" — a price can\'t be below zero'],
      [8, "No name"],
      [9, "Looks like a total or a charge, not a product"],
    ]);
  });

  it("keeps a POA row without a price (never $0)", () => {
    const parse = parsePriceListText("Description,Unit,Price\nCustom flashing,each,POA\n");
    expect(parse.valid[0]).toMatchObject({ default_unit_price: null });
  });

  it("saves a name listed twice once, keeping the last row, and lists the repeats", () => {
    const parse = parsePriceListText("Description,Price\nPine 90x45,4.50\nNails,12\npine  90X45,4.85\n");
    expect(parse.valid.map((r) => [r.name, r.default_unit_price])).toEqual([
      ["Nails", 12],
      ["pine 90X45", 4.85],
    ]);
    expect(parse.duplicates).toEqual([{ name: "pine 90X45", rows: [2, 4], kept: 4 }]);
    expect(dedupeByName([{ name: "A", row: 1 }]).duplicates).toEqual([]);
  });

  it(`flags a file over ${MAX_PRICE_LIST_ROWS} rows`, () => {
    const lines = ["Description,Price"];
    for (let i = 0; i <= MAX_PRICE_LIST_ROWS; i++) lines.push(`Item ${i},1`);
    const parse = parsePriceListText(lines.join("\n"));
    expect(parse.valid).toHaveLength(MAX_PRICE_LIST_ROWS + 1);
    expect(parse.tooMany).toBe(true);
  });
});

describe("price lists read off a PDF or photo", () => {
  it("lands in the same review: 'each' counts as not given, credits are left out", () => {
    const parse = priceListFromScan({
      supplier: "Kauri Timber Supplies",
      gst_inclusive: true,
      items: [
        { name: "90x45 H1.2", unit: "m", price: 4.85, sku: "KT9045" },
        { name: "Hinge", unit: "each", price: 11.5, sku: null },
        { name: "Account credit", unit: "each", price: -20, sku: null },
      ],
    });
    expect(parse.source).toBe("document");
    expect(parse.gst).toEqual({ inclusive: true, reason: "The document shows prices including GST." });
    expect(parse.valid.map((r) => [r.row, r.name, r.unit, r.supplier])).toEqual([
      [1, "90x45 H1.2", "m", "Kauri Timber Supplies"],
      [2, "Hinge", null, "Kauri Timber Supplies"],
    ]);
    expect(parse.skipped[0]).toMatchObject({ row: 3, reason: "A discount or credit, not a product price" });
  });
});

describe("priceListFileKind", () => {
  it("sorts the files a tradie picks", () => {
    expect(priceListFileKind({ name: "prices.csv", type: "text/csv" })).toBe("text");
    expect(priceListFileKind({ name: "prices.txt", type: "" })).toBe("text");
    expect(priceListFileKind({ name: "export.csv", type: "application/vnd.ms-excel" })).toBe("text");
    expect(priceListFileKind({ name: "prices.xlsx", type: "" })).toBe("xlsx");
    expect(priceListFileKind({ name: "prices.xls", type: "application/vnd.ms-excel" })).toBe("old-excel");
    expect(priceListFileKind({ name: "list.pdf", type: "application/pdf" })).toBe("pdf");
    expect(priceListFileKind({ name: "IMG_2041.HEIC", type: "" })).toBe("image");
    expect(priceListFileKind({ name: "photo.jpg", type: "image/jpeg" })).toBe("image");
    expect(priceListFileKind({ name: "notes.docx", type: "" })).toBe("unsupported");
  });
});
