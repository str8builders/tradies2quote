import { crc32, deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analysePriceTable } from "./priceList";
import { XlsxReadError, formatXlsxNumber, readXlsxRows } from "./xlsx";

// A real (tiny) .xlsx built here: a zip of the XML parts Excel writes, each
// part deflated with node:zlib (or stored), then read back by the browser
// reader. No fixture files, no spreadsheet library.

type Part = { name: string; text: string; store?: boolean };

function zip(parts: Part[]): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name, "utf8");
    const raw = Buffer.from(part.text, "utf8");
    const data = part.store ? raw : deflateRawSync(raw);
    const method = part.store ? 0 : 8;
    const crc = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, directory, end]));
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const REL_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function workbook(sheetXml: string, opts: { store?: boolean; sharedStrings?: string[] } = {}): Uint8Array {
  const strings = opts.sharedStrings ?? [];
  return zip([
    {
      name: "[Content_Types].xml",
      text: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    },
    {
      name: "_rels/.rels",
      text:
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    },
    {
      // A hidden sheet listed first: the reader takes the first visible one.
      name: "xl/workbook.xml",
      text:
        `<?xml version="1.0"?><workbook ${NS} ${REL_NS}><sheets>` +
        '<sheet name="Lookups" sheetId="2" state="hidden" r:id="rId9"/>' +
        '<sheet name="Price list" sheetId="1" r:id="rId3"/>' +
        "</sheets></workbook>",
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text:
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/prices.xml"/>' +
        '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/lookups.xml"/>' +
        "</Relationships>",
    },
    {
      name: "xl/worksheets/lookups.xml",
      text: `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>not me</t></is></c></row></sheetData></worksheet>`,
    },
    {
      name: "xl/sharedStrings.xml",
      text:
        `<sst ${NS} count="${strings.length}" uniqueCount="${strings.length}">` +
        strings
          .map((s) => (s.startsWith("<") ? `<si>${s}</si>` : `<si><t xml:space="preserve">${s}</t></si>`))
          .join("") +
        "</sst>",
      store: opts.store,
    },
    { name: "xl/worksheets/prices.xml", text: sheetXml, store: opts.store },
  ]);
}

const STRINGS = [
  "Kauri Timber Supplies — trade prices", // 0
  "Code", // 1
  "Description", // 2
  "UOM", // 3
  "Nett", // 4
  "90x45 H1.2 SG8 Pine", // 5
  "m", // 6
  '<r><t>GIB Standard </t></r><r><rPr><b/></rPr><t>10mm</t></r><rPh sb="0" eb="1"><t>ignore</t></rPh>', // 7 — rich text
  "sheet", // 8
  "Screws &amp; nails", // 9
];

const SHEET =
  `<worksheet ${NS}><sheetData>` +
  '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
  // Row 2 left out entirely (blank in Excel).
  '<row r="3" spans="1:4"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c><c r="C3" t="s"><v>3</v></c><c r="D3" t="s"><v>4</v></c></row>' +
  '<row r="4"><c r="A4" t="inlineStr"><is><t>KT9045</t></is></c><c r="B4" t="s"><v>5</v></c><c r="C4" t="s"><v>6</v></c><c r="D4"><v>4.8499999999999996</v></c></row>' +
  // No code (A5 missing), float noise on the price.
  '<row r="5"><c r="B5" t="s"><v>7</v></c><c r="C5" t="s"><v>8</v></c><c r="D5" s="3"><v>24.500000000000004</v></c></row>' +
  '<row r="6"><c r="B6" t="s"><v>9</v></c><c r="D6" t="str"><f>D5/2</f><v>12.25</v></c></row>' +
  '<row r="7"/>' +
  "</sheetData></worksheet>";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readXlsxRows", () => {
  it("reads the first visible sheet: shared, rich and inline strings, numbers, gaps", async () => {
    const rows = await readXlsxRows(workbook(SHEET, { sharedStrings: STRINGS }));
    expect(rows).toEqual([
      { row: 1, cells: ["Kauri Timber Supplies — trade prices"] },
      { row: 3, cells: ["Code", "Description", "UOM", "Nett"] },
      { row: 4, cells: ["KT9045", "90x45 H1.2 SG8 Pine", "m", "4.85"] },
      { row: 5, cells: ["", "GIB Standard 10mm", "sheet", "24.5"] },
      { row: 6, cells: ["", "Screws & nails", "", "12.25"] },
      { row: 7, cells: [] },
    ]);
  });

  it("reads stored (uncompressed) parts too", async () => {
    const rows = await readXlsxRows(workbook(SHEET, { sharedStrings: STRINGS, store: true }));
    expect(rows[2].cells).toEqual(["KT9045", "90x45 H1.2 SG8 Pine", "m", "4.85"]);
  });

  it("feeds the same pipeline as a CSV, with Excel's row numbers", async () => {
    const parse = analysePriceTable(await readXlsxRows(workbook(SHEET, { sharedStrings: STRINGS })));
    expect(parse.valid.map((r) => [r.row, r.name, r.unit, r.default_unit_price, r.sku])).toEqual([
      [4, "90x45 H1.2 SG8 Pine", "m", 4.85, "KT9045"],
      [5, "GIB Standard 10mm", "sheet", 24.5, null],
      [6, "Screws & nails", null, 12.25, null],
    ]);
  });

  it("says to save as CSV when the phone has no built-in inflater", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    const err = await readXlsxRows(workbook(SHEET, { sharedStrings: STRINGS })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(XlsxReadError);
    expect((err as XlsxReadError).problem).toBe("unsupported_browser");
    expect((err as XlsxReadError).message).toMatch(/save the sheet as CSV/);
  });

  it("explains an old .xls / password-protected file and a non-Excel file", async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(40).fill(0)]);
    await expect(readXlsxRows(ole)).rejects.toMatchObject({ problem: "old_or_protected" });
    await expect(readXlsxRows(new TextEncoder().encode("Description,Price\nPine,4"))).rejects.toMatchObject({
      problem: "not_xlsx",
    });
  });
});

describe("formatXlsxNumber", () => {
  it("drops float noise and never writes exponents", () => {
    expect(formatXlsxNumber("8.7500000000000009")).toBe("8.75");
    expect(formatXlsxNumber("0.30000000000000004")).toBe("0.3");
    expect(formatXlsxNumber("1E-7")).toBe("0.0000001");
    expect(formatXlsxNumber("9415991234567")).toBe("9415991234567");
  });
});
