// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — read one PDF page into text + lines + filled shapes.
//
// Plain JavaScript on purpose: it runs inside a worker thread
// (read-worker.mjs), started by path at runtime, so the live server keeps
// answering while pdf.js parses a heavy A1 sheet (pdf.js in Node always
// parses on the calling thread; one engineer's sheet stalled it 1.8 s).
// Types: ../types.ts (SheetRaw, TextItem, Segment, FillShape).
//
// Consented plan sets come out of ArchiCAD / Revit / AutoCAD as VECTOR PDFs:
// every dimension, tag and schedule cell is real text with an exact
// position, walls are filled polygons, dimension lines are thin strokes.
// Reading those is exact — no guessing from a picture. This module does
// only that reading (no interpretation):
//   - text: getTextContent(), mapped through the viewport so the page's
//     /Rotate is applied (a sideways-stored sheet reads the right way up);
//   - lines + fills: the operator list walked with its own transform stack
//     (cm, save/restore, form XObjects, line width, dash, colour).
// Positions are page millimetres, origin top-left.
// ─────────────────────────────────────────────────────────────────────────

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const MM_PER_PT = 25.4 / 72;
/** Keep the output small: 0.01 mm is far below any drawing's precision. */
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Open a plan PDF. The bytes are copied, so the caller keeps them.
 * @param {Uint8Array} bytes
 * @returns {Promise<{ pageCount: number, readPage: (n: number) => Promise<import("../types").SheetRaw>, close: () => Promise<void> }>}
 */
export async function openPlanPdfCore(bytes) {
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
        return await readPage(page, n);
      } finally {
        page.cleanup();
      }
    },
    close: () => task.destroy(),
  };
}

async function readPage(page, n) {
  const vp = page.getViewport({ scale: 1 });
  const base = vp.transform;
  const text = await readText(page, base);
  const ops = await page.getOperatorList();
  const shapes = walkOperators(ops, base, vp.width * vp.height);
  return {
    page: n,
    widthMm: r2(vp.width * MM_PER_PT),
    heightMm: r2(vp.height * MM_PER_PT),
    rotate: ((page.rotate % 360) + 360) % 360,
    text,
    ...shapes,
  };
}

async function readText(page, base) {
  const content = await page.getTextContent();
  const out = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const s = item.str.trim();
    if (!s) continue;
    const m = pdfjs.Util.transform(base, item.transform);
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

function normaliseAngle(a) {
  const v = ((a % 360) + 360) % 360;
  return v === 360 ? 0 : v;
}

/**
 * Walk the page's drawing operators, keeping the transform stack, and return
 * stroked straight segments, filled shapes and image coverage. Curves move the
 * pen but aren't kept (door swings and arcs are symbols, not measurements).
 */
function walkOperators(ops, base, pageArea) {
  const { OPS, Util } = pdfjs;
  const STROKE = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const FILL = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const IMAGE = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat]);

  let st = { ctm: base, stroke: "#000000", fill: "#000000", lineWidth: 1, dashed: false };
  const stack = [];
  const segs = [];
  const fills = [];
  let images = 0;
  let largestImage = 0;

  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const toMm = (p) => [r2(p[0] * MM_PER_PT), r2(p[1] * MM_PER_PT)];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    switch (fn) {
      case OPS.save:
        stack.push({ ...st });
        break;
      case OPS.restore:
        st = stack.pop() ?? st;
        break;
      case OPS.transform:
        st = { ...st, ctm: Util.transform(st.ctm, args) };
        break;
      case OPS.paintFormXObjectBegin: {
        stack.push({ ...st });
        const matrix = args[0];
        if (Array.isArray(matrix) && matrix.length === 6) st = { ...st, ctm: Util.transform(st.ctm, matrix) };
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
        for (const [key, value] of args[0] ?? []) {
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
        const paintOp = args[0];
        const data = args[1]?.[0];
        if (!data || typeof data.length !== "number") break;
        const stroked = STROKE.has(paintOp);
        const filled = FILL.has(paintOp) && st.fill !== "#ffffff";
        if (!stroked && !filled) break;
        const scale = Math.hypot(st.ctm[0], st.ctm[1]);
        const width = r2(st.lineWidth * scale * MM_PER_PT);
        let cur = null;
        let start = null;
        const ring = [];
        let ringDone = false;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const note = (p) => {
          if (p[0] < minX) minX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] > maxY) maxY = p[1];
          if (!ringDone && ring.length < 64) ring.push(toMm(p));
        };
        const line = (a, b) => {
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

function isDashed(pattern) {
  return Array.isArray(pattern) && pattern.some((v) => Number(v) > 0);
}

function colour(Util, args) {
  if (typeof args[0] === "string") return args[0].toLowerCase();
  const [r, g, b] = args.map((v) => Math.round(Number(v)));
  return Util.makeHexColor(r, g, b).toLowerCase();
}
