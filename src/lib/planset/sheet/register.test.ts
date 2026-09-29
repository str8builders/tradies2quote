import { describe, expect, it } from "vitest";
import type { SheetRaw, TextItem } from "../types";
import { buildRegister, readDrawingIndex } from "./register";
import type { SheetTitle } from "./titleBlock";

// Invented sets: only the layout of real drawing indexes and title blocks is copied.

type Run = [s: string, x: number, y: number, h?: number, angle?: number];

function sheetOf(runs: Run[], w = 420, h = 297, extra: Partial<SheetRaw> = {}): SheetRaw {
  const text: TextItem[] = runs.map(([s, x, y, hh = 2.74, angle = 0], id) => ({ id, s, x, y, angle, h: hh, w: Math.round(s.length * hh * 0.55 * 100) / 100 }));
  return { page: 1, widthMm: w, heightMm: h, rotate: 0, text, segs: [], fills: [], images: 0, imageCover: 0, ...extra };
}

const title = (o: Partial<SheetTitle> = {}): SheetTitle => ({
  sheetId: null,
  title: null,
  scaleNotes: [],
  revision: null,
  date: null,
  project: null,
  consent: { approved: false, number: null, authority: null },
  draft: false,
  textIds: [],
  ...o,
});

/** Deterministic shuffle so row pairing can't lean on text order. */
function shuffled<T>(a: T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (i * 7 + 3) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** ID | Layout Name list at the right edge, with a name-only first row and small "RFI" tables below. */
function captionedIndex(rows: Array<[string, string]>, opts: { rfi?: boolean } = {}): Run[] {
  const runs: Run[] = [
    ["PROJECT No.", 360.3, 8.7, 2.06],
    ["T1234", 405.4, 8.9],
    ["Drawing Index", 360.1, 19.9],
    ["ID", 364.7, 23.9],
    ["Layout Name", 374.1, 23.9],
    ["Cover Page", 374.1, 27.9],
  ];
  rows.forEach(([id, name], i) => {
    runs.push([id, 362.5, 31.9 + i * 4], [name, 374.1, 31.9 + i * 4]);
  });
  if (opts.rfi) {
    const y = 31.9 + rows.length * 4 + 6;
    runs.push(["RFI Index - Processing", 359.3, y - 0.5, 2.76], ["ID", 364.6, y + 3], ["Layout", 375.1, y + 3]);
    for (let i = 0; i < 3; i++) runs.push([rows[i][0], 362.5, y + 7 + i * 4], [rows[i][1], 374.1, y + 7 + i * 4]);
  }
  return runs;
}

const ROWS: Array<[string, string]> = [
  ["A000", "Notes - Specifications"],
  ["A000", "Notes - Specifications"],
  ["A01.1", "Site Plan"],
  ["A02.2", "Ground Floor Plan"],
  ["A02.3", "Ground Floor - Dimension Plan"],
  ["A03.1", "Elevations"],
];

describe("readDrawingIndex", () => {
  it("pairs sheet number and name by ROW, whatever the text order", () => {
    const list = readDrawingIndex(sheetOf(shuffled(captionedIndex(ROWS))));
    expect(list).toEqual(ROWS.map(([sheetId, name]) => ({ sheetId, name, revision: null })));
  });
  it("skips a name with no number, and small 'RFI' tables under the main list", () => {
    const list = readDrawingIndex(sheetOf(captionedIndex(ROWS, { rfi: true })));
    expect(list).toHaveLength(ROWS.length);
    expect(list?.map((r) => r.name)).not.toContain("Cover Page");
  });
  it("reads a table with a revision column, and stops the name before it", () => {
    const runs: Run[] = [
      ["STRUCTURAL DRAWING LIST", 121, 44.7, 4.36],
      ["DRG No.", 44.3, 52.1, 3.52],
      ["SHEET NAME", 100.9, 52.1, 3.52],
      ["REV", 167.7, 52.1, 3.52],
      ["DATE", 182.8, 52.1, 3.52],
      ["DESIGN STATUS", 214.1, 52.1, 3.52],
    ];
    const rows: Array<[string, string, string]> = [
      ["S000", "COVER SHEET", "1"],
      ["S001", "STRUCTURAL DRAWING LIST", "1"],
      ["S112", "COTTAGE GROUND FLOOR PLAN", "B"],
      ["S115", "COTTAGE ROOF PLAN", "1"],
    ];
    rows.forEach(([id, name, rev], i) => {
      const y = 56.9 + i * 4.8;
      runs.push([id, 47.3, y, 3.52], [name, 60.2, y, 3.52], [rev, 170.3, y, 3.52], ["30.05.25", 180.6, y, 3.52], ["ISSUED FOR TEST", 203.1, y, 3.52]);
    });
    const list = readDrawingIndex(sheetOf(runs, 841, 594));
    expect(list).toEqual([
      { sheetId: "S000", name: "COVER SHEET", revision: "1" },
      { sheetId: "S001", name: "STRUCTURAL DRAWING LIST", revision: "1" },
      { sheetId: "S112", name: "COTTAGE GROUND FLOOR PLAN", revision: "B" },
      { sheetId: "S115", name: "COTTAGE ROOF PLAN", revision: "1" },
    ]);
  });
  it("reads 'SHT n' rows under a heading: split or merged, wrapped names, a section heading between", () => {
    const runs: Run[] = [
      ["DRAWING LIST", 226.7, 11, 3.17],
      ["ARCHITECTURAL", 226.7, 14.8, 3.17],
      ["SHT 1", 226.7, 18.4, 3.17],
      ["SITE PLAN", 239.3, 18.4, 3.17],
      ["SHT 2", 226.7, 22.1, 3.17],
      ["EXISTING FLOOR PLAN", 239.3, 22.1, 3.17],
      ["SHT 10 WALL BRACING & LINTEL PLAN", 226.7, 25.7, 3.17],
      ["SHT 17 STUD TO TOP PLATE", 226.7, 29.4, 3.17],
      ["BRACE HOLD DOWN", 239.1, 33, 3.17],
      ["SHT 18 BRACES GS1-N", 226.7, 36.7, 3.17],
      ["ENGINEERING Sample Engineers Ltd Ref 25001", 226.7, 44, 3.17],
      ["SHT S000 Cover Page", 226.7, 51.4, 3.17],
      ["Rev A", 261.7, 51.4, 2.84],
      ["SHT S401 Details", 226.7, 55, 3.17],
      ["Rev A", 254.7, 55, 2.84],
    ];
    // real drawing content on the same page must not disturb it
    for (let i = 0; i < 12; i++) runs.push([`${100 + i * 5}`, 100 + i * 10, 150 + i * 3, 2.8]);
    const list = readDrawingIndex(sheetOf(runs));
    expect(list).toEqual([
      { sheetId: "SHT 1", name: "SITE PLAN", revision: null },
      { sheetId: "SHT 2", name: "EXISTING FLOOR PLAN", revision: null },
      { sheetId: "SHT 10", name: "WALL BRACING & LINTEL PLAN", revision: null },
      { sheetId: "SHT 17", name: "STUD TO TOP PLATE BRACE HOLD DOWN", revision: null },
      { sheetId: "SHT 18", name: "BRACES GS1-N", revision: null },
      { sheetId: "S000", name: "Cover Page", revision: "A" },
      { sheetId: "S401", name: "Details", revision: "A" },
    ]);
  });
  it("is not fooled by a schedule whose first column is a code (W01, W02 …)", () => {
    const runs: Run[] = [["MARK", 30, 40], ["SIZE", 60, 40], ["TYPE", 100, 40]];
    for (let i = 1; i <= 8; i++) runs.push([`W0${i}`, 30, 44 + i * 4], [`${900 + i * 100} x 1200`, 60, 44 + i * 4], ["Aluminium", 100, 44 + i * 4]);
    expect(readDrawingIndex(sheetOf(runs))).toBeNull();
  });
  it("needs a caption row or a heading: a bare column of numbers and words is not an index", () => {
    const runs: Run[] = [];
    for (let i = 0; i < 8; i++) runs.push([`A0${i}.1`, 362.5, 31.9 + i * 4], [`Sheet name ${i}`, 374.1, 31.9 + i * 4]);
    for (let i = 0; i < 8; i++) runs.push([`word ${i}`, 20, 100 + i * 8]);
    expect(readDrawingIndex(sheetOf(runs))).toBeNull();
  });
  it("is null for numbered notes, short lists and pages with no list", () => {
    const notes: Run[] = [["General Notes", 20, 20]];
    for (let i = 1; i <= 10; i++) notes.push([`${i}.`, 20, 30 + i * 6], [`Note text number ${i} of the general notes`, 30, 30 + i * 6]);
    expect(readDrawingIndex(sheetOf(notes))).toBeNull();
    expect(readDrawingIndex(sheetOf(captionedIndex(ROWS.slice(0, 2))))).toBeNull();
    expect(readDrawingIndex(sheetOf([]))).toBeNull();
  });
  it("ignores text that does not read left to right", () => {
    const runs = captionedIndex(ROWS).map((r): Run => [r[0], r[1], r[2], r[3], 90]);
    expect(readDrawingIndex(sheetOf(runs))).toBeNull();
  });
});

// ── the register ────────────────────────────────────────────────────────

/** A drawing page with a title block already read. */
function drawing(page: number, id: string | null, name: string | null, over: Partial<SheetTitle> = {}, raw?: SheetRaw) {
  return { page, sheet: raw ?? sheetOf([["filler", 50, 50], ["filler", 60, 60]]), title: title({ sheetId: id, title: name, ...over }) };
}

describe("buildRegister — a small architect's set with an engineer's sheet slipped in", () => {
  const pages = [
    { page: 1, sheet: sheetOf(captionedIndex(ROWS)), title: title() },
    drawing(2, "A000", "Notes - Specifications", { revision: "01" }),
    drawing(3, "A000", "Notes - Specifications", { revision: "01" }),
    drawing(4, "A01.1", "Site Plan", { revision: "03" }),
    drawing(5, "A02.2", "Ground Floor Plan", { revision: "01" }),
    drawing(6, "A02.3", "Ground Floor - Dimension Plan", { revision: "01", draft: true }),
    drawing(7, "S000", "Cover Page", { revision: "1" }),
  ];
  const reg = buildRegister(pages);
  const byPage = (n: number) => reg.entries.find((e) => e.page === n)!;

  it("keeps the index as printed", () => {
    expect(reg.index.map((r) => r.sheetId)).toEqual(["A000", "A000", "A01.1", "A02.2", "A02.3", "A03.1"]);
  });
  it("matches pages to index rows by sheet number, two pages sharing one number both matching", () => {
    expect(byPage(2).indexName).toBe("Notes - Specifications");
    expect(byPage(3).indexName).toBe("Notes - Specifications");
    expect(byPage(6).indexName).toBe("Ground Floor - Dimension Plan");
    expect(byPage(7).indexName).toBeNull();
  });
  it("lists what the index promises and no page holds", () => {
    expect(reg.missing).toEqual([{ sheetId: "A03.1", name: "Elevations", revision: null }]);
  });
  it("lists drawings the index doesn't know — and not a page with no number of its own", () => {
    expect(reg.unlisted).toEqual([7]);
  });
  it("sees the sheets are not all at one revision ('1' and '01' are the same one)", () => {
    expect(reg.revisions).toEqual(["01", "03"]);
    expect(reg.mixedRevisions).toBe(true);
  });
  it("flags drafts by page", () => {
    expect(reg.drafts).toEqual([6]);
    expect(byPage(6).draft).toBe(true);
    expect(byPage(5).draft).toBe(false);
  });
  it("classifies every page, a page-1 list with no sheet number of its own being the cover", () => {
    expect(reg.entries.map((e) => e.kind)).toEqual(["cover", "notes", "notes", "site_plan", "floor_plan", "dimension_plan", "cover"]);
    expect(byPage(5).level).toBe("ground");
  });
});

describe("buildRegister — one revision, no index", () => {
  const pages = [drawing(1, "A1.1", "Site Plan", { revision: "B" }), drawing(2, "A2.1", "Floor Plan", { revision: "B" }), drawing(3, "A9.9", "Details")];
  const reg = buildRegister(pages);
  it("finds nothing missing or unlisted when there is no index to judge by", () => {
    expect(reg.index).toEqual([]);
    expect(reg.missing).toEqual([]);
    expect(reg.unlisted).toEqual([]);
  });
  it("agrees with itself: one revision, not mixed", () => {
    expect(reg.revisions).toEqual(["B"]);
    expect(reg.mixedRevisions).toBe(false);
  });
});

describe("buildRegister — an engineer's set with an unnumbered cover and several buildings", () => {
  const listRows: Array<[string, string, string]> = [
    ["S000", "COVER SHEET", "1"],
    ["S001", "STRUCTURAL DRAWING LIST", "1"],
    ["S010", "GENERAL NOTES - SHEET 1", "1"],
    ["S112", "COTTAGE GROUND FLOOR PLAN", "1"],
    ["S122", "BARN GROUND FLOOR PLAN", "1"],
    ["S410", "FRAME DETAILS - COTTAGE INTERNAL PORTAL", "1"],
    ["S500", "ROOF DETAILS - TYPICAL", "1"],
  ];
  const listRuns: Run[] = [
    ["STRUCTURAL DRAWING LIST", 121, 44.7, 4.36],
    ["DRG No.", 44.3, 52.1, 3.52],
    ["SHEET NAME", 100.9, 52.1, 3.52],
    ["REV", 167.7, 52.1, 3.52],
  ];
  listRows.forEach(([id, name, rev], i) => listRuns.push([id, 47.3, 56.9 + i * 4.8, 3.52], [name, 60.2, 56.9 + i * 4.8, 3.52], [rev, 170.3, 56.9 + i * 4.8, 3.52]));
  const big = (runs: Run[]) => sheetOf(runs, 841, 594);
  const pages = [
    { page: 1, sheet: big([["a cover with no number", 300, 150, 28]]), title: title() },
    { page: 2, sheet: big(listRuns), title: title({ sheetId: "S001", title: "STRUCTURAL DRAWING LIST", revision: "1" }) },
    drawing(3, "S010", "GENERAL NOTES SHEET 1", { revision: "1" }),
    drawing(4, "S112", "COTTAGE GROUND FLOOR PLAN", { revision: "1" }),
    drawing(5, "S122", "BARN GROUND FLOOR PLAN", { revision: "1" }),
    drawing(6, "S410", "FRAME DETAILS COTTAGE INTERNAL PORTAL", { revision: "1" }),
    drawing(7, "S500", "ROOF DETAILS TYPICAL", { revision: "1" }),
  ];
  const reg = buildRegister(pages);
  const byPage = (n: number) => reg.entries.find((e) => e.page === n)!;

  it("gives a number-less page between matched sheets the only index row left there — and says so in its index name", () => {
    expect(byPage(1).sheetId).toBe("S000");
    expect(byPage(1).indexName).toBe("COVER SHEET");
    expect(byPage(1).kind).toBe("cover");
    expect(reg.missing).toEqual([]);
  });
  it("never guesses when two number-less pages compete for one index row", () => {
    const two = buildRegister([
      { page: 1, sheet: big([["cover", 300, 150, 28]]), title: title() },
      { page: 2, sheet: big([["another unnumbered page", 300, 150, 28]]), title: title() },
      ...pages.slice(1).map((p) => ({ ...p, page: p.page + 1 })),
    ]);
    expect(two.entries[0].sheetId).toBeNull();
    expect(two.entries[1].sheetId).toBeNull();
    expect(two.missing.map((m) => m.sheetId)).toEqual(["S000"]);
  });
  it("calls the list page an index and reads the discipline letter: S sheets are the engineer's", () => {
    expect(byPage(2).kind).toBe("index");
    expect(byPage(3).kind).toBe("structural_notes");
    expect(byPage(6).kind).toBe("structural_details");
  });
  it("collects the buildings named on the plans, in first-seen order", () => {
    expect(reg.buildings).toEqual(["COTTAGE", "BARN"]);
    expect(byPage(4).building).toBe("COTTAGE");
    expect(byPage(5).building).toBe("BARN");
  });
  it("gives a details sheet the building whose name it mentions, and none when it names no building", () => {
    expect(byPage(6).building).toBe("COTTAGE");
    expect(byPage(7).building).toBeNull();
  });
  it("counts the numberless cover's index revision, and the sheets agree", () => {
    expect(byPage(1).revision).toBe("1");
    expect(reg.mixedRevisions).toBe(false);
  });
});

describe("buildRegister — paperwork", () => {
  const a4 = (runs: Run[], extra: Partial<SheetRaw> = {}) => sheetOf(runs, 210, 297, extra);
  const para = (n: number): Run[] => Array.from({ length: n }, (_, i) => [`This is a paragraph line of the consent conditions, number ${i}.`, 25, 30 + i * 5, 3.3]);
  const form5 = a4([["Building Consent", 25, 53, 8.8], ["Section 51, Building Act 2004 (Form 5)", 25, 62, 4.6], ["BC Number: 424242", 25, 72, 5.3]]);
  const reg = buildRegister([
    { page: 1, sheet: form5, title: title({ consent: { approved: false, number: "BC424242", authority: null } }) },
    { page: 2, sheet: a4(para(20)), title: title({ consent: { approved: false, number: null, authority: "Sample District Council" } }) },
    { page: 3, sheet: a4([["Item", 25, 40], ["Doc", 60, 40], ["#", 90, 40], ["1", 25, 46]]), title: title() },
    drawing(4, "A1.1", "Site Plan", {}, sheetOf([["x", 1, 1]], 420, 297)),
    { page: 5, sheet: sheetOf([["A cover with no number", 100, 100, 20]], 420, 297), title: title() },
    { page: 6, sheet: a4(para(3)), title: title({ sheetId: "A4.1", title: "Detail" }) },
    { page: 7, sheet: a4([["a one-off A4 drawing", 30, 30]], { segs: Array.from({ length: 200 }, () => ({ x1: 0, y1: 0, x2: 10, y2: 10, c: "#000000", w: 0.2, dashed: false })) }), title: title() },
  ]);
  const byPage = (n: number) => reg.entries.find((e) => e.page === n)!;

  it("marks A4 pages with no sheet number and no line work as documents, and classes them as consent paperwork", () => {
    for (const n of [1, 2, 3]) {
      expect(byPage(n).document).toBe(true);
      expect(byPage(n).kind).toBe("consent_document");
    }
  });
  it("keeps drawings, big unnumbered pages, numbered A4 sheets and A4 pages full of line work out of the documents", () => {
    for (const n of [4, 5, 6, 7]) expect(byPage(n).document).toBe(false);
  });
  it("keeps documents out of the revision and unlisted checks", () => {
    expect(reg.unlisted).toEqual([]);
    expect(reg.revisions).toEqual([]);
  });
  it("carries the consent number and authority the paperwork states", () => {
    expect(reg.consent).toEqual({ number: "BC424242", authority: "Sample District Council", pages: [1, 2] });
  });
  it("reports an approval stamp per page", () => {
    const stamped = buildRegister([drawing(1, "A1.1", "Site Plan", { consent: { approved: true, number: "BC1", authority: null } }), drawing(2, "A1.2", "Floor Plan")]);
    expect(stamped.entries.map((e) => e.approved)).toEqual([true, false]);
  });
});

describe("buildRegister — edges", () => {
  it("handles an empty set", () => {
    expect(buildRegister([])).toEqual({ entries: [], index: [], missing: [], unlisted: [], revisions: [], mixedRevisions: false, drafts: [], buildings: [] });
  });
  it("treats the same list printed on two pages as one list", () => {
    const list = sheetOf(captionedIndex(ROWS));
    const reg = buildRegister([
      { page: 1, sheet: list, title: title() },
      { page: 2, sheet: list, title: title({ sheetId: "A000", title: "Notes - Specifications" }) },
    ]);
    expect(reg.index).toHaveLength(ROWS.length);
  });
  it("keeps building names distinct case-insensitively, first spelling wins", () => {
    const reg = buildRegister([drawing(1, "S1", "COTTAGE FLOOR PLAN"), drawing(2, "S2", "Cottage Roof Plan")]);
    expect(reg.buildings).toEqual(["COTTAGE"]);
  });
  it("matches 'A02.3' to an index that prints 'A023'", () => {
    const rows: Array<[string, string]> = [["A011", "Site Plan"], ["A022", "Ground Floor Plan"], ["A023", "Elevations"], ["A031", "Sections"]];
    const reg = buildRegister([
      { page: 1, sheet: sheetOf(captionedIndex(rows)), title: title() },
      drawing(2, "A02.2", "Ground Floor Plan"),
      drawing(3, "A01.1", "Site Plan"),
    ]);
    expect(reg.missing.map((m) => m.sheetId)).toEqual(["A023", "A031"]);
    expect(reg.unlisted).toEqual([]);
  });
});
