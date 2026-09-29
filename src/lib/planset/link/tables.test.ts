import { describe, expect, it } from "vitest";
import type { Segment, SheetRaw, TextItem } from "../types";
import { readSchedules, readTables } from "./tables";

/** A hand-built sheet: words at baselines, thin rules, nothing else. */
function drawing() {
  const text: TextItem[] = [];
  const segs: Segment[] = [];
  const api = {
    text,
    segs,
    word(s: string, x: number, y: number, h = 2.5, angle = 0, w = s.length * h * 0.45): number {
      text.push({ id: text.length, s, x, y, angle, h, w });
      return text.length - 1;
    },
    line(x1: number, y1: number, x2: number, y2: number, w = 0.2, dashed = false) {
      segs.push({ x1, y1, x2, y2, c: "#000000", w, dashed });
    },
    /** Every rule of a full grid. */
    grid(xs: number[], ys: number[]) {
      for (const y of ys) api.line(xs[0], y, xs[xs.length - 1], y);
      for (const x of xs) api.line(x, ys[0], x, ys[ys.length - 1]);
    },
    /** Words in a cell, one line each, the first baseline 3.6 below the row's top rule. */
    cell(xs: number[], ys: number[], col: number, row: number, ...lines: string[]): number[] {
      return lines.map((s, i) => api.word(s, xs[col] + 1.5, ys[row] + 3.6 + i * 3.2));
    },
    sheet(): SheetRaw {
      return { page: 7, widthMm: 420, heightMm: 297, rotate: 0, text, segs, fills: [], images: 0, imageCover: 0 };
    },
  };
  return api;
}

/** A plain schedule: MARK | DESCRIPTION | QTY, three windows, "WINDOW SCHEDULE" above it. */
function windowSchedule(d = drawing(), x0 = 20, y0 = 40) {
  const xs = [x0, x0 + 20, x0 + 80, x0 + 100];
  const ys = [y0, y0 + 6, y0 + 12, y0 + 18, y0 + 24];
  d.grid(xs, ys);
  d.word("WINDOW SCHEDULE", x0, y0 - 4, 4);
  const rows = [
    ["MARK", "DESCRIPTION", "QTY"],
    ["W01", "Aluminium window 1200 x 900", "2"],
    ["W02", "Aluminium window 600 x 900", "1"],
    ["W03 - obscure", "Fixed pane 900 x 900", "4"],
  ];
  const ids = rows.map((row, r) => row.map((s, c) => d.cell(xs, ys, c, r, s)[0]));
  return { d, xs, ys, ids };
}

describe("ruled schedules", () => {
  it("reads a header row, the marks and every field, with the heading above as its title", () => {
    const { d, ids } = windowSchedule();
    const sheet = d.sheet();
    const tables = readTables(sheet);
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({ rows: 4, cols: 3, ruled: true, title: "WINDOW SCHEDULE" });
    expect(tables[0].box).toEqual([20, 40, 120, 64]);
    expect(tables[0].cells.find((c) => c.row === 1 && c.col === 1)).toMatchObject({ text: "Aluminium window 1200 x 900", textIds: [ids[1][1]] });

    const schedules = readSchedules(sheet);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ kind: "windows", title: "WINDOW SCHEDULE", page: 7, transposed: false, headers: ["mark", "description", "qty"] });
    expect(schedules[0].records.map((r) => r.mark)).toEqual(["W01", "W02", "W03"]);
    expect(schedules[0].records[0]).toEqual({ mark: "W01", fields: { mark: "W01", description: "Aluminium window 1200 x 900", qty: "2" }, textIds: ids[1] });
    // "W03 - obscure" keeps its own words in the field; the mark is the identifier.
    expect(schedules[0].records[2].fields.mark).toBe("W03 - obscure");
  });

  it("reads a transposed schedule: fields down the first column, one record per further column", () => {
    const d = drawing();
    const xs = [20, 60, 90, 120];
    const ys = [30, 36, 42, 48, 54, 84, 114];
    d.grid(xs, ys);
    const labels = ["Element ID", "Quantity", "W x H Size", "Orientation", "2D Plan Preview", "View from Opening Side (Internal)"];
    labels.forEach((s, r) => d.cell(xs, ys, 0, r, s));
    [
      ["W01", "1", "610×1,210", "L"],
      ["W02", "1", "1,210×610", "R"],
    ].forEach((col, i) => col.forEach((s, r) => d.cell(xs, ys, i + 1, r, s)));
    // The drawing's own dimension numbers sit in the tall picture rows; a written note is real text.
    d.word("1,210", 66, 100);
    d.word("610", 78, 110);
    d.word("Confirm on site", 92, 70);
    d.word("Window Schedule", 300, 280, 4.5);
    const sheet = d.sheet();

    const tables = readTables(sheet);
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({ rows: 6, cols: 3, title: null });

    const [schedule] = readSchedules(sheet);
    expect(schedule).toMatchObject({ kind: "windows", title: "Window Schedule", transposed: true });
    expect(schedule.headers).toEqual(["element id", "quantity", "w x h size", "orientation", "2d plan preview", "view from opening side (internal)"]);
    expect(schedule.records.map((r) => r.mark)).toEqual(["W01", "W02"]);
    expect(schedule.records[0].fields).toEqual({ "element id": "W01", quantity: "1", "w x h size": "610×1,210", orientation: "L" });
    expect(schedule.records[1].fields["2d plan preview"]).toBe("Confirm on site");
    expect(schedule.records[1].fields["view from opening side (internal)"]).toBeUndefined();
  });

  it("joins wrapped lines inside a cell in reading order, and takes the band across the top as the title", () => {
    const d = drawing();
    const xs = [20, 45, 140];
    const ys = [20, 28, 34, 40, 52.7, 58.7, 68.2];
    d.line(20, 20, 140, 20);
    for (const y of ys.slice(1)) d.line(20, y, 140, y);
    d.line(20, 20, 20, 68.2);
    d.line(140, 20, 140, 68.2);
    d.line(45, 28, 45, 68.2);
    d.word("STRUCTURAL WALL SCHEDULE", 55, 26, 4);
    d.cell(xs, ys.slice(1), 0, 0, "MARK");
    d.cell(xs, ys.slice(1), 1, 0, "REMARKS");
    d.cell(xs, ys.slice(1), 0, 1, "BW1");
    d.cell(xs, ys.slice(1), 1, 1, "140 TIMBER STUD WALL");
    d.cell(xs, ys.slice(1), 0, 2, "BW2");
    d.cell(xs, ys.slice(1), 1, 2, "150 STUD WALL WITH 12mm PLYWOOD BRACING (PARTIAL", "HEIGHT) FIXED AT 150CRS EDGES, 300CRS FIELD. MAX", "2.4m HIGH");
    d.cell(xs, ys.slice(1), 0, 3, "NW1");
    d.cell(xs, ys.slice(1), 1, 3, "100W x 200H CONCRETE NIB");
    d.cell(xs, ys.slice(1), 0, 4, "W3");
    d.cell(xs, ys.slice(1), 1, 4, "90 INTERNAL WALL (NON BRACING). REFER S360", "FOR STUD SCHEDULE.");

    const sheet = d.sheet();
    const [table] = readTables(sheet);
    expect(table).toMatchObject({ title: "STRUCTURAL WALL SCHEDULE", rows: 5, cols: 2 });
    expect(table.box).toEqual([20, 28, 140, 68.2]);
    const [schedule] = readSchedules(sheet);
    expect(schedule.kind).toBe("walls");
    expect(schedule.records.map((r) => r.mark)).toEqual(["BW1", "BW2", "NW1", "W3"]);
    expect(schedule.records[1].fields.remarks).toBe("150 STUD WALL WITH 12mm PLYWOOD BRACING (PARTIAL HEIGHT) FIXED AT 150CRS EDGES, 300CRS FIELD. MAX 2.4m HIGH");
    expect(schedule.records[3].fields.remarks).toBe("90 INTERNAL WALL (NON BRACING). REFER S360 FOR STUD SCHEDULE.");
  });

  it("keeps a notes panel beside a table out of it", () => {
    const { d, ids } = windowSchedule();
    const panel = [
      d.word("2.0 Site General", 150, 44, 3),
      d.word("Confirm levels on site. Setting out", 150, 50),
      d.word("to be checked.", 150, 53),
      d.word("Walls", 150, 60),
      d.word("R2.2 glass-wool batts", 165, 60),
      d.word("Ceiling", 150, 63),
      d.word("R3.6 glass-wool batts", 165, 63),
      d.word("Floor", 150, 66),
      d.word("R1.3 foil underlay", 165, 66),
    ];
    const sheet = d.sheet();
    const tables = readTables(sheet);
    expect(tables).toHaveLength(1);
    const inTable = new Set(tables[0].cells.flatMap((c) => c.textIds));
    for (const id of panel) expect(inTable.has(id)).toBe(false);
    expect(inTable.size).toBe(ids.flat().length);
    expect(readSchedules(sheet)).toHaveLength(1);
  });

  it("finds the divider nobody drew from where the cell borders break", () => {
    // One label column and two value columns; the rule between the label and the first value is missing,
    // but every horizontal border is drawn cell by cell, so each one breaks at x = 40.
    const d = drawing();
    const xs = [20, 40, 100, 120];
    const ys = [30, 36, 42, 48, 54];
    for (const y of ys) for (let i = 0; i + 1 < xs.length; i++) d.line(xs[i], y, xs[i + 1], y);
    for (const x of [20, 100, 120]) d.line(x, 30, x, 54);
    ["Element ID", "Quantity", "Size", "Orientation"].forEach((s, r) => d.cell(xs, ys, 0, r, s));
    d.word("D21", 84, 33.6);
    d.word("D22", 106, 33.6);
    d.word("1", 90, 39.6);
    d.word("1", 111, 39.6);
    d.word("860×2,100", 78, 45.6);
    d.word("760×2,040", 104, 45.6);
    d.word("L", 92, 51.6);
    d.word("R", 112, 51.6);
    const [schedule] = readSchedules(d.sheet());
    expect(schedule).toMatchObject({ transposed: true });
    expect(schedule.records.map((r) => r.mark)).toEqual(["D21", "D22"]);
    expect(schedule.records[0].fields).toMatchObject({ "element id": "D21", size: "860×2,100", orientation: "L" });
  });

  it("leaves out an empty column made by rules that overhang the table", () => {
    const d = drawing();
    const xs = [20, 40, 100, 120];
    const ys = [40, 46, 52];
    d.grid(xs, ys);
    d.line(10, 40, 20, 40);
    d.line(10, 46, 20, 46);
    d.line(10, 52, 20, 52);
    d.line(120, 40, 132, 40);
    d.line(120, 46, 132, 46);
    d.line(120, 52, 132, 52);
    ["MARK", "SIZE", "QTY"].forEach((s, c) => d.cell(xs, ys, c, 0, s));
    ["W01", "1200x900", "2"].forEach((s, c) => d.cell(xs, ys, c, 1, s));
    const [table] = readTables(d.sheet());
    expect(table).toMatchObject({ rows: 2, cols: 3 });
    expect(table.box).toEqual([20, 40, 120, 52]);
  });

  it("splits two schedules that share rules but have different columns", () => {
    const d = drawing();
    d.line(20, 30, 20, 66);
    d.line(140, 30, 140, 66);
    for (const y of [30, 36, 42, 48, 54, 60, 66]) d.line(20, y, 140, y);
    for (const x of [60, 100]) d.line(x, 30, x, 48);
    for (const x of [50, 80]) d.line(x, 48, x, 66);
    const top = [20, 60, 100, 140];
    const bottom = [20, 50, 80, 140];
    ["MARK", "SIZE", "QTY"].forEach((s, c) => d.cell(top, [30, 36], c, 0, s));
    ["W01", "1200x900", "2"].forEach((s, c) => d.cell(top, [36, 42], c, 0, s));
    ["W02", "600x900", "1"].forEach((s, c) => d.cell(top, [42, 48], c, 0, s));
    ["ID", "TYPE", "NOTES"].forEach((s, c) => d.cell(bottom, [48, 54], c, 0, s));
    ["D01", "Hinged", "Fire door"].forEach((s, c) => d.cell(bottom, [54, 60], c, 0, s));
    ["D02", "Sliding", "Cavity"].forEach((s, c) => d.cell(bottom, [60, 66], c, 0, s));
    const tables = readTables(d.sheet());
    expect(tables.map((t) => [t.rows, t.cols])).toEqual([
      [3, 3],
      [3, 3],
    ]);
    const schedules = readSchedules(d.sheet());
    expect(schedules.map((s) => s.records.map((r) => r.mark))).toEqual([
      ["W01", "W02"],
      ["D01", "D02"],
    ]);
  });

  it("carries a record over the rows its merged mark cell spans, and takes marks the way drawings print them", () => {
    const d = drawing();
    const xs = [20, 50, 100, 140];
    const ys = [30, 36, 42, 48, 54, 60];
    // The rule under the first row of "W1 & W2" stops short of the first column: that cell spans two rows.
    for (const y of ys) d.line(y === 42 ? 50 : 20, y, 140, y);
    for (const x of xs) d.line(x, 30, x, 60);
    ["MARK", "BUILDING", "NAILS"].forEach((s, c) => d.cell(xs, ys, c, 0, s));
    d.cell(xs, ys, 0, 1, "W1 & W2");
    d.cell(xs, ys, 1, 1, "HOUSE");
    d.cell(xs, ys, 2, 1, "1 ROW AT 60CRS");
    d.cell(xs, ys, 1, 2, "GARAGE");
    d.cell(xs, ys, 2, 2, "1 ROW AT 50CRS");
    d.cell(xs, ys, 0, 3, "D14 - 2/190x45 SG8");
    d.cell(xs, ys, 1, 3, "OFFICE");
    d.cell(xs, ys, 0, 4, "P1 (2)");
    d.cell(xs, ys, 1, 4, "SHED");
    const [schedule] = readSchedules(d.sheet());
    expect(schedule.records.map((r) => r.mark)).toEqual(["W1 & W2", "D14", "P1"]);
    expect(schedule.records[0].fields).toMatchObject({ mark: "W1 & W2", building: "HOUSE\nGARAGE", nails: "1 ROW AT 60CRS\n1 ROW AT 50CRS" });
    expect(schedule.records[1].fields.mark).toBe("D14 - 2/190x45 SG8");
  });

  it("reads a titled table with no header row when its first column is all marks", () => {
    const d = drawing();
    const xs = [20, 40, 100];
    const ys = [40, 46, 52];
    d.grid(xs, ys);
    d.word("Post Table", 20, 37, 3.5);
    d.cell(xs, ys, 0, 0, "P4 (3)");
    d.cell(xs, ys, 1, 0, "3 H3.2 studs");
    d.cell(xs, ys, 0, 1, "P5");
    d.cell(xs, ys, 1, 1, "100x100 H5");
    const [schedule] = readSchedules(d.sheet());
    expect(schedule).toMatchObject({ kind: "columns", title: "Post Table", headers: ["mark", "column 2"] });
    expect(schedule.records.map((r) => [r.mark, r.fields["column 2"]])).toEqual([
      ["P4", "3 H3.2 studs"],
      ["P5", "100x100 H5"],
    ]);
  });

  it("reads a header row with a blank first cell above a column of marks, and a blank corner above a row of them", () => {
    const d = drawing();
    const xs = [20, 40, 100, 120];
    const ys = [40, 46, 52, 58];
    d.grid(xs, ys);
    ["Size", "Qty"].forEach((s, c) => d.cell(xs, ys, c + 1, 0, s));
    ["D01", "1800x2100", "1"].forEach((s, c) => d.cell(xs, ys, c, 1, s));
    ["D02", "2400x2100", "2"].forEach((s, c) => d.cell(xs, ys, c, 2, s));
    const [rows] = readSchedules(d.sheet());
    expect(rows.records.map((r) => r.mark)).toEqual(["D01", "D02"]);
    expect(rows.records[1].fields).toEqual({ "column 1": "D02", size: "2400x2100", qty: "2" });

    const t = drawing();
    const xt = [20, 50, 80, 110];
    const yt = [40, 46, 52, 58];
    t.grid(xt, yt);
    ["W1", "W2"].forEach((s, c) => t.cell(xt, yt, c + 1, 0, s));
    ["Width", "Height"].forEach((s, r) => t.cell(xt, yt, 0, r + 1, s));
    ["900", "1200", "1200", "1200"].forEach((s, i) => t.cell(xt, yt, (i % 2) + 1, Math.floor(i / 2) + 1, s));
    const [cols] = readSchedules(t.sheet());
    expect(cols.transposed).toBe(true);
    expect(cols.records.map((r) => [r.mark, r.fields.width, r.fields.height])).toEqual([
      ["W1", "900", "1200"],
      ["W2", "1200", "1200"],
    ]);
  });

  it("reads two transposed schedules that share one grid, each starting where its mark row's label comes round", () => {
    const d = drawing();
    const xs = [20, 50, 80, 110];
    const ys = [40, 46, 52, 58, 64, 70];
    d.grid(xs, ys);
    const rows = [
      ["Element ID", "W01", "W02"],
      ["Size", "900x1200", "600x600"],
      ["Sill", "750", "1450"],
      ["Element ID", "W03", "W04"],
      ["Size", "1500x1200", "800x800"],
    ];
    rows.forEach((row, r) => row.forEach((s, c) => d.cell(xs, ys, c, r, s)));
    const schedules = readSchedules(d.sheet());
    expect(schedules.map((s) => s.records.map((r) => r.mark))).toEqual([
      ["W01", "W02"],
      ["W03", "W04"],
    ]);
    expect(schedules[1].records[0].fields).toEqual({ "element id": "W03", size: "1500x1200" });
  });

  it("reads a drawing list keyed by its drawing numbers", () => {
    const d = drawing();
    const xs = [20, 45, 120, 130];
    const ys = [30, 36, 42, 48];
    d.grid(xs, ys);
    d.word("DRAWING LIST", 20, 27, 4);
    ["DRG No.", "SHEET NAME", "REV"].forEach((s, c) => d.cell(xs, ys, c, 0, s));
    ["A100", "SITE PLAN", "1"].forEach((s, c) => d.cell(xs, ys, c, 1, s));
    ["A101", "FLOOR PLAN - LEVEL 1", "2"].forEach((s, c) => d.cell(xs, ys, c, 2, s));
    const [schedule] = readSchedules(d.sheet());
    expect(schedule.kind).toBe("drawing_list");
    expect(schedule.records.map((r) => r.mark)).toEqual(["A100", "A101"]);
    expect(schedule.records[1].fields).toEqual({ "drg no.": "A101", "sheet name": "FLOOR PLAN - LEVEL 1", rev: "2" });
  });
});

describe("reference material", () => {
  it("tags a pasted-in standards table so it is never read as a job schedule", () => {
    const d = drawing();
    const xs = [20, 50, 90];
    const ys = [40, 46, 52, 58];
    d.grid(xs, ys);
    d.word("Table 8.14 – Lintel fixing (see 8.6.1.8)", 20, 36, 3);
    d.word("NZS 3604:2011", 100, 36, 2);
    ["MARK", "SPAN"].forEach((s, c) => d.cell(xs, ys, c, 0, s));
    ["L1", "2.4"].forEach((s, c) => d.cell(xs, ys, c, 1, s));
    ["L2", "1.8"].forEach((s, c) => d.cell(xs, ys, c, 2, s));
    const [schedule, ...rest] = readSchedules(d.sheet());
    expect(rest).toEqual([]);
    expect(schedule).toMatchObject({ kind: "reference_standard", records: [], headers: [] });
    expect(readTables(d.sheet())).toHaveLength(1);
  });

  it("recognises a copyright line under the table, and leaves an ordinary lintel schedule alone", () => {
    const d = drawing();
    const xs = [20, 50, 90];
    const ys = [40, 46, 52];
    d.grid(xs, ys);
    ["MARK", "SIZE"].forEach((s, c) => d.cell(xs, ys, c, 0, s));
    ["L1", "300x90"].forEach((s, c) => d.cell(xs, ys, c, 1, s));
    d.word("COPYRIGHT © Standards New Zealand", 20, 58, 2);
    expect(readSchedules(d.sheet())[0].kind).toBe("reference_standard");

    const plain = windowSchedule().d;
    expect(readSchedules(plain.sheet())[0].kind).toBe("windows");
  });
});

describe("unruled blocks", () => {
  /** A "Schedule of Finishes" typed straight onto a plan: room names at the left, finishes beside them. */
  function finishesBlock() {
    const d = drawing();
    const h = 2.46;
    d.word("Schedule of Finishes", 27.6, 205.2, h);
    const rows: Array<[number, string | null, string]> = [
      [210.9, "wc", "painted plasterboard walls - tiled to 1.2m"],
      [213.8, null, "tiled floor over waterproof membrane"],
      [216.7, null, "painted plasterboard ceiling"],
      [219.6, null, "wall-hung basin + mirror"],
      [225.2, "kitchen", "painted plasterboard walls"],
      [228.1, null, "vinyl plank flooring"],
      [231.0, null, "laminate bench top + tiled splashback"],
      [236.7, "bed 1", "painted plasterboard walls"],
      [239.6, "robe", "carpet on underlay"],
      [245.3, "lounge", "painted plasterboard walls"],
      [248.2, "dining", "engineered timber flooring"],
      [253.9, "dining /", "painted plasterboard walls"],
      [256.8, "study", "engineered timber flooring"],
      [262.5, "hall", "painted plasterboard walls"],
      [265.4, null, "carpet on underlay"],
    ];
    for (const [y, name, finish] of rows) {
      if (name) d.word(name, 27.6, y, h);
      d.word(finish, 40.8, y, h);
    }
    // The rest of the plan: figures and labels that happen to sit on the same baselines.
    d.word("9.60m2", 118.4, 225.0, 2.8);
    d.word("31.2", 118.6, 228.0, 2.8);
    d.word("SITE PLAN 1:200", 178.2, 248.1, 4.2);
    return d;
  }

  it("reads column-aligned text under a schedule title: a short left token opens each record", () => {
    const sheet = finishesBlock().sheet();
    const tables = readTables(sheet);
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({ ruled: false, title: "Schedule of Finishes", rows: 6, cols: 2 });
    expect(tables[0].cells.filter((c) => c.col === 0).map((c) => c.text)).toEqual(["wc", "kitchen", "bed 1 robe", "lounge dining", "dining / study", "hall"]);
    expect(tables[0].cells.find((c) => c.row === 2 && c.col === 1)?.text).toBe("painted plasterboard walls carpet on underlay");
  });

  it("still splits a room name that sits close to its finishes", () => {
    const d = finishesBlock();
    // A wide name printed 0.9 font-heights from the finish beside it: the columns are read from the other lines.
    d.word("laundry", 27.6, 270.6, 2.46, 0, 12.9);
    d.word("painted plasterboard walls", 40.8, 270.6, 2.46);
    const tables = readTables(d.sheet());
    expect(tables).toHaveLength(1);
    expect(tables[0].cells.filter((c) => c.col === 0).map((c) => c.text).slice(-2)).toEqual(["hall", "laundry"]);
    expect(tables[0].cells.filter((c) => c.col === 1).pop()?.text).toBe("painted plasterboard walls");
  });

  it("reads a finishes schedule of a single room, and leaves the block set beside it alone", () => {
    const d = drawing();
    const h = 3.17;
    d.word("FINISHES SCHEDULE", 203.8, 76.1, h);
    d.word("PAINTING", 289.8, 76.3, h);
    // The name ends 0.85 font-heights before its first finish.
    d.word("WC / SH", 203.8, 83.4, h, 0, 12.5);
    const finishes = ["PAINTED PLASTERBOARD WALLS", "VINYL FLOORING", "ACRYLIC SHOWER BASE", "GLASS SHOWER SCREEN", "MOULDED VANITY TOP"];
    const notes = ["Use low-VOC paints where applicable.", "Wet area lining paint system", "1st coat surface sealer", "2nd coat semi-gloss enamel", "3rd coat semi-gloss enamel"];
    finishes.forEach((s, i) => d.word(s, 219, 83.4 + i * 3.65, h));
    notes.forEach((s, i) => d.word(s, 289.8, 83.6 + i * 3.65, h));
    const sheet = d.sheet();
    expect(readTables(sheet)).toHaveLength(1);
    const [schedule] = readSchedules(sheet);
    expect(schedule).toMatchObject({ kind: "finishes", title: "FINISHES SCHEDULE" });
    expect(schedule.records).toHaveLength(1);
    expect(schedule.records[0].mark).toBe("WC / SH");
    expect(schedule.records[0].fields.finishes).toBe(finishes.join("\n"));
  });

  it("makes each room a finishes record with one finish per line", () => {
    const [schedule] = readSchedules(finishesBlock().sheet());
    expect(schedule).toMatchObject({ kind: "finishes", title: "Schedule of Finishes", headers: ["room", "finishes"] });
    expect(schedule.records.map((r) => r.mark)).toEqual(["wc", "kitchen", "bed 1 robe", "lounge dining", "dining / study", "hall"]);
    expect(schedule.records[1].fields.finishes).toBe("painted plasterboard walls\nvinyl plank flooring\nlaminate bench top + tiled splashback");
    expect(schedule.records[0].fields.finishes.split("\n")).toHaveLength(4);
    // A name that wraps keeps its printed lines in the "room" field.
    expect(schedule.records[2].fields.room).toBe("bed 1\nrobe");
    expect(schedule.records[4].fields.room).toBe("dining /\nstudy");
  });

  it("reads an unruled schedule that has a header row like a ruled one", () => {
    const d = drawing();
    d.word("Door Schedule", 20, 40, 3.5);
    const rows = [
      ["Mark", "Size", "Qty"],
      ["D01", "1800x2100", "1"],
      ["D02", "2400x2100", "2"],
      ["D03", "820x2040", "6"],
    ];
    rows.forEach((row, i) => row.forEach((s, c) => d.word(s, [20, 50, 90][c], 48 + i * 4)));
    const [schedule] = readSchedules(d.sheet());
    expect(schedule).toMatchObject({ kind: "doors", headers: ["mark", "size", "qty"] });
    expect(schedule.records.map((r) => [r.mark, r.fields.size, r.fields.qty])).toEqual([
      ["D01", "1800x2100", "1"],
      ["D02", "2400x2100", "2"],
      ["D03", "820x2040", "6"],
    ]);
    expect(readTables(d.sheet())[0]).toMatchObject({ ruled: false, title: "Door Schedule", rows: 4, cols: 3 });
  });

  it("does not make a table out of notes, however they line up", () => {
    const d = drawing();
    // A paragraph.
    ["All work shall comply with the New Zealand", "Building Code and the approved documents.", "Contractor to confirm all dimensions on site", "before ordering materials or starting work."].forEach((s, i) => d.word(s, 20, 30 + i * 3));
    // A numbered list under a notes heading: two aligned columns, but a list.
    d.word("GENERAL NOTES", 20, 60, 3.5);
    ["All timber to be H1.2 treated.", "Concrete to be 25 MPa minimum.", "Fixings to be galvanised.", "Refer engineer for bracing."].forEach((s, i) => {
      d.word(`${i + 1}.`, 20, 66 + i * 3);
      d.word(s, 28, 66 + i * 3);
    });
    // Notes numbered down the left, under a heading that says finishes.
    d.word("Finishes", 20, 78, 3.5);
    ["Paint all walls two coats.", "Seal timber floors.", "Tile splashbacks to bench."].forEach((s, i) => {
      d.word(`${i + 1}.`, 20, 84 + i * 3);
      d.word(s, 28, 84 + i * 3);
    });
    // A sentence that mentions a schedule, above two columns of text.
    d.word("Refer to plate fixing schedule.", 20, 90);
    ["Lintel", "Stud numbers", "Trimmer", "Jack stud"].forEach((s, i) => {
      d.word(s, 20, 96 + i * 3);
      d.word(`${i + 2} nails each side of the opening`, 50, 96 + i * 3);
    });
    const sheet = d.sheet();
    expect(readTables(sheet)).toEqual([]);
    expect(readSchedules(sheet)).toEqual([]);
  });
});

describe("what is not a table", () => {
  it("ignores a sheet border round a drawing, and finds the schedule beside it", () => {
    const d = drawing();
    d.line(10, 10, 410, 10);
    d.line(10, 287, 410, 287);
    d.line(10, 10, 10, 287);
    d.line(410, 10, 410, 287);
    d.line(300, 250, 410, 250);
    d.line(300, 250, 300, 287);
    d.line(350, 250, 350, 287);
    for (let i = 0; i < 40; i++) d.word(`label ${i}`, 30 + (i % 8) * 30, 40 + Math.floor(i / 8) * 30);
    d.word("PROJECT", 305, 256);
    d.word("SHEET", 355, 256);
    // Not touching the border: a schedule.
    const xs = [320, 345, 400];
    const ys = [60, 66, 72];
    d.grid(xs, ys);
    ["MARK", "REMARKS"].forEach((s, c) => d.cell(xs, ys, c, 0, s));
    ["S1", "300 RC RIBRAFT"].forEach((s, c) => d.cell(xs, ys, c, 1, s));
    const tables = readTables(d.sheet());
    expect(tables.map((t) => t.box)).toEqual([[320, 60, 400, 72]]);
  });

  it("ignores a lattice of drawing lines that cuts through its own labels", () => {
    const d = drawing();
    const xs = [20, 80, 140, 200, 260];
    const ys = [20, 50, 80, 110];
    d.grid(xs, ys);
    xs.slice(1, 4).forEach((x, i) => {
      d.word(`grid line ${i}`, x - 6, 35);
      d.word(`level ${i}`, x - 5, 65);
      d.word(`tag ${i}`, x - 4, 95);
    });
    expect(readTables(d.sheet())).toEqual([]);
  });

  it("ignores dashed and heavy strokes, and sheets with no rules at all", () => {
    const dashed = drawing();
    dashed.grid([20, 40, 100], [40, 46, 52]);
    dashed.segs.forEach((s) => (s.dashed = true));
    dashed.word("MARK", 21, 43.6);
    dashed.word("W01", 21, 49.6);
    dashed.word("SIZE", 41, 43.6);
    dashed.word("900", 41, 49.6);
    expect(readTables(dashed.sheet())).toEqual([]);

    const heavy = drawing();
    heavy.grid([20, 40, 100], [40, 46, 52]);
    heavy.segs.forEach((s) => (s.w = 1.6));
    heavy.word("MARK", 21, 43.6);
    heavy.word("W01", 21, 49.6);
    heavy.word("SIZE", 41, 43.6);
    heavy.word("900", 41, 49.6);
    expect(readTables(heavy.sheet())).toEqual([]);

    expect(readTables(drawing().sheet())).toEqual([]);
    expect(readSchedules(drawing().sheet())).toEqual([]);
  });
});
