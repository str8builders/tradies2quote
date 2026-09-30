import { describe, expect, it } from "vitest";
import type { TextItem } from "../types";
import type { Mark } from "../link/marks";
import type { WallLine } from "../measure/walls";
import type { BuildingModel, ModelOpening } from "./types";
import { PLAN_SIZE_SOURCE, lintelSpecOf, parsePlanSize, readPlanSizes, withPlanSizes, type PlanSizeSheet } from "./planSizes";

describe("parsePlanSize", () => {
  it("reads sizes that say which number is the height", () => {
    expect(parsePlanSize("800h x 600w")).toEqual({ widthMm: 600, heightMm: 800, pair: null, kind: null });
    expect(parsePlanSize("1,200H × 1,810W")).toEqual({ widthMm: 1810, heightMm: 1200, pair: null, kind: null });
    expect(parsePlanSize("600w x 800h")).toMatchObject({ widthMm: 600, heightMm: 800 });
    expect(parsePlanSize("H 2100 x W 1800 ranch slider")).toMatchObject({ widthMm: 1800, heightMm: 2100, kind: "door" });
    expect(parsePlanSize("1200 high x 900 wide obscure")).toMatchObject({ widthMm: 900, heightMm: 1200, kind: null });
    expect(parsePlanSize("800h x 600w awning")).toMatchObject({ kind: "window" });
  });

  it("keeps a bare pair for the wall gap to settle", () => {
    expect(parsePlanSize("2100 x 810")).toEqual({ widthMm: null, heightMm: null, pair: [2100, 810], kind: null });
  });

  it("leaves timber sizes, tiles, fixtures and nonsense alone", () => {
    for (const s of ["140 x 90 sg8 lintel", "90x45", "600x600 tiles", "shaving cabinet 800h x 600w", "125 x 125", "8000h x 600w", "800h x 600w vanity", "Section 1200 x 800 A"]) {
      expect(parsePlanSize(s), s).toBeNull();
    }
  });
});

describe("lintelSpecOf", () => {
  it("takes the size and grade printed with the word lintel", () => {
    expect(lintelSpecOf("140 x 90 sg8 lintel")).toBe("140 x 90 SG8");
    expect(lintelSpecOf("LINTEL: 2/290x45 SG8 h1.2")).toBe("2/290x45 SG8 H1.2");
    expect(lintelSpecOf("lintel over")).toBeNull();
    expect(lintelSpecOf("140 x 90 sg8")).toBeNull();
  });
});

// Page mm at 1:50: 1 page mm is 50 real mm.
const text = (id: number, s: string, x: number, y: number, angle = 0, w = s.length * 1.3, h = 2.5): TextItem => ({ id, s, x, y, angle, h, w });
const wall = (over: Partial<WallLine> & Pick<WallLine, "id" | "orientation" | "at" | "from" | "to">): WallLine => ({
  thicknessMm: 90,
  colour: "#404040",
  pieceIds: [],
  gaps: [],
  lengthMm: Math.round((over.to - over.from) * 50),
  external: true,
  ...over,
});
const sheet = (texts: TextItem[], lines: WallLine[], marks: Mark[] = []): PlanSizeSheet => ({ page: 15, text: texts, marks, walls: { ratio: 50, lines } });

/** The owner's addition, as read: the new outside wall stops where the window meets the existing house. */
const addition = () =>
  sheet(
    [
      text(1, "800h x 600w", 282.84, 455.55, 90, 16.41, 3.54),
      text(2, "Safety Glass", 287.0, 455.6, 90, 17.5, 3.54),
      text(3, "140 x 90 sg8 lintel", 262.6, 456.7, 90, 26, 3.5),
      text(4, "o1 : BL1 : 1.0m", 266.3, 439.0, 90, 20, 3.5),
    ],
    [
      wall({ id: 8, orientation: "v", at: 269.7, from: 167.2, to: 440.3, gaps: [{ from: 369.3, to: 417.0, widthMm: 2384 }] }),
      wall({ id: 9, orientation: "v", at: 272.6, from: 417.0, to: 440.3 }),
    ],
  );

describe("readPlanSizes", () => {
  it("reads the addition's window with the lintel and glazing printed beside it, marked for checking", () => {
    const { openings, flags } = readPlanSizes(addition());
    expect(openings).toHaveLength(1);
    expect(openings[0]).toMatchObject({
      mark: "W1",
      kind: "window",
      widthMm: 600,
      heightMm: 800,
      lintel: "140 x 90 SG8",
      fields: { source: PLAN_SIZE_SOURCE, size: "800h x 600w", glazing: "Safety Glass" },
      planPage: 15,
      schedulePage: null,
      wall: null,
      sizeCheck: "unchecked",
    });
    expect(openings[0].evidence[0].text).toEqual([1, 3, 2]);
    expect(flags.map((f) => [f.id, f.level])).toEqual([
      ["plan-sizes", "info"],
      ["plan-size-unchecked-W1", "check"],
    ]);
    expect(flags[0].message).toContain("1 window");
  });

  it("checks a size against the gap beside it: a bare pair counts when one number is the gap's width", () => {
    const { openings, flags } = readPlanSizes(
      sheet(
        [text(1, "2100 x 810", 95, 104), text(2, "1200h x 1800w", 40, 58)],
        [
          wall({ id: 1, orientation: "h", at: 100, from: 50, to: 150, external: false, gaps: [{ from: 90, to: 106.2, widthMm: 810 }] }),
          wall({ id: 2, orientation: "h", at: 60, from: 0, to: 120, gaps: [{ from: 30, to: 66, widthMm: 1800 }] }),
        ],
      ),
    );
    expect(openings.map((o) => [o.mark, o.kind, o.widthMm, o.heightMm, o.sizeCheck, o.wall?.line, o.wall?.external])).toEqual([
      ["W1", "window", 1800, 1200, "ok", 2, true],
      ["D1", "door", 810, 2100, "ok", 1, false],
    ]);
    expect(flags.map((f) => f.id)).toEqual(["plan-sizes"]);
  });

  it("drops a bare pair with no gap to check it, and a size printed beside a mirror", () => {
    const lines = [wall({ id: 1, orientation: "h", at: 100, from: 50, to: 150, gaps: [{ from: 90, to: 106.2, widthMm: 810 }] })];
    expect(readPlanSizes(sheet([text(1, "1500 x 900", 60, 104)], lines)).openings).toEqual([]);
    expect(readPlanSizes(sheet([text(1, "900h x 600w", 60, 104), text(2, "Mirror", 60, 107.5)], lines)).openings).toEqual([]);
  });

  it("uses the plan's own mark when one sits beside the size", () => {
    const own: Mark = { id: "W3", textId: 9, x: 283, y: 462, spec: null, family: "window" };
    const s = addition();
    const { openings } = readPlanSizes({ ...s, marks: [own] });
    expect(openings[0].mark).toBe("W3");
    expect(openings[0].evidence[0].text).toContain(9);
  });
});

describe("withPlanSizes", () => {
  const facts = (page: number) => {
    const s = addition();
    return { page, text: s.text as TextItem[], marks: [] as Mark[], walls: { ratio: 50, lines: s.walls.lines as WallLine[] } as never };
  };
  const model = (openings: ModelOpening[], wallsPage = 15) => ({ openings, flags: [], walls: { page: wallsPage } }) as unknown as BuildingModel;

  it("reads the measured plan only, so a window labelled on two sheets counts once", () => {
    const out = withPlanSizes(model([]), [facts(13), facts(15)]);
    expect(out.openings.map((o) => [o.mark, o.planPage])).toEqual([["W1", 15]]);
  });

  it("leaves a set with scheduled windows and doors alone", () => {
    const scheduled = [{ mark: "W01" } as ModelOpening];
    expect(withPlanSizes(model(scheduled), [facts(15)]).openings).toBe(scheduled);
  });
});
