import { describe, expect, it } from "vitest";
import { EMPTY_READING } from "./schema";
import { agreeScans, parseScan, sameText, type ScanReading } from "./scan";

const scan = (over: Partial<ScanReading["reading"]> = {}, openings: ScanReading["openings"] = [], sheet: ScanReading["sheet"] = null): ScanReading => ({
  reading: { ...EMPTY_READING, ...over },
  openings,
  sheet,
});

describe("sameText", () => {
  it("needs every number to match and most words", () => {
    expect(sameText("R2.8 Ecoinsulation wall batts", "Wall batts R2.8 Ecoinsulation")).toBe(true);
    expect(sameText("R2.8 Ecoinsulation", "R2.6 Ecoinsulation")).toBe(false);
    expect(sameText("90x45 SG8 H1.2 studs at 600 crs", "90x45 SG8 H1.2 at 600")).toBe(true);
    expect(sameText("Colorsteel Endura 0.40", "Zincalume 0.40")).toBe(false);
  });
});

describe("agreeScans", () => {
  it("keeps what both reads agree on and drops the rest", () => {
    const a = scan(
      {
        specs: [
          { topic: "insulation_walls", value: "R2.8 Ecoinsulation", text_ids: [] },
          { topic: "cladding", value: "Linea weatherboard", text_ids: [] },
        ],
        heights: [{ kind: "stud_height", mm: 2400, where: "Section A", text_ids: [] }],
      },
      [{ mark: "W01", kind: "window", width_mm: 1200, height_mm: 1000, count: 1 }],
      { id: "A-101", title: "Floor Plan", scale: "1:100" },
    );
    const b = scan(
      {
        specs: [{ topic: "insulation_walls", value: "Ecoinsulation R2.8", text_ids: [] }],
        heights: [{ kind: "stud_height", mm: 2450, where: "Section A", text_ids: [] }],
      },
      [
        { mark: "W01", kind: "window", width_mm: 1200, height_mm: 1000, count: 1 },
        { mark: "W02", kind: "window", width_mm: 600, height_mm: 600, count: 1 },
      ],
      { id: "A-101", title: "Floor Plan", scale: "1:100" },
    );
    const { agreed, kept, dropped } = agreeScans(a, b);
    expect(agreed.reading.specs.map((s) => s.topic)).toEqual(["insulation_walls"]);
    expect(agreed.reading.heights).toEqual([]);
    expect(agreed.openings.map((o) => o.mark)).toEqual(["W01"]);
    expect(agreed.sheet).toMatchObject({ id: "A-101" });
    expect(kept).toBe(2);
    expect(dropped).toBeGreaterThan(0);
  });
});

describe("parseScan", () => {
  it("keeps only well-formed schedule rows", () => {
    const r = parseScan({
      sheet: { id: "A3", title: "Window schedule", scale: "" },
      openings: [{ mark: "w1", kind: "window", width_mm: 900, height_mm: 1200, count: 2 }, { mark: "", kind: "door", width_mm: 0 }],
      specs: [{ topic: "insulation_walls", value: "R2.8" }, { topic: "made_up", value: "x" }],
      heights: [{ kind: "stud_height", mm: 2400, where: "Section A" }, { kind: "nonsense", mm: 5 }],
      consent: [{ kind: "inspection", text: "Pre-line" }, { kind: "wish", text: "x" }],
      by_others: ["Trusses by supplier", ""],
    });
    expect(r.openings).toEqual([{ mark: "W1", kind: "window", width_mm: 900, height_mm: 1200, count: 2 }]);
    expect(r.sheet?.title).toBe("Window schedule");
    expect(r.reading.specs.map((x) => x.topic)).toEqual(["insulation_walls", "other"]);
    expect(r.reading.heights).toEqual([{ kind: "stud_height", mm: 2400, where: "Section A", text_ids: [] }]);
    expect(r.reading.consent.map((x) => x.text)).toEqual(["Pre-line"]);
    expect(r.reading.by_others.map((x) => x.item)).toEqual(["Trusses by supplier"]);
  });
});
