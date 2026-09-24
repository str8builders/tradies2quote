import { describe, expect, it } from "vitest";
import { parseTitleBlock } from "../titleBlock";

describe("parseTitleBlock", () => {
  it("extracts common labelled fields", () => {
    const tb = parseTitleBlock(
      [
        "PROJECT: Smith Residence",
        "DRAWING TITLE: Ground Floor Plan",
        "SHEET No: A-101",
        "SCALE: 1:100",
        "DATE: 2026-05-01",
        "DRAWN BY: CS",
      ].join("\n"),
    );
    expect(tb.fields.project).toBe("Smith Residence");
    expect(tb.fields.sheet_title).toBe("Ground Floor Plan");
    expect(tb.sheet_label).toBe("A-101");
    expect(tb.scale.mm_per_drawing_unit).toBe(100);
    expect(tb.fields.drawn_by).toBe("CS");
  });

  it("sniffs a sheet id when not explicitly labelled", () => {
    const tb = parseTitleBlock("Foundation layout\nS2.01\nfooting plan");
    expect(tb.sheet_label).toBe("S-2.01");
  });

  it("detects metric units", () => {
    expect(parseTitleBlock("All dimensions in mm").units).toBe("mm");
  });

  it("returns empty structure for blank input", () => {
    const tb = parseTitleBlock("");
    expect(tb.fields).toEqual({});
    expect(tb.sheet_label).toBeNull();
    expect(tb.scale.confidence).toBe(0);
  });

  it("parses scale from a free-form block without a scale label", () => {
    const tb = parseTitleBlock("Deck plan\n1:50\nTreated pine");
    expect(tb.scale.mm_per_drawing_unit).toBe(50);
  });
  // Audit 2026-09-24: "Revision: B" came back as "isio" (the short "rev" label
  // matched inside the word), and the date in "Rev 1: 20/08/2026" was read
  // as a 1:20 scale.
  it("reads the revision value, not letters from inside the word Revision", () => {
    expect(parseTitleBlock("Revision: B").fields.revision).toBe("B");
    expect(parseTitleBlock("REV. C2").fields.revision).toBe("C2");
    expect(parseTitleBlock("Rev No. 3").fields.revision).toBe("3");
    expect(parseTitleBlock("Rev 1: 20/08/2026").fields.revision).toBe("1");
  });

  it("does not invent a revision from headings or other words", () => {
    expect(parseTitleBlock("REVISIONS").fields.revision).toBeUndefined();
    expect(parseTitleBlock("Reviewed by: JS").fields.revision).toBeUndefined();
    expect(parseTitleBlock("Revised: 20/08/2026").fields.revision).toBeUndefined();
    expect(parseTitleBlock("Rev by JS").fields.revision).toBeUndefined();
  });

  it("never reads a revision date or plot time as the sheet scale", () => {
    for (const block of [
      "Project: Smith Deck\nRev 1: 20/08/2026",
      "Project: Smith Deck\nRev 1: 20 Aug 2026",
      "Project: Smith Deck\nIssued 1:20/08/2026",
      "Project: Smith Deck\nPlotted 1:30 pm",
    ]) {
      const tb = parseTitleBlock(block);
      expect(tb.scale.confidence, block).toBe(0);
      expect(tb.scale.mm_per_drawing_unit, block).toBeNull();
    }
  });

  it("still finds the real scale next to a revision line", () => {
    const tb = parseTitleBlock("Rev 1: 20/08/2026\nFloor plan 1:100 @ A3");
    expect(tb.scale.mm_per_drawing_unit).toBe(100);
    expect(tb.fields.revision).toBe("1");
  });
});
