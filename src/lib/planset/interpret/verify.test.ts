import { describe, expect, it } from "vitest";
import type { TextItem } from "../types";
import { EMPTY_READING } from "./schema";
import { numberPrinted, numbersIn, verifyReading } from "./verify";

const run = (id: number, s: string): TextItem => ({ id, s, x: 0, y: 0, angle: 0, h: 2, w: 10 });
const text = [
  run(0, "EXTERNAL WALLS: 90x45 SG8 H1.2 studs @ 600 crs"),
  run(1, "Wall R2.8 Ecoinsulation"),
  run(2, "2400 STUD"),
  run(3, "Roof pitch 25°"),
  run(4, "WIND ZONE: VERY HIGH"),
  run(5, "Preline - standard"),
];

describe("numbers", () => {
  it("reads printed numbers, thousands and decimals", () => {
    expect(numbersIn("2,400 stud, R2.8, 0.40 BMT")).toEqual([2400, 2.8, 0.4]);
  });
  it("matches mm to m", () => {
    expect(numberPrinted(2400, "2.4 m stud")).toBe(true);
    expect(numberPrinted(2400, "2400")).toBe(true);
    expect(numberPrinted(2550, "2400")).toBe(false);
  });
});

describe("verifyReading", () => {
  it("keeps items the cited text backs up", () => {
    const v = verifyReading(
      {
        ...EMPTY_READING,
        specs: [
          { topic: "framing_timber", value: "90x45 SG8 H1.2", text_ids: [0] },
          { topic: "stud_spacing", value: "600 crs", text_ids: [0] },
          { topic: "insulation_walls", value: "R2.8 Ecoinsulation", text_ids: [1] },
        ],
        heights: [{ kind: "stud_height", mm: 2400, where: "Section AA", text_ids: [2] }],
        roof: [{ kind: "pitch_deg", value: "25°", text_ids: [3] }],
        zones: [{ kind: "wind", value: "VERY HIGH", text_ids: [4] }],
        consent: [{ kind: "inspection", text: "Preline - standard", text_ids: [5] }],
      },
      text,
    );
    expect(v.dropped).toBe(0);
    expect(v.kept).toBe(7);
  });

  it("drops invented numbers, words and citations", () => {
    const v = verifyReading(
      {
        ...EMPTY_READING,
        specs: [
          { topic: "insulation_walls", value: "R2.6 Pink Batts", text_ids: [1] }, // wrong number, wrong product
          { topic: "framing_timber", value: "90x45 SG8", text_ids: [99] }, // no such run
          { topic: "cladding", value: "Weatherboard", text_ids: [] }, // nothing cited
        ],
        heights: [{ kind: "stud_height", mm: 2550, where: "Section BB", text_ids: [2] }], // 2550 isn't printed
      },
      text,
    );
    expect(v.kept).toBe(0);
    expect(v.dropped).toBe(4);
    expect(v.reasons.join(" ")).toMatch(/2.6|isn't what the cited text says/);
  });
});
