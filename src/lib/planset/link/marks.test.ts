import { describe, expect, it } from "vitest";
import type { TextItem } from "../types";
import { countMarks, familyOf, readMarks } from "./marks";

let id = 0;
const t = (s: string, x = 10, y = 10): TextItem => ({ id: id++, s, x, y, angle: 0, h: 2.5, w: s.length * 1.4 });

describe("readMarks", () => {
  it("reads bare marks and marks with a spec", () => {
    const marks = readMarks({
      text: [t("W01"), t("D12"), t("L16:300x90 hy90 H1.2"), t("D04 - 2/240x45 SG8"), t("G49h"), t("S1"), t("ED 03")],
    });
    expect(marks.map((m) => m.id)).toEqual(["W01", "D12", "L16", "D04", "G49h", "S1", "ED03"]);
    expect(marks.find((m) => m.id === "L16")).toMatchObject({ spec: "300x90 hy90 H1.2", family: "lintel" });
    expect(marks.find((m) => m.id === "D04")).toMatchObject({ spec: "2/240x45 SG8", family: "door" });
    expect(marks.find((m) => m.id === "W01")).toMatchObject({ spec: null, family: "window" });
  });

  it("leaves out words, sizes, units and sheet numbers", () => {
    const marks = readMarks({ text: [t("Lounge"), t("90x45"), t("R2.8"), t("A02.3"), t("1:100"), t("2025"), t("N"), t("kN"), t("L-shaped"), t("SG8"), t("GL10"), t("M12"), t("H3"), t("PS1")] });
    expect(marks).toEqual([]);
  });

  it("counts repeats", () => {
    const counts = countMarks(readMarks({ text: [t("G49h"), t("G49h"), t("W2"), t("G49h")] }));
    expect(counts.get("G49h")).toBe(3);
    expect(counts.get("W2")).toBe(1);
  });

  it("guesses a family from the letters only as a starting point", () => {
    expect(familyOf("W")).toBe("window");
    expect(familyOf("ED")).toBe("door");
    expect(familyOf("G")).toBe("other");
  });
});
