import { describe, expect, it } from "vitest";
import type { SheetRaw, TextItem } from "../types";
import { parseRevision, parseSheetId, readTitleBlock } from "./titleBlock";

// All sheets here are built by hand: invented names, numbers and layouts that
// copy only the *shape* of real title blocks.

/** [text, x, baselineY, fontHeight?, angle?] in page mm. */
type Run = [s: string, x: number, y: number, h?: number, angle?: number];

function sheetOf(runs: Run[], w = 420, h = 297, extra: Partial<SheetRaw> = {}): SheetRaw {
  const text: TextItem[] = runs.map(([s, x, y, hh = 2.5, angle = 0], id) => ({
    id,
    s,
    x,
    y,
    angle,
    h: hh,
    w: Math.round(s.length * hh * 0.55 * 100) / 100,
  }));
  return { page: 1, widthMm: w, heightMm: h, rotate: 0, text, segs: [], fills: [], images: 0, imageCover: 0, ...extra };
}

/** Small drawing-area text scattered over the page, so "median font" means something. */
function filler(n: number, w = 420, h = 297): Run[] {
  const out: Run[] = [];
  for (let i = 0; i < n; i++) out.push([`${(i * 37) % 900 + 100}`, 20 + ((i * 53) % (w - 200)), 20 + ((i * 29) % (h - 120)), 2.5]);
  return out;
}

describe("right-strip title block (captions with the value beside them)", () => {
  const runs: Run[] = [
    ...filler(40),
    ["PROJECT No.", 360.3, 8.7, 2.06],
    ["T1234", 405.4, 8.9, 2.74],
    ["STATUS :", 360.3, 12.7, 2.06],
    ["Building Consent", 390.7, 12.9, 2.74],
    // the footer's small captions, with a value that sits right against the title
    ["DRAWN:", 247.3, 278.7, 2.06],
    ["AB", 293.5, 278.8, 2.47],
    ["Ground Floor - Dimension", 302.6, 281.1, 4.11],
    ["Plan", 302.6, 285.2, 4.11],
    ["CLIENT SIGNATURE", 359.3, 264.3, 2.06],
    ["/ DATE :", 359.3, 266, 2.06],
    ["DATE :", 360.3, 278.7, 2.06],
    ["REVISION :", 392.4, 278.7, 2.06],
    ["8/08/2025", 373.2, 278.9, 2.74],
    ["02", 410, 278.9, 2.74],
    ["SCALE :", 360.3, 282.7, 2.06],
    ["1:100, 1:84.8036 @ A3", 385, 282.9, 2.74],
    ["SHEET NUMBER :", 360.3, 286.5, 2.06],
    ["A02.3", 399, 289.6, 5.5],
  ];
  const t = readTitleBlock(sheetOf(runs));

  it("pairs each caption with the value beside it", () => {
    expect(t.sheetId).toBe("A02.3");
    expect(t.revision).toBe("02");
    expect(t.date).toBe("8/08/2025");
    expect(t.project).toBe("T1234");
  });
  it("keeps the printed scale text raw", () => {
    expect(t.scaleNotes).toEqual(["1:100, 1:84.8036 @ A3"]);
  });
  it("reads the uncaptioned two-line title stacked beside the block, not the footer caption's value", () => {
    expect(t.title).toBe("Ground Floor - Dimension Plan");
  });
  it("returns the ids of the text it used as evidence", () => {
    const idOf = (s: string) => runs.findIndex((r) => r[0] === s);
    for (const s of ["A02.3", "SHEET NUMBER :", "Ground Floor - Dimension", "Plan", "02", "1:100, 1:84.8036 @ A3"]) {
      expect(t.textIds).toContain(idOf(s));
    }
    expect(t.textIds).not.toContain(idOf("AB"));
    // sorted, and each id once
    expect(t.textIds).toEqual([...new Set(t.textIds)].sort((a, b) => a - b));
  });
  it("takes the later of two dates printed over each other", () => {
    const over = readTitleBlock(sheetOf([...runs.filter((r) => r[0] !== "8/08/2025"), ["08/08/2025", 371, 278.9, 2.74], ["12/08/2025", 372, 278.9, 2.74]]));
    expect(over.date).toBe("12/08/2025");
  });
  it("does not take an 'N.T.S @ A3' scale as anything but raw text, and skips a bare paper size", () => {
    const nts = readTitleBlock(sheetOf([...runs.filter((r) => r[0] !== "1:100, 1:84.8036 @ A3"), ["N.T.S", 398, 282.9, 2.74], ["@ A3", 406.3, 282.9, 2.74]]));
    expect(nts.scaleNotes).toEqual(["N.T.S @ A3"]);
    const paperOnly = readTitleBlock(sheetOf([...runs.filter((r) => r[0] !== "1:100, 1:84.8036 @ A3"), ["@ A3", 406.3, 282.9, 2.74]]));
    expect(paperOnly.scaleNotes).toEqual([]);
  });
});

describe("bottom-band title block (captions with the value under them)", () => {
  const W = 841;
  const H = 594;
  const runs: Run[] = [
    ...filler(60, W, H),
    // the drawing title, three stacked lines, with a stage legend on the same row far to the right
    ["DRAWING TITLE:", 479.7, 552.2, 3.51],
    ["FRAME DETAILS", 479.7, 558.9, 4.97],
    ["BASE CONNECTIONS", 479.7, 564.4, 4.97],
    ["TYPICAL", 479.7, 570, 4.97],
    ["STAGE LEGEND: FOUNDATION", 627.7, 551.4, 4.97],
    ["PROJECT No.", 742.4, 552.2, 3.51],
    ["23-0456", 740.8, 559.8, 7.09],
    ["SHEET No.", 774.3, 552.2, 3.51],
    ["S410", 775.1, 559.8, 7.09],
    ["REV", 802.6, 552.2, 3.51],
    ["B", 804.2, 559.8, 7.09],
    ["SHEET SIZE", 747.1, 566.6, 3.51],
    ["A1 (841x594)", 746.9, 570.7, 3.51],
    ["SCALE", 789, 566.6, 3.51],
    ["As indicated", 790.9, 570.7, 3.51],
    // the revision table at the left: newest row on top
    ["B", 288.5, 551.5, 3.52],
    ["30.05.25", 297.6, 551.5, 3.52],
    ["FOR TEST STAGE 2", 315.3, 551.5, 3.52],
    ["A", 288.3, 556.3, 3.52],
    ["15.11.24", 297.6, 556.3, 3.52],
    ["FOR TEST STAGE 1", 315.3, 556.3, 3.52],
    ["REV", 285.9, 570.7, 3.64],
    ["DATE", 299.7, 570.7, 3.64],
    ["REVISION DESCRIPTION", 343.7, 570.7, 3.64],
  ];
  const t = readTitleBlock(sheetOf(runs, W, H));

  it("reads number, revision and scale from under their captions", () => {
    expect(t.sheetId).toBe("S410");
    expect(t.revision).toBe("B");
    expect(t.scaleNotes).toEqual(["As indicated"]);
  });
  it("joins a stacked title, stopping before the neighbouring cell's legend", () => {
    expect(t.title).toBe("FRAME DETAILS BASE CONNECTIONS TYPICAL");
  });
  it("does not mistake a project number like 23-0456 for a date", () => {
    expect(t.project).toBe("23-0456");
    expect(t.date).toBe("30.05.25");
  });
  it("finds the date in the revision table, on the row of this sheet's revision", () => {
    const rev = readTitleBlock(sheetOf(runs.map((r) => (r[0] === "B" && r[1] === 804.2 ? (["A", 804.2, 559.8, 7.09] as Run) : r)), W, H));
    expect(rev.revision).toBe("A");
    expect(rev.date).toBe("15.11.24");
  });
});

describe("revision tables (REV | DATE | DESCRIPTION)", () => {
  const idBlock: Run[] = [["SHEET NUMBER :", 360.3, 286.5, 2.06], ["A5.1", 399, 289.6, 5.5]];
  /** A heading row at y=200 with the rows below (newest position given by the caller's row order). */
  const table = (rows: Array<[string, string]>, x = 362): Run[] => [
    ["REV", x, 200, 2.06],
    ["DATE", x + 10, 200, 2.06],
    ["DESCRIPTION", x + 32, 200, 2.06],
    ...rows.flatMap(([rev, date], i): Run[] => [[rev, x + 0.6, 205 + i * 4, 2.5], [date, x + 10, 205 + i * 4, 2.5], ["Issued for something", x + 32, 205 + i * 4, 2.5]]),
  ];
  const ROWS: Array<[string, string]> = [["A", "12/03/2024"], ["B", "02/05/2024"], ["C", "20/06/2024"]];

  it("takes the newest row BY DATE when the table lists oldest first", () => {
    const t = readTitleBlock(sheetOf([...filler(20), ...idBlock, ...table(ROWS)]));
    expect(t.revision).toBe("C");
    expect(t.date).toBe("20/06/2024");
  });
  it("takes the same row when the table lists newest first", () => {
    const t = readTitleBlock(sheetOf([...filler(20), ...idBlock, ...table([...ROWS].reverse())]));
    expect(t.revision).toBe("C");
    expect(t.date).toBe("20/06/2024");
  });
  it("gives a sheet with its own revision cell that cell, and the date of its row in the table", () => {
    const own: Run[] = [["REVISION :", 392.4, 278.7, 2.06], ["B", 410, 278.9, 2.74]];
    const t = readTitleBlock(sheetOf([...filler(20), ...idBlock, ...own, ...table(ROWS)]));
    expect(t.revision).toBe("B");
    expect(t.date).toBe("02/05/2024");
  });
  it("does not guess from a table whose rows are not all dated", () => {
    const t = readTitleBlock(sheetOf([...filler(20), ...idBlock, ...table([["A", "12/03/2024"], ["B", "tbc"]])]));
    expect(t.revision).toBeNull();
  });
});

describe("a big sheet number among small captions, with template placeholders", () => {
  const W = 841;
  const H = 594;
  const runs: Run[] = [
    ...filler(80, W, H),
    ["PROJECT", 730.8, 446.7, 2.1],
    ["New Dwelling", 730.8, 453.5, 4.93],
    ["DRAWING", 730.8, 488.7, 2.1],
    ["Plan Proposed", 730.8, 495.5, 4.93],
    ["PROJECT #", 730.8, 544.7, 2.1],
    ["Proj No.", 755.5, 547.2, 4.21],
    ["DWG DATE", 730.8, 551.7, 2.1],
    ["Date", 763.3, 553.6, 3.54],
    ["PLOT DATE", 730.8, 558.7, 2.1],
    ["24/6/26", 759, 560.7, 3.54],
    ["DWG #", 775.8, 558.7, 2.1],
    ["REVISION", 815.8, 558.7, 2.1],
    ["SCALE @ A1", 730.8, 572.7, 2.1],
    ["1:100", 760.2, 575, 4.21],
    ["A120", 796.3, 573, 11.29],
    ["DRAWN", 730.8, 579.7, 2.1],
    ["??", 739.8, 582.3, 3.18],
  ];
  const t = readTitleBlock(sheetOf(runs, W, H));
  it("takes the biggest sheet-number-shaped run beside the captions", () => {
    expect(t.sheetId).toBe("A120");
  });
  it("reads the title under 'DRAWING' and the scale beside 'SCALE @ A1'", () => {
    expect(t.title).toBe("Plan Proposed");
    expect(t.scaleNotes).toEqual(["1:100"]);
  });
  it("never turns a placeholder or a plot date into a value", () => {
    expect(t.project).toBeNull();
    expect(t.date).toBeNull();
    expect(t.revision).toBeNull();
  });
  it("does not pick a big number in the middle of the page when no caption is near it", () => {
    const lone = readTitleBlock(sheetOf([...filler(80, W, H), ["A120", 500, 300, 11.29]], W, H));
    expect(lone.sheetId).toBeNull();
  });
  it("still takes a caption-less number standing alone in the bottom-right corner", () => {
    const corner = readTitleBlock(sheetOf([...filler(80, W, H), ["A-201", 780, 570, 11.29]], W, H));
    expect(corner.sheetId).toBe("A-201");
    const small = readTitleBlock(sheetOf([...filler(80, W, H), ["A-201", 780, 570, 3.5]], W, H));
    expect(small.sheetId).toBeNull();
  });
});

describe("no captions at all: a title above 'sht 3 of 22'", () => {
  const runs: Run[] = [
    ...filler(30),
    // a drawing label with the same font as the title, far from the block
    ["NEW FLOOR PLAN 1:100", 178.2, 248.1, 4.23],
    ["Owners", 313.1, 270, 2.46],
    ["A. Sample", 313.1, 272.8, 2.46],
    ["STUD TO PLATE", 368, 262, 4.23],
    ["TOP PLATE JOIN", 368, 267.2, 4.23],
    ["BRACE HOLD-DOWN", 368, 272.6, 4.23],
    ["Feb 2026", 399.7, 279.8, 2.84],
    ["job_x/OH sht 11", 389.2, 285.9, 2.84],
    ["of 22", 404.9, 289.1, 2.84],
  ];
  const t = readTitleBlock(sheetOf(runs));
  it("reads 'sht 11' (with its 'of 22') as the sheet number", () => {
    expect(t.sheetId).toBe("SHT 11");
  });
  it("stacks the big lines above it into the title, leaving the drawing label alone", () => {
    expect(t.title).toBe("STUD TO PLATE TOP PLATE JOIN BRACE HOLD-DOWN");
  });
  it("takes the month-year beside the block as the date, and scale statements from the drawing labels", () => {
    expect(t.date).toBe("Feb 2026");
    expect(t.scaleNotes).toEqual(["NEW FLOOR PLAN 1:100"]);
  });
  it("needs the 'of N': a 'SHEET 1' inside a title is not a sheet number", () => {
    const partOfTitle = readTitleBlock(sheetOf([...filler(30), ["GENERAL NOTES", 480, 559, 4.97], ["SHEET 1", 480, 564, 4.97]], 841, 594));
    expect(partOfTitle.sheetId).toBeNull();
  });
});

describe("an engineer's small block: caption above, value below", () => {
  const runs: Run[] = [
    ...filler(30),
    ["Project:", 360.6, 237.1, 2.1],
    ["Sample Residence", 371.3, 240.1, 2.79],
    ["Title:", 360.7, 251, 2.1],
    ["Beam & Foundation Plan", 369.7, 256.1, 2.79],
    ["Drawn:", 360.6, 265.1, 2.1],
    ["Design:", 375.1, 265.1, 2.1],
    ["Date:", 390.8, 265.1, 2.1],
    ["22.01.2026", 392.8, 269, 2.79],
    ["AB", 365.5, 269.3, 2.79],
    ["CD", 379.6, 269.3, 2.79],
    ["Reference:", 360.6, 273.1, 2.1],
    ["Sheet:", 375.1, 273.1, 2.1],
    ["Scale (A3):", 390.8, 273.1, 2.1],
    ["25001", 363, 276.8, 2.79],
    ["S101", 378.3, 276.8, 2.79],
    ["1:100", 396, 276.8, 2.79],
    ["Rev:", 398.5, 281.1, 2.1],
    ["FOR CONSENT", 368, 284, 2.79],
    ["A", 403, 284, 2.79],
  ];
  const t = readTitleBlock(sheetOf(runs));
  it("reads every cell from under its caption, the title even when it is centred away from the caption", () => {
    expect(t.sheetId).toBe("S101");
    expect(t.title).toBe("Beam & Foundation Plan");
    expect(t.revision).toBe("A");
    expect(t.date).toBe("22.01.2026");
    expect(t.project).toBe("25001");
    expect(t.scaleNotes).toEqual(["1:100"]);
  });
});

describe("blocks that are not the sheet's own", () => {
  it("ignores a drawing index's column heading ('ID | Layout Name') as a title caption", () => {
    const rows: Run[] = [["Drawing Index", 360.1, 19.9, 2.74], ["ID", 364.7, 23.9, 2.74], ["Layout Name", 374.1, 23.9, 2.74]];
    for (let i = 0; i < 8; i++) rows.push([`A0${i}.1`, 362.5, 31.9 + i * 4, 2.74], [`Sheet name ${i}`, 374.1, 31.9 + i * 4, 2.74]);
    const t = readTitleBlock(sheetOf([...filler(30), ...rows]));
    expect(t.title).toBeNull();
    expect(t.sheetId).toBeNull();
  });
  it("prefers the block whose captions share the sheet-number caption's size over a pasted-in drawing's own block", () => {
    const runs: Run[] = [
      ...filler(30),
      ["PROJECT No.", 360.3, 8.7, 2.06],
      ["T1234", 405.4, 8.9, 2.74],
      // a pasted-in drawing brought its own little block, in another size, nearer the corner
      ["Job Number:", 383.2, 230.7, 2.17],
      ["99999", 397.1, 230.8, 2.47],
      ["Rev:", 359.3, 256, 2.74],
      ["7", 372, 256, 2.74],
      ["DATE :", 360.3, 278.7, 2.06],
      ["REVISION :", 392.4, 278.7, 2.06],
      ["8/08/2025", 373.2, 278.9, 2.74],
      ["01", 410, 278.9, 2.74],
      ["SHEET NUMBER :", 360.3, 286.5, 2.06],
      ["A5.1", 399, 289.6, 5.5],
    ];
    const t = readTitleBlock(sheetOf(runs));
    expect(t.project).toBe("T1234");
    expect(t.revision).toBe("01");
  });
  it("gives nothing for a page of paragraphs, and never invents a number", () => {
    const runs: Run[] = [];
    for (let i = 0; i < 40; i++) runs.push([`This building consent is issued under the Act, line ${i}.`, 25, 40 + i * 5, 3.3]);
    const t = readTitleBlock(sheetOf(runs, 210, 297));
    expect(t).toEqual({
      sheetId: null,
      title: null,
      scaleNotes: [],
      revision: null,
      date: null,
      project: null,
      consent: { approved: false, number: null, authority: null },
      draft: false,
      textIds: [],
    });
  });
});

describe("a title block rotated to run down the right edge", () => {
  // Text reads bottom→top (angle 90) at the right edge of the page.
  const runs: Run[] = [
    ...filler(30),
    ["SHEET NO.", 409, 250, 2.1, 90],
    ["A-101", 412, 232, 5, 90],
    ["SCALE", 409, 200, 2.1, 90],
    ["1:50", 411, 190, 3, 90],
    ["REV", 409, 150, 2.1, 90],
    ["C", 411, 140, 3, 90],
  ];
  const t = readTitleBlock(sheetOf(runs));
  it("reads the same fields as an upright block", () => {
    expect(t.sheetId).toBe("A-101");
    expect(t.revision).toBe("C");
    expect(t.scaleNotes).toEqual(["1:50"]);
  });
});

describe("council approval printed as text", () => {
  const stamp = (s: string, extra: Run[] = []) => readTitleBlock(sheetOf([...filler(10), [s, 412, 260, 3, 90], ...extra])).consent;

  it("reads an APPROVED stamp with authority and consent number", () => {
    expect(stamp("Sample District Council, BC12345. APPROVED. THESE PLANS MUST REMAIN ONSITE.")).toEqual({
      approved: true,
      number: "BC12345",
      authority: "Sample District Council",
    });
    expect(stamp("TESTVILLE CITY COUNCIL APPROVED FOR CONSTRUCTION BC Number: 361794")).toEqual({
      approved: true,
      number: "BC361794",
      authority: "TESTVILLE CITY COUNCIL",
    });
  });
  it("counts a lone APPROVED only when the council or consent number is printed beside it", () => {
    const beside = stamp("APPROVED", [["Sample District Council", 380, 262, 3], ["BC77001", 380, 266, 3]]);
    expect(beside.approved).toBe(true);
    expect(beside.number).toBe("BC77001");
    // a table cell in a schedule
    expect(stamp("APPROVED").approved).toBe(false);
    expect(stamp("Approved building wrap").approved).toBe(false);
  });
  it("reads the consent number off a Form 5 page, without calling the page an approval stamp", () => {
    const form = readTitleBlock(
      sheetOf(
        [
          ["Building Consent", 25, 53, 8.8],
          ["Section 51, Building Act 2004 (Form 5)", 25, 62, 4.6],
          ["BC Number: 987654", 25, 72, 5.3],
        ],
        210,
        297,
      ),
    );
    expect(form.consent).toEqual({ approved: false, number: "BC987654", authority: null });
  });
  it("does not lift another consent's number out of a note on a drawing", () => {
    const note = readTitleBlock(sheetOf([...filler(10), ["Refer to the approved BC report", 295, 251, 2.7], ["BC No. BC55555", 295, 268, 2.7]]));
    expect(note.consent).toEqual({ approved: false, number: null, authority: null });
  });
});

describe("draft marks", () => {
  const draft = (runs: Run[]) => readTitleBlock(sheetOf([...filler(10), ...runs])).draft;
  it("catches DRAFT, PRELIMINARY and NOT FOR CONSTRUCTION", () => {
    expect(draft([["DRAFT ONLY", 200, 150, 20, 45]])).toBe(true);
    expect(draft([["PRELIMINARY", 300, 20, 6]])).toBe(true);
    expect(draft([["NOT FOR CONSTRUCTION", 300, 20, 4]])).toBe(true);
  });
  it("catches a huge tilted watermark cut to 'DRAF'", () => {
    expect(draft([["DRAF", 244, 108, 70, 45]])).toBe(true);
  });
  it("catches a status caption that says so", () => {
    expect(draft([["DWG STATUS", 360, 12.7, 2.06], ["Draft", 391, 12.9, 2.74], ["SHEET NUMBER :", 360.3, 286.5, 2.06], ["A1.1", 399, 289.6, 5.5]])).toBe(true);
  });
  it("is not fooled by ordinary words or headings", () => {
    expect(draft([["drafting", 738, 527, 9.85]])).toBe(false);
    expect(draft([["Draft Compliance Schedule:", 25, 188, 3.9]])).toBe(false);
    expect(draft([["DRAFT STOPPING TO ROOF SPACE SHALL BE PROVIDED TO NZS 3604 REQUIREMENTS", 25, 88, 2.7]])).toBe(false);
    expect(draft([["THESE DRAWINGS SHALL NOT BE USED FOR CONSTRUCTION UNTIL ISSUED", 25, 88, 2.7]])).toBe(false);
  });
});

describe("scale statements", () => {
  const notes = (runs: Run[]) => readTitleBlock(sheetOf([...filler(10), ...runs])).scaleNotes;
  it("collects every scale printed on the sheet, raw, in reading order", () => {
    expect(
      notes([
        ["SCALE 1 : 10", 40, 150, 2.9],
        ["Scale: 1:50", 40, 60, 3.5],
        ["NEW FLOOR PLAN 1:100", 200, 120, 4.2],
        ["1 : 5", 300, 200, 3.5],
        ["As indicated", 10, 280, 3.5],
        ["N.T.S.", 380, 30, 2.8],
      ]),
    ).toEqual(["N.T.S.", "Scale: 1:50", "NEW FLOOR PLAN 1:100", "SCALE 1 : 10", "1 : 5", "As indicated"]);
  });
  it("names the text each statement came from", () => {
    const sh = sheetOf([...filler(10), ["Scale: 1:50", 40, 60, 3.5], ["NEW FLOOR PLAN 1:100", 200, 120, 4.2]]);
    const t = readTitleBlock(sh);
    const idOf = (s: string) => sh.text.find((x) => x.s === s)!.id;
    expect(t.textIds).toEqual(expect.arrayContaining([idOf("Scale: 1:50"), idOf("NEW FLOOR PLAN 1:100")]));
  });
  it("leaves out pipe falls and gradients", () => {
    expect(
      notes([
        ["Ø100mm 1:60", 40, 150, 2.8],
        ["1:100 fall", 40, 60, 2.2],
        ["1:40", 200, 120, 2.7],
        ["Fall", 300, 100, 2.7],
        ["1:50", 300, 110, 2.7],
        ["1:20 shall be classed as T1.", 100, 100, 2.5],
      ]),
    ).toEqual([]);
  });
  it("is not fooled by dates and times that look like ratios", () => {
    expect(notes([["Printed 1:30 pm", 40, 150, 2.5], ["1:20/08/2026", 40, 60, 2.5]])).toEqual([]);
  });
});

describe("value parsers", () => {
  it.each([
    ["A02.3", "A02.3"],
    ["a-101", "A-101"],
    ["S112", "S112"],
    ["SHT 3", "SHT 3"],
    ["sht 12", "SHT 12"],
    ["SHEET S000", "S000"],
    ["A3.2b", "A3.2B"],
  ])("reads %s as sheet %s", (raw, id) => {
    expect(parseSheetId(raw)).toBe(id);
  });
  it.each(["", "Site Plan", "23-0456", "8/08/2025", "1:100", "Proj No.", "3", "The building"])("%s is not a sheet number", (raw) => {
    expect(parseSheetId(raw)).toBeNull();
  });
  it("accepts a bare number only where a caption said 'sheet number'", () => {
    expect(parseSheetId("3", true)).toBe("3");
  });
  it.each([
    ["A", "A"],
    ["01", "01"],
    ["p1", "P1"],
    ["Rev C", "C"],
  ])("reads revision %s as %s", (raw, rev) => {
    expect(parseRevision(raw)).toBe(rev);
  });
  it.each(["", "Issued for consent", "Date", "-"])("%s is not a revision", (raw) => {
    expect(parseRevision(raw)).toBeNull();
  });
});
