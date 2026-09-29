import { describe, expect, it } from "vitest";
import type { SheetRaw, TextItem } from "../types";
import { classifySheet, mentionsBuilding, type SheetKind } from "./classify";

function sheetWith(lines: Array<[string, number?]>, w = 420, h = 297): SheetRaw {
  const text: TextItem[] = lines.map(([s, hh = 2.5], id) => ({ id, s, x: 20 + (id % 10) * 30, y: 30 + Math.floor(id / 10) * 6, angle: 0, h: hh, w: s.length * hh * 0.55 }));
  return { page: 1, widthMm: w, heightMm: h, rotate: 0, text, segs: [], fills: [], images: 0, imageCover: 0 };
}
const blank = sheetWith([]);

const byTitle = (title: string, extra: { indexName?: string | null; structural?: boolean } = {}) =>
  classifySheet({ title, indexName: extra.indexName ?? null, sheet: blank, document: false, structural: extra.structural ?? false });

describe("kind from the sheet's title", () => {
  it.each<[string, SheetKind]>([
    ["Ground Floor - Dimension Plan", "dimension_plan"],
    ["Dimensioned Floor Plan", "dimension_plan"],
    ["Ground Floor Plan", "floor_plan"],
    ["Proposed First Floor Plan", "floor_plan"],
    ["Foundation Plan", "foundation_plan"],
    ["Foundations Arch", "foundation_plan"],
    ["Pile Plan", "foundation_plan"],
    ["Beam & Foundation Plan", "foundation_plan"],
    ["Foundation Details", "details"],
    ["Bracing Plan", "bracing_plan"],
    ["Wall Bracing & Lintel Plan", "bracing_plan"],
    ["Roof Bracing Plan", "bracing_plan"],
    ["Bracing Details", "details"],
    ["Braces GS1-N BL1-H", "details"],
    ["Lintels & Fixings Plan", "lintel_plan"],
    ["Lintel Uplift", "details"],
    ["Roof Framing Plan", "roof_framing_plan"],
    ["Roof Framing Eng", "roof_framing_plan"],
    ["Roof Truss Layout", "roof_framing_plan"],
    ["Roof Plan", "roof_plan"],
    ["COTTAGE ROOF DIAPHRAGM PLAN", "framing_plan"],
    ["COTTAGE CEILING FRAMING PLAN", "ceiling_plan"],
    ["Ground Floor Framing Plan", "framing_plan"],
    ["Reflected Ceiling Plan", "ceiling_plan"],
    ["Sub-floor Plan", "foundation_plan"],
    ["Ceiling Details", "details"],
    ["Elevations", "elevations"],
    ["Elevations 2", "elevations"],
    ["BARN BUILDING ELEVATIONS - SHEET 1", "elevations"],
    ["Sections AA & BB", "sections"],
    ["Portico X-Section", "sections"],
    ["Cladding Details 1", "details"],
    ["Details and Fixings", "details"],
    ["Roof & Wall Penetrations", "details"],
    ["Window Details Aluminium Direct Fixed", "details"],
    ["Exterior Door Schedule", "door_schedule"],
    ["Window Schedule", "window_schedule"],
    ["Door and Window Schedule", "schedule"],
    ["Schedule of Finishes", "schedule"],
    ["Kitchen & Bathroom Layout", "kitchen_bathroom"],
    ["Bathroom", "kitchen_bathroom"],
    ["Wet Area Systems", "wet_areas"],
    ["Wet Area Details", "wet_areas"],
    ["Electrical Plan", "electrical_plan"],
    ["Plumbing & Drainage Plan", "plumbing_drainage"],
    ["Plumbing & Drainage Details", "plumbing_drainage"],
    ["Landscape Plan", "landscape"],
    ["Site Plan", "site_plan"],
    ["Master Plan", "site_plan"],
    ["Site Levels & Retaining", "site_plan"],
    ["Site Setout", "site_plan"],
    ["Plan-Site notes info", "site_plan"],
    ["Site - Wind Zone Calcs", "calculations"],
    ["Notes - Specifications", "notes"],
    ["Cover Page", "cover"],
    ["COVER SHEET", "cover"],
    ["Drawing Index", "index"],
    ["STRUCTURAL DRAWING LIST", "index"],
    ["Structural Plan", "structural_plan"],
    ["Form 5 - Building Consent", "consent_document"],
    ["Producer Statement PS1", "consent_document"],
  ])("%s → %s", (title, kind) => {
    expect(byTitle(title).kind).toBe(kind);
  });

  it("puts a Dimension Plan ahead of the Floor Plan it also is", () => {
    const c = byTitle("Ground Floor - Dimension Plan");
    expect(c.kind).toBe("dimension_plan");
    expect(c.level).toBe("ground");
  });
  it("returns 'other' with no confidence for a title it has no rule for", () => {
    const c = byTitle("Gizmo Widgets Assortment");
    expect(c.kind).toBe("other");
    expect(c.confidence).toBe(0);
  });
  it("is unsure about a bare 'Plan'", () => {
    const c = byTitle("Plan Proposed");
    expect(c.kind).toBe("floor_plan");
    expect(c.confidence).toBeLessThan(0.7);
  });
});

describe("building and level", () => {
  it.each<[string, string | null, string | null]>([
    ["COTTAGE GROUND FLOOR PLAN", "COTTAGE", "ground"],
    ["Sleepout Floor Plan", "Sleepout", null],
    ["UNIT 2 FIRST FLOOR PLAN", "UNIT 2", "first"],
    ["Garage Roof Plan", "Garage", null],
    ["BARN BUILDING ELEVATIONS - SHEET 2", "BARN", null],
    ["Block B Ground Floor Plan", "Block B", "ground"],
    ["Proposed Ground Floor Plan", null, "ground"],
    ["Existing Floor Plan", null, null],
    ["New Elevations", null, null],
    ["Ground Floor - Dimension Plan", null, "ground"],
    ["Level 2 Floor Plan", null, "level 2"],
    ["Upper Floor Plan", null, "upper"],
    ["Basement Plan", null, "basement"],
    ["Roof Framing Plan", null, null],
    ["Lintels & Fixings Plan", null, null],
    ["Plumbing & Drainage Plan", null, null],
    ["Site Plan", null, null],
  ])("%s → building %s, level %s", (title, building, level) => {
    const c = byTitle(title);
    expect(c.building).toBe(building);
    expect(c.level).toBe(level);
  });
  it("gives no building name to details, schedules or layouts, whatever stands in front of the word", () => {
    expect(byTitle("Portico Details").building).toBeNull();
    expect(byTitle("Exterior Door Schedule").building).toBeNull();
    expect(byTitle("Kitchen & Bathroom Layout").building).toBeNull();
    expect(byTitle("COTTAGE WALL FRAMING DETAILS").building).toBeNull();
  });
  it("reads the building from the index name when the sheet has no title of its own", () => {
    const c = classifySheet({ title: null, indexName: "COTTAGE GROUND FLOOR PLAN", sheet: blank, document: false });
    expect(c.kind).toBe("floor_plan");
    expect(c.building).toBe("COTTAGE");
    expect(c.level).toBe("ground");
  });
  it("matches a known building name as a whole word only", () => {
    expect(mentionsBuilding("FRAME DETAILS - COTTAGE PORTAL", "COTTAGE")).toBe(true);
    expect(mentionsBuilding("COTTAGES", "COTTAGE")).toBe(false);
    expect(mentionsBuilding("UNIT 2 PLAN", "Unit 2")).toBe(true);
    expect(mentionsBuilding(null, "COTTAGE")).toBe(false);
  });
});

describe("title, index name and the page's own words", () => {
  it("lets the title decide, and notes when the index says something else", () => {
    const c = classifySheet({ title: "Roof Plan", indexName: "Roof Framing Plan", sheet: blank, document: false });
    expect(c.kind).toBe("roof_plan");
    expect(c.basis.join(" ")).toMatch(/index names it/);
  });
  it("is surer when title and index agree", () => {
    const agree = classifySheet({ title: "Elevations", indexName: "Elevations", sheet: blank, document: false });
    const alone = classifySheet({ title: "Elevations", indexName: null, sheet: blank, document: false });
    expect(agree.confidence).toBeGreaterThan(alone.confidence);
  });
  it("falls back to the index name when the sheet prints no title", () => {
    const c = classifySheet({ title: null, indexName: "Window Schedule", sheet: blank, document: false });
    expect(c.kind).toBe("window_schedule");
    expect(c.confidence).toBeLessThan(0.9);
  });
  it("counts the words on the page when nothing titles it", () => {
    const page = sheetWith([["GROUND FLOOR PLAN 1:100", 4.2], ["6,470", 2.5], ["3,600", 2.5], ["4,850", 2.5]]);
    const c = classifySheet({ title: null, indexName: null, sheet: page, document: false });
    expect(c.kind).toBe("floor_plan");
    expect(c.confidence).toBeGreaterThan(0);
    expect(c.confidence).toBeLessThan(0.7);
  });
  it("ranks a short drawing label far above a mention in a long note", () => {
    const page = sheetWith([
      ["ELEVATIONS", 4.2],
      ["Refer to the floor plan for the position of every window and door in the external walls of the dwelling", 2.5],
    ]);
    expect(classifySheet({ title: null, indexName: null, sheet: page, document: false }).kind).toBe("elevations");
  });
  it("calls a page headed 'Drawing Index' the index, whatever names it lists", () => {
    const page = sheetWith([["Drawing Index", 2.7], ["Foundation Details", 2.7], ["Cladding Details", 2.7], ["Cladding Details", 2.7], ["Roof Details", 2.7]]);
    expect(classifySheet({ title: null, indexName: null, sheet: page, document: false }).kind).toBe("index");
  });
  it("says 'other' with zero confidence when the page names nothing", () => {
    const c = classifySheet({ title: null, indexName: null, sheet: sheetWith([["12", 2.5], ["34", 2.5]]), document: false });
    expect(c).toMatchObject({ kind: "other", confidence: 0, building: null, level: null });
    expect(c.basis.length).toBeGreaterThan(0);
  });
});

describe("engineer's sheets", () => {
  it("makes notes and details structural when told the sheet is an engineer's", () => {
    expect(byTitle("GENERAL NOTES - SHEET 1", { structural: true }).kind).toBe("structural_notes");
    expect(byTitle("GENERAL NOTES - SHEET 1", { structural: false }).kind).toBe("notes");
    expect(byTitle("Details", { structural: true }).kind).toBe("structural_details");
    expect(byTitle("Details", { structural: false }).kind).toBe("details");
  });
  it("takes 'structural' in the title itself", () => {
    expect(byTitle("STANDARD STRUCTURAL DETAILS - SHEET 1").kind).toBe("structural_details");
  });
  it("reads a dense engineer's page as structural without being told, but not an architect's notes page", () => {
    const eng = sheetWith(Array.from({ length: 60 }, (_, i) => [i % 2 ? "REINFORCEMENT TO NZS 3101, GRADE 500 CONCRETE" : "SG8 LVL BEAM, WELD ALL AROUND", 3.5] as [string, number]));
    expect(classifySheet({ title: "Notes", indexName: null, sheet: eng, document: false }).kind).toBe("structural_notes");
    const arch = sheetWith([...Array.from({ length: 80 }, () => ["Skirtings to be pine with paint finish", 2.7] as [string, number]), ["Refer to the engineer's design", 2.7]]);
    expect(classifySheet({ title: "Notes - Specifications", indexName: null, sheet: arch, document: false }).kind).toBe("notes");
  });
});

describe("paperwork", () => {
  const doc = (title: string | null) => classifySheet({ title, indexName: null, sheet: blank, document: true });
  it("is consent paperwork by default", () => {
    const c = doc(null);
    expect(c.kind).toBe("consent_document");
    expect(c.building).toBeNull();
  });
  it("is a specification or calculations when it says so", () => {
    expect(doc("Structural Specification").kind).toBe("specification");
    expect(doc("Bracing Calculations").kind).toBe("calculations");
  });
  it("never reads a plan type into a document", () => {
    expect(doc("Floor Plan Approval Letter").kind).toBe("consent_document");
  });
});
