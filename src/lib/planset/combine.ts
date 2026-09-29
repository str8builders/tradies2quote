// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — any plan files → one PDF set.
//
// Tradies get plans as a consented PDF set, several PDFs (architect's +
// engineer's), scans, or photos of paper plans (JPEG/PNG/HEIC). All of them
// become pages of ONE PDF so the reader has a single pipeline: PDF pages are
// copied as they are (vector text stays exact); a photo becomes a page of its
// own (read later by the AI, as scanned pages are).
//
// DWG/DXF drawing files are refused with a plain reason: every NZ consent
// set is issued as a PDF, so the designer can always send that.
//
// combinePlanParts() is pure pdf-lib (runs in tests); preparing a photo (HEIC
// conversion, EXIF strip, size cap) happens in the browser (combine-client.ts).
// ─────────────────────────────────────────────────────────────────────────

import { PDFDocument } from "pdf-lib";

export type PlanFileKind = "pdf" | "image" | "heic" | "cad" | "unknown";

export function planFileKind(file: { name: string; type?: string }): PlanFileKind {
  const name = file.name.toLowerCase();
  const type = (file.type ?? "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/\.(heic|heif)$/.test(name) || type === "image/heic" || type === "image/heif") return "heic";
  if (/^image\/(jpeg|png|webp|gif|bmp|tiff)$/.test(type) || /\.(jpe?g|png|webp|gif|bmp|tiff?)$/.test(name)) return "image";
  if (/\.(dwg|dxf|dwf|rvt|pln|skp|ifc)$/.test(name)) return "cad";
  return "unknown";
}

/** Why a file can't be used, in plain words (null = fine). */
export function planFileProblem(file: { name: string; type?: string }): string | null {
  const kind = planFileKind(file);
  if (kind === "cad") return `${file.name}: drawing files (DWG, DXF, Revit, ArchiCAD) can't be read. Ask the designer for the PDF set — every consent set is issued as a PDF.`;
  if (kind === "unknown") return `${file.name}: that isn't a plan file. Use PDFs or photos (JPG, PNG, HEIC).`;
  return null;
}

export type PlanPart =
  | { kind: "pdf"; name: string; bytes: Uint8Array }
  | { kind: "image"; name: string; bytes: Uint8Array; type: "image/jpeg" | "image/png"; width: number; height: number };

export type CombinedSet = { pdf: Uint8Array; pageCount: number; parts: Array<{ name: string; pages: number }> };

export class PlanFileError extends Error {}

/** A photo's page: its pixels at 150 dpi, so a phone photo of an A3 sheet lands about A3. */
const IMAGE_DPI = 150;

/** Put the parts together, in order, as one PDF. */
export async function combinePlanParts(parts: readonly PlanPart[]): Promise<CombinedSet> {
  const out = await PDFDocument.create();
  const summary: CombinedSet["parts"] = [];
  for (const part of parts) {
    if (part.kind === "pdf") {
      let src: PDFDocument;
      try {
        src = await PDFDocument.load(part.bytes, { ignoreEncryption: true, updateMetadata: false });
      } catch {
        throw new PlanFileError(`${part.name} couldn't be opened as a PDF. Try saving it again from the program that made it.`);
      }
      if (src.isEncrypted) throw new PlanFileError(`${part.name} has a password. Save a copy without one and upload that.`);
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const p of pages) out.addPage(p);
      summary.push({ name: part.name, pages: pages.length });
    } else {
      const img = part.type === "image/png" ? await out.embedPng(part.bytes) : await out.embedJpg(part.bytes);
      const w = (part.width * 72) / IMAGE_DPI, h = (part.height * 72) / IMAGE_DPI;
      const page = out.addPage([w, h]);
      page.drawImage(img, { x: 0, y: 0, width: w, height: h });
      summary.push({ name: part.name, pages: 1 });
    }
  }
  if (!out.getPageCount()) throw new PlanFileError("There were no pages in those files.");
  return { pdf: await out.save({ useObjectStreams: true }), pageCount: out.getPageCount(), parts: summary };
}

/** A name for the set: the file's own name, or "3 files — First.pdf …". */
export function setName(names: readonly string[]): string {
  if (names.length === 1) return names[0].replace(/\.(heic|heif|jpe?g|png|webp)$/i, ".pdf");
  return `${names.length} files — ${names[0]}`.slice(0, 200) + (/\.pdf$/i.test(names[0]) ? "" : ".pdf");
}
