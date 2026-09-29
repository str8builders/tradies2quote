import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { openPlanPdf } from "./read";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

/** A3 landscape sheet at 1:100: a 6,470 dimension, its line, a 90 mm wall, a dashed line. */
async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const W = mm(420), H = mm(297);
  const page = doc.addPage([W, H]);
  // Dimension line 64.7 mm long (6,470 at 1:100), label centred 1 mm above it.
  page.drawLine({ start: { x: mm(100), y: H - mm(50) }, end: { x: mm(164.7), y: H - mm(50) }, thickness: mm(0.15), color: rgb(0, 0, 0) });
  page.drawText("6,470", { x: mm(125), y: H - mm(49), size: mm(2.5), font, color: rgb(0, 0, 0) });
  // A wall: 90 mm thick at 1:100 = 0.9 mm, 30 mm long, dark grey fill.
  page.drawRectangle({ x: mm(100), y: H - mm(100.9), width: mm(30), height: mm(0.9), color: rgb(0.25, 0.25, 0.25) });
  page.drawLine({ start: { x: mm(200), y: H - mm(80) }, end: { x: mm(260), y: H - mm(80) }, thickness: mm(0.25), color: rgb(1, 0, 0), dashArray: [mm(2), mm(1)] });
  // A sheet stored sideways: portrait media box, /Rotate 90, text written bottom→top so it reads normally.
  const side = doc.addPage([mm(297), mm(420)]);
  side.setRotation(degrees(90));
  side.drawText("A02.3", { x: mm(140), y: mm(100), size: mm(5), font, rotate: degrees(90), color: rgb(0, 0, 0) });
  return doc.save();
}

describe("openPlanPdf", () => {
  it("reads text, lines and filled shapes in page millimetres", async () => {
    const pdf = await openPlanPdf(await samplePdf());
    expect(pdf.pageCount).toBe(2);
    const sheet = await pdf.readPage(1);
    expect(sheet.widthMm).toBeCloseTo(420, 0);
    expect(sheet.heightMm).toBeCloseTo(297, 0);
    expect(sheet.rotate).toBe(0);

    const label = sheet.text.find((t) => t.s === "6,470");
    expect(label).toMatchObject({ angle: 0 });
    expect(label!.x).toBeCloseTo(125, 1);
    expect(label!.y).toBeCloseTo(49, 1);
    expect(label!.h).toBeCloseTo(2.5, 1);
    expect(label!.w).toBeGreaterThan(5);

    const dimLine = sheet.segs.find((s) => !s.dashed && Math.abs(s.y1 - 50) < 0.05 && Math.abs(s.y2 - 50) < 0.05);
    expect(dimLine).toBeDefined();
    expect(Math.abs(dimLine!.x2 - dimLine!.x1)).toBeCloseTo(64.7, 1);
    expect(dimLine!.w).toBeCloseTo(0.15, 2);

    const dashed = sheet.segs.find((s) => s.dashed);
    expect(dashed).toMatchObject({ c: "#ff0000" });

    const wall = sheet.fills.find((f) => f.c === "#404040");
    expect(wall).toBeDefined();
    const [x0, y0, x1, y1] = wall!.bbox;
    expect(x1 - x0).toBeCloseTo(30, 1);
    expect(y1 - y0).toBeCloseTo(0.9, 1);
    expect(sheet.images).toBe(0);
    await pdf.close();
  });

  it("applies the page's /Rotate so a sideways-stored sheet reads the right way up", async () => {
    const pdf = await openPlanPdf(await samplePdf());
    const sheet = await pdf.readPage(2);
    expect(sheet.rotate).toBe(90);
    expect(sheet.widthMm).toBeCloseTo(420, 0);
    expect(sheet.heightMm).toBeCloseTo(297, 0);
    const id = sheet.text.find((t) => t.s === "A02.3");
    expect(id).toMatchObject({ angle: 0 });
    // User space (140, 100) mm on a /Rotate 90 page shows at (100, 140) mm.
    expect(id!.x).toBeCloseTo(100, 1);
    expect(id!.y).toBeCloseTo(140, 1);
    await pdf.close();
  });

  it("reads the same on a worker thread (how the server runs it)", async () => {
    const bytes = await samplePdf();
    const pdf = await openPlanPdf(bytes, { thread: true });
    expect(pdf.pageCount).toBe(2);
    const [one, two] = await Promise.all([pdf.readPage(1), pdf.readPage(2)]);
    expect(one.text.find((t) => t.s === "6,470")).toMatchObject({ angle: 0 });
    expect(two.rotate).toBe(90);
    await pdf.close();
    await expect(openPlanPdf(new TextEncoder().encode("not a pdf"), { thread: true })).rejects.toThrow(/Couldn't read the PDF/);
  });

  it("does not consume the caller's bytes", async () => {
    const bytes = await samplePdf();
    const before = bytes.length;
    const pdf = await openPlanPdf(bytes);
    await pdf.close();
    expect(bytes.length).toBe(before);
  });
});
