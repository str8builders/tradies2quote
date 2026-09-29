import { describe, expect, it } from "vitest";
import type { BuildingModel } from "../model/types";
import { EMPTY_READING, type SheetReading } from "./schema";
import { mergeReadings, type SheetReadingAt } from "./merge";

const base: BuildingModel = {
  version: 1,
  project: { kind: "new_build", buildings: [], consentNumber: null, authority: null, approved: true, consentSource: "papers" },
  sheets: { total: 2, drawings: 2, documents: 0, provenScale: 2, unreadable: 0 },
  walls: null,
  wallsByBuilding: {},
  openings: [],
  lintels: [],
  schedules: {},
  specs: {},
  heights: { studMm: null, ceilingMm: null },
  roof: { pitchDeg: null, areaM2: null, material: null },
  zones: { wind: null, earthquake: null, exposure: null, snow: null },
  consent: { inspections: [], documents: [], conditions: [] },
  rooms: [],
  legend: [],
  byOthers: [],
  ai: { sheetsRead: 0, itemsKept: 0, itemsDropped: 0, skipped: null },
  flags: [],
};

const at = (page: number, name: string, reading: Partial<SheetReading>): SheetReadingAt => ({
  name,
  evidence: (ids) => [{ page, text: ids, method: "ai" }],
  reading: { ...EMPTY_READING, ...reading },
});

describe("mergeReadings", () => {
  it("marks a stud height two sheets agree on as checked", () => {
    const m = mergeReadings(base, [
      at(3, "A00.2", { heights: [{ kind: "stud_height", mm: 2400, where: "notes", text_ids: [1] }] }),
      at(19, "A04.1", { heights: [{ kind: "stud_height", mm: 2400, where: "Section AA", text_ids: [7] }] }),
    ]);
    expect(m.heights.studMm).toMatchObject({ value: 2400, status: "checked" });
    expect(m.flags).toEqual([]);
  });

  it("asks when sheets disagree, and writes the RFI", () => {
    const m = mergeReadings(base, [
      at(3, "A00.2", { heights: [{ kind: "stud_height", mm: 2400, where: "notes", text_ids: [1] }] }),
      at(19, "A04.1", { heights: [{ kind: "stud_height", mm: 2550, where: "Section AA", text_ids: [7] }] }),
    ]);
    expect(m.heights.studMm?.status).toBe("needs_check");
    const flag = m.flags.find((f) => f.id === "stud-height")!;
    expect(flag.question).toMatchObject({ kind: "number" });
    expect(flag.rfi).toMatch(/2400 mm \(notes\) vs 2550 mm \(Section AA\)/);
  });

  it("collects specs, consent items and zones, and flags two different wall R-values", () => {
    const m = mergeReadings(base, [
      at(2, "A00.1", {
        specs: [{ topic: "insulation_walls", value: "R2.8 Ecoinsulation", text_ids: [4] }],
        zones: [{ kind: "wind", value: "Very High", text_ids: [9] }],
      }),
      at(40, "A60.1", { specs: [{ topic: "insulation_walls", value: "R2.2", text_ids: [2] }] }),
      at(1, "the consent papers", { consent: [{ kind: "inspection", text: "Preline - standard", text_ids: [5] }] }),
    ]);
    expect(m.specs.insulation_walls).toHaveLength(2);
    expect(m.flags.some((f) => f.id === "spec-insulation_walls")).toBe(true);
    expect(m.zones.wind?.value).toBe("Very High");
    expect(m.consent.inspections[0]).toMatchObject({ value: "Preline - standard" });
  });
});
