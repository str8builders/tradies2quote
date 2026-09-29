import "server-only";
// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — read one PDF page into text + lines + filled shapes.
//
// Consented plan sets come out of ArchiCAD / Revit / AutoCAD as VECTOR PDFs:
// every dimension, tag and schedule cell is real text with an exact
// position, walls are filled polygons, dimension lines are thin strokes.
// Reading those is exact — no guessing from a picture. This module does
// only that reading (no interpretation), with pdf.js's Node build:
//
//   - text: getTextContent(), mapped through the viewport so the page's
//     /Rotate is applied (a sideways-stored sheet reads the right way up);
//   - lines + fills: the operator list walked with its own transform stack
//     (cm, save/restore, form XObjects, line width, dash, colour).
//
// Positions are page millimetres, origin top-left (see ../types.ts).
// ─────────────────────────────────────────────────────────────────────────

import type { FillShape, Segment, SheetRaw, TextItem } from "../types";

type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type Matrix = [number, number, number, number, number, number];

const MM_PER_PT = 25.4 / 72;
/** Keep JSON small: 0.01 mm is far below any drawing's precision. */
const r2 = (v: number) => Math.round(v * 100) / 100;

let pdfjsPromise: Promise<Pdfjs> | null = null;
function loadPdfjs(): Promise<Pdfjs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

export type OpenPlanPdf = {
  pageCount: number;
  /** Read one page (1-based). */
  readPage(page: number): Promise<SheetRaw>;
  close(): Promise<void>;
};

/** Open a plan PDF. The bytes are copied, so the caller can keep using them. */
export async function openPlanPdf(bytes: Uint8Array): Promise<OpenPlanPdf> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await task.promise;
  return {
    pageCount: doc.numPages,
    readPage: async (n) => {
      const page = await doc.getPage(n);
      try {
        return await readPage(pdfjs, page, n);
      } finally {
        page.cleanup();
      }
    },
    close: () => task.destroy(),
  };
}

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<Pdfjs["getDocument"]>["promise"]>["getPage"]>>;

async function readPage(pdfjs: Pdfjs, page: PdfPage, n: number): Promise<SheetRaw> {
  const vp = page.getViewport({ scale: 1 });
  const base = vp.transform as Matrix;
  const text = await readText(pdfjs, page, base);
  const ops = await page.getOperatorList();
  const shapes = walkOperators(pdfjs, ops, base, vp.width * vp.height);
  return {
    page: n,
    widthMm: r2(vp.width * MM_PER_PT),
    heightMm: r2(vp.height * MM_PER_PT),
    rotate: ((page.rotate % 360) + 360) % 360,
    text,
    ...shapes,
  };
}

async function readText(pdfjs: Pdfjs, page: PdfPage, base: Matrix): Promise<TextItem[]> {
  const content = await page.getTextContent();
  const out: TextItem[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const s = item.str.trim();
    if (!s) continue;
    const m = pdfjs.Util.transform(base, item.transform) as Matrix;
    out.push({
      id: out.length,
      s,
      x: r2(m[4] * MM_PER_PT),
      y: r2(m[5] * MM_PER_PT),
      // Viewport y points down, so flip it to get an anticlockwise angle.
      angle: normaliseAngle(Math.round((Math.atan2(-m[1], m[0]) * 180) / Math.PI)),
      h: r2(Math.hypot(m[2], m[3]) * MM_PER_PT),
      w: r2(item.width * MM_PER_PT),
    });
  }
  return out;
}

function normaliseAngle(a: number): number {
  const v = ((a % 360) + 360) % 360;
  return v === 360 ? 0 : v;
}

type GraphicsState = { ctm: Matrix; stroke: string; fill: string; lineWidth: number; dashed: boolean };

/**
 * Walk the page's drawing operators, keeping the transform stack, and return
 * stroked straight segments, filled shapes and image coverage. Curves move the
 * pen but aren't kept (door swings and arcs are symbols, not measurements).
 */
function walkOperators(
  pdfjs: Pdfjs,
  ops: { fnArray: number[]; argsArray: unknown[] },
  base: Matrix,
  pageArea: number,
): Pick<SheetRaw, "segs" | "fills" | "images" | "imageCover"> {
  const { OPS, Util } = pdfjs;
  const STROKE = new Set<number>([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const FILL = new Set<number>([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const IMAGE = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat]);

  let st: GraphicsState = { ctm: base, stroke: "#000000", fill: "#000000", lineWidth: 1, dashed: false };
  const stack: GraphicsState[] = [];
  const segs: Segment[] = [];
  const fills: FillShape[] = [];
  let images = 0;
  let largestImage = 0;

  const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const toMm = (p: [number, number]): [number, number] => [r2(p[0] * MM_PER_PT), r2(p[1] * MM_PER_PT)];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    switch (fn) {
      case OPS.save:
        stack.push({ ...st });
        break;
      case OPS.restore:
        st = stack.pop() ?? st;
        break;
      case OPS.transform:
        st = { ...st, ctm: Util.transform(st.ctm, args as Matrix) as Matrix };
        break;
      case OPS.paintFormXObjectBegin: {
        stack.push({ ...st });
        const matrix = args[0] as Matrix | null;
        if (Array.isArray(matrix) && matrix.length === 6) st = { ...st, ctm: Util.transform(st.ctm, matrix) as Matrix };
        break;
      }
      case OPS.paintFormXObjectEnd:
        st = stack.pop() ?? st;
        break;
      case OPS.setLineWidth:
        st = { ...st, lineWidth: Number(args[0]) || 0 };
        break;
      case OPS.setDash:
        st = { ...st, dashed: isDashed(args[0]) };
        break;
      case OPS.setGState:
        for (const [key, value] of (args[0] as Array<[string, unknown]>) ?? []) {
          if (key === "LW") st = { ...st, lineWidth: Number(value) || 0 };
          if (key === "D" && Array.isArray(value)) st = { ...st, dashed: isDashed(value[0]) };
        }
        break;
      case OPS.setStrokeRGBColor:
        st = { ...st, stroke: colour(Util, args) };
        break;
      case OPS.setFillRGBColor:
        st = { ...st, fill: colour(Util, args) };
        break;
      case OPS.constructPath: {
        const paintOp = args[0] as number;
        const data = (args[1] as unknown[] | undefined)?.[0] as ArrayLike<number> | undefined;
        if (!data || typeof data.length !== "number") break;
        const stroked = STROKE.has(paintOp);
        const filled = FILL.has(paintOp) && st.fill !== "#ffffff";
        if (!stroked && !filled) break;
        const scale = Math.hypot(st.ctm[0], st.ctm[1]);
        const width = r2(st.lineWidth * scale * MM_PER_PT);
        let cur: [number, number] | null = null;
        let start: [number, number] | null = null;
        const ring: Array<[number, number]> = [];
        let ringDone = false;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const note = (p: [number, number]) => {
          if (p[0] < minX) minX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] > maxY) maxY = p[1];
          if (!ringDone && ring.length < 64) ring.push(toMm(p));
        };
        const line = (a: [number, number], b: [number, number]) => {
          if (!stroked) return;
          const p = toMm(a), q = toMm(b);
          if (p[0] === q[0] && p[1] === q[1]) return;
          segs.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1], c: st.stroke, w: width, dashed: st.dashed });
        };
        let k = 0;
        while (k < data.length) {
          const code = data[k++];
          if (code === 0) {
            if (ring.length) ringDone = true;
            cur = apply(st.ctm, data[k], data[k + 1]);
            start = cur;
            k += 2;
            note(cur);
          } else if (code === 1) {
            const p = apply(st.ctm, data[k], data[k + 1]);
            k += 2;
            if (cur) line(cur, p);
            cur = p;
            note(p);
          } else if (code === 2) {
            cur = apply(st.ctm, data[k + 4], data[k + 5]);
            k += 6;
            note(cur);
          } else if (code === 3) {
            cur = apply(st.ctm, data[k + 2], data[k + 3]);
            k += 4;
            note(cur);
          } else if (code === 4) {
            if (cur && start) line(cur, start);
            cur = start;
            ringDone = ring.length > 0;
          } else {
            break;
          }
        }
        if (filled && ring.length >= 3 && Number.isFinite(minX)) {
          fills.push({ c: st.fill, pts: ring, bbox: [r2(minX * MM_PER_PT), r2(minY * MM_PER_PT), r2(maxX * MM_PER_PT), r2(maxY * MM_PER_PT)] });
        }
        break;
      }
      default:
        if (IMAGE.has(fn)) {
          images += 1;
          // An image fills the unit square under the current transform.
          const corners = [apply(st.ctm, 0, 0), apply(st.ctm, 1, 0), apply(st.ctm, 0, 1), apply(st.ctm, 1, 1)];
          const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
          const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
          if (area > largestImage) largestImage = area;
        }
    }
  }
  return { segs, fills, images, imageCover: pageArea > 0 ? Math.min(1, r2(largestImage / pageArea)) : 0 };
}

function isDashed(pattern: unknown): boolean {
  return Array.isArray(pattern) && pattern.some((v) => Number(v) > 0);
}

function colour(Util: Pdfjs["Util"], args: unknown[]): string {
  if (typeof args[0] === "string") return args[0].toLowerCase();
  const [r, g, b] = args.map((v) => Math.round(Number(v)));
  return Util.makeHexColor(r, g, b).toLowerCase();
}
