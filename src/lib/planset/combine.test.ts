import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PlanFileError, combinePlanParts, planFileKind, planFileProblem, setName } from "./combine";

const PNG_1PX = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

async function pdfOf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([842, 595]);
  return doc.save();
}

describe("planFileKind / planFileProblem", () => {
  it("knows plan files from drawing files and strays", () => {
    expect(planFileKind({ name: "Approved Plans.PDF" })).toBe("pdf");
    expect(planFileKind({ name: "IMG_2041.HEIC" })).toBe("heic");
    expect(planFileKind({ name: "photo", type: "image/jpeg" })).toBe("image");
    expect(planFileKind({ name: "site.dwg" })).toBe("cad");
    expect(planFileProblem({ name: "site.dwg" })).toMatch(/Ask the designer for the PDF set/);
    expect(planFileProblem({ name: "notes.docx" })).toMatch(/isn't a plan file/);
    expect(planFileProblem({ name: "plans.pdf" })).toBeNull();
  });
});

describe("combinePlanParts", () => {
  it("puts PDFs and photos together in the order picked", async () => {
    const combined = await combinePlanParts([
      { kind: "pdf", name: "architect.pdf", bytes: await pdfOf(3) },
      { kind: "image", name: "engineer-page.png", bytes: PNG_1PX, type: "image/png", width: 3000, height: 2100 },
      { kind: "pdf", name: "engineer.pdf", bytes: await pdfOf(2) },
    ]);
    expect(combined.pageCount).toBe(6);
    expect(combined.parts).toEqual([
      { name: "architect.pdf", pages: 3 },
      { name: "engineer-page.png", pages: 1 },
      { name: "engineer.pdf", pages: 2 },
    ]);
    const back = await PDFDocument.load(combined.pdf);
    // The photo's page: 3000 × 2100 px at 150 dpi → 1440 × 1008 pt.
    expect(back.getPage(3).getSize()).toEqual({ width: 1440, height: 1008 });
  });

  it("says plainly when a file isn't really a PDF", async () => {
    await expect(combinePlanParts([{ kind: "pdf", name: "broken.pdf", bytes: new TextEncoder().encode("nope") }])).rejects.toBeInstanceOf(PlanFileError);
  });
});

describe("setName", () => {
  it("names a set after its file, or its first file", () => {
    expect(setName(["Approved Plans.pdf"])).toBe("Approved Plans.pdf");
    expect(setName(["IMG_1.HEIC"])).toBe("IMG_1.pdf");
    expect(setName(["architect.pdf", "engineer.pdf"])).toBe("2 files — architect.pdf");
  });
});
