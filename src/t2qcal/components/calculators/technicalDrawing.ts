import {drawNativeExtra} from "./nativeExtraDrawing";
import { drawLayout } from "./layoutDrawing";
import { drawTradeSheet, ROOF_PROFILES } from "./tradeSheets";
import { tubeCutProfile } from "../../lib/tube-cut";

export type DiagramKind = "nativering" | "nativeringtemplate" | "nativedrain" | "nativedrainprofile" | "roof" | "stairs" | "stairdetail" | "spacing" | "masonry" | "tube" | "circle" | "deck" | "triangle" | "grid" | "arch" | "cone" | "scale" | "balusters" | "studwall" | "cladding" | "rebarplan" | "kerf" | "shelfbay" | "protractorface" | "ovalplan" | "paving" | "postholes" | "tilerow" | "roomplan" | "sheetlayout" | "timberstack" | "paintwall" | "trench" | "slabpour" | "dualscale" | "moneybar" | "rulerin" | "pitchgauge" | "levelvial" | "rampside" | "bracedframe" | "goldenspiral" | "pyramidplan" | "miterjoint" | "boltring" | "segmentarc" | "blockring" | "edgebeamplan" | "railsection" | "platemark" | "markplate" | "battensection" | "glasspanel" | "glassplan" | "wainscotelev" | "wainscotsection" | "shelfsection" | "openingdetail" | "kerfbent" | "barsection" | "barbend" | "fastenrow" | "fastendetail" | "stringermark" | "spinedetail" | "rampplan" | "panelelev" | "spiralplan" | "roofplan" | "raftercut" | "cuttemplate" | "soffitdetail" | "bullnoseprofile" | "tubeend" | "miterend" | "sheetpierce" | "sqtubemiter" | "threewayjoint" | "bendarc" | "piecutwedges" | "reducerelev" | "anglelegs" | "dividerstep" | "circlequad" | "tapewrap" | "fencebay" | "fenceplan" | "postmortise" | "segmentdetail" | "diagcheck" | "goldenline" | "bracecut" | "slabsection" | "convtable" | "rulerpair" | "areasquares" | "volumecubes" | "scalepan" | "scaledraw" | "sixteenthrule" | "fallsection" | "costsplit" | "roof3d" | "stairs3d" | "spiral3d" | "spacing3d" | "masonry3d" | "tube3d" | "circle3d" | "cone3d" | "arch3d" | "slab3d" | "deck3d" | "pyramid3d" | "solid3d";

/*
 * Drawing conventions follow blocklayer.com: white sheet, no border or title block,
 * Verdana text in mixed case, hairline extension lines in silver, and dimensions
 * expressed as arrow glyphs inside the label text rather than drawn arrowheads.
 */

export const BLACK = "#000";
export const BLUE = "#00f";      // running set-out dimensions
export const RED = "#f00";       // adjusted or warning values
export const GREEN = "#080";     // angles
export const SILVER = "#c0c0c0"; // extension and dimension hairlines
export const GREY = "#666";      // secondary annotation
export const FILL = "#dcdcdc";   // concrete, steel and neutral material
export const PALE = "#ebebeb";   // plan area wash

// Isometric face tones. Blocklayer has no 3D views, so rather than an ad-hoc set
// of greys these extend FILL into one documented three-step ramp.
export const FACE_LIT = "#ededed";
export const FACE_MID = FILL;
export const FACE_DARK = "#c9c9c9";
export const WHITE = "#fff";
const FACE = "Verdana, Geneva, sans-serif";

export const HAIR = 0.5;

export function font(size = 12, weight = "") {
  return `${weight ? `${weight} ` : ""}${size}px ${FACE}`;
}

/*
 * Material textures.
 *
 * Blocklayer fills its members from four tiled photographs — woodHoriz, woodVert,
 * woodEnd and conc. Those images are theirs, so these are generated procedurally
 * and colour-matched to them: long grain averages rgb(188,122,45) over a tight
 * luminance band (~103-164), end grain averages rgb(177,135,85) across a much
 * wider band (~79-198) because of the growth rings, and concrete averages a
 * neutral rgb(166,166,161).
 */

export type Grain = "horiz" | "vert" | "end";

/** Deterministic noise, so a redraw never shimmers. */
function rnd(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const tiles = new Map<string, HTMLCanvasElement>();

function makeTile(key: string, w: number, h: number, paint: (t: CanvasRenderingContext2D) => void) {
  const cached = tiles.get(key);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const tile = document.createElement("canvas");
  tile.width = w;
  tile.height = h;
  const t = tile.getContext("2d");
  if (!t) return null;
  paint(t);
  tiles.set(key, tile);
  return tile;
}

/**
 * Tone profiles are written straight into pixel data. Painting translucent
 * strokes could not reach blocklayer's contrast — their long grain spans a
 * luminance of roughly 103-164 about a 132 median, and their end grain and
 * concrete are wider still.
 */
function paintPixels(t: CanvasRenderingContext2D, w: number, h: number, tone: (x: number, y: number) => [number, number, number]) {
  const img = t.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const [r, g, b] = tone(x, y);
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  t.putImageData(img, 0, 0);
}

const clamp255 = (v: number) => v < 0 ? 0 : v > 255 ? 255 : v | 0;

/** Smooth value noise, so bands wander instead of repeating as clean sines. */
function noise1(seed: number, count: number) {
  const random = rnd(seed);
  const pts = Array.from({ length: count }, () => random() * 2 - 1);
  return (u: number) => {
    const f = ((u % 1) + 1) % 1 * count;
    const i = Math.floor(f), frac = f - i;
    const a = pts[i % count], b = pts[(i + 1) % count];
    const s = frac * frac * (3 - 2 * frac);
    return a + (b - a) * s;
  };
}

/** Long grain: tonal bands across the board with darker grain lines along it. */
function longGrainTile(vertical: boolean) {
  const w = vertical ? 150 : 210, h = vertical ? 210 : 150;
  return makeTile(vertical ? "woodVert" : "woodHoriz", w, h, (t) => {
    const across = vertical ? w : h;
    const run = vertical ? h : w;
    // three octaves across the width give the broad bands, then the fine grain
    const band = noise1(vertical ? 9271 : 4423, 7);
    const fine = noise1(vertical ? 5519 : 8831, 23);
    const grain = noise1(vertical ? 6143 : 2207, 61);
    // wander the bands along the length so tiles do not read as ruled stripes
    const drift = noise1(vertical ? 4001 : 7333, 5);

    paintPixels(t, w, h, (x, y) => {
      const a = (vertical ? x : y);           // across the grain
      const d = (vertical ? y : x) / run;     // along the grain
      const u = (a + drift(d) * 9) / across;
      // amplitudes chosen to land p5/p95 near 103/164 about a 132 median
      let k = 1
        + band(u) * .222
        + fine(u * 3.1) * .107
        + grain(u * 8.7) * .074;
      // occasional hard grain line, as on sawn softwood
      if (grain(u * 8.7) < -.55) k -= .12;
      return [clamp255(188 * k), clamp255(122 * k), clamp255(45 * k + 6 * (k - 1))];
    });
  });
}

/** End grain: concentric growth rings, a much wider tonal range. */
function endGrainTile() {
  return makeTile("woodEnd", 190, 150, (t) => {
    const ring = noise1(7717, 29);
    const wob = noise1(3313, 9);
    const cx = -34, cy = 75;
    paintPixels(t, 190, 150, (x, y) => {
      const dx = x - cx, dy = y - cy;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      // rings, distorted slightly so they are not perfect circles
      const rr = r + wob(a / (Math.PI * 2) + .5) * 7;
      const phase = rr / 13;
      let k = 1
        + Math.sin(phase * Math.PI * 2) * .215
        + ring(rr / 190) * .249;
      if (Math.sin(phase * Math.PI * 2) < -.72) k -= .215;  // dark latewood band
      return [clamp255(188 * k), clamp255(143 * k), clamp255(90 * k)];
    });
  });
}

/** Concrete: fine aggregate speckle over neutral grey. */
function concreteTile() {
  return makeTile("conc", 170, 130, (t) => {
    const random = rnd(3391);
    const blotch = noise1(1277, 13);
    paintPixels(t, 170, 130, (x, y) => {
      const soft = blotch((x * .7 + y * 1.3) / 170) * .128;
      // per-pixel speckle carries most of concrete's wide histogram
      const grit = (random() - .5) * .43;
      const k = 1 + soft + grit;
      const v = clamp255(166 * k);
      return [v, v, clamp255(161 * k)];
    });
    // scattered aggregate
    const rand2 = rnd(8123);
    for (let i = 0; i < 90; i++) {
      const g = 110 + rand2() * 110;
      t.beginPath();
      t.ellipse(rand2() * 170, rand2() * 130, 1.2 + rand2() * 3.2, 1 + rand2() * 2.4, rand2() * Math.PI, 0, Math.PI * 2);
      t.fillStyle = `rgba(${g | 0},${g | 0},${(g * .97) | 0},${.35 + rand2() * .4})`;
      t.fill();
    }
  });
}

function pattern(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement | null, fallback: string) {
  if (!tile) return fallback;
  return ctx.createPattern(tile, "repeat") || fallback;
}

/** Timber fill. `grain` follows the member's axis; "end" is the sawn end. */
export function wood(ctx: CanvasRenderingContext2D, grain: Grain = "horiz"): string | CanvasPattern {
  if (grain === "end") return pattern(ctx, endGrainTile(), "#b18755");
  return pattern(ctx, longGrainTile(grain === "vert"), "#bc7a2d");
}

/** Concrete, block and steel fill. */
export function concrete(ctx: CanvasRenderingContext2D): string | CanvasPattern {
  return pattern(ctx, concreteTile(), "#a6a6a1");
}

/** Picks the grain orientation that suits a member drawn between two points. */
export function grainFor(x1: number, y1: number, x2: number, y2: number): Grain {
  return Math.abs(x2 - x1) >= Math.abs(y2 - y1) ? "horiz" : "vert";
}

// Sheet extents, recorded so text can be kept inside the drawing area.
let sheetW = 0;
let sheetH = 0;

/** White sheet. Blocklayer draws no border, grid or title block. */
export function prepareSheet(ctx: CanvasRenderingContext2D, width: number, height: number) {
  sheetW = width;
  sheetH = height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.font = font(12);
  ctx.setLineDash([]);
}

export function strokeLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = BLACK, lineWidth = 1, dashed = false) {
  ctx.save();
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** Silver 0.5px construction line — the blocklayer extension-line weight. */
export function hairline(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = SILVER) {
  strokeLine(ctx, x1, y1, x2, y2, color, HAIR);
}

/**
 * Plain text with no background plate. The position is nudged so the glyphs stay
 * on the sheet — a label that would hang off the edge is unreadable, and callers
 * anchor to geometry that can sit near the margin.
 */
export function note(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = BLACK, align: CanvasTextAlign = "center", size = 12, weight = "") {
  ctx.save();
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text, sheetW > 0 ? clampText(ctx, text, x, align) : x, sheetH > 0 ? Math.min(Math.max(y, size), sheetH - size * .8) : y);
  ctx.restore();
}

/** Shifts a text anchor so the drawn run stays within the sheet. */
function clampText(ctx: CanvasRenderingContext2D, text: string, x: number, align: CanvasTextAlign) {
  const w = ctx.measureText(text).width;
  const pad = 3;
  const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  if (left < pad) return x + (pad - left);
  const overflow = left + w - (sheetW - pad);
  if (overflow > 0) return x - overflow;
  return x;
}

/**
 * Stacked plain sentences, as used across the middle of blocklayer sheets.
 * `backing` clears a white panel first, for blocks that sit over geometry.
 */
export function infoLines(ctx: CanvasRenderingContext2D, lines: (string | [string, string])[], x: number, y: number, align: CanvasTextAlign = "center", size = 12, gap = 19, backing = false) {
  if (backing && lines.length) {
    ctx.save();
    ctx.font = font(size);
    const widest = Math.max(...lines.map((line) => ctx.measureText(Array.isArray(line) ? line[0] : line).width));
    const bx = align === "center" ? x - widest / 2 : align === "right" ? x - widest : x;
    ctx.fillStyle = WHITE;
    ctx.fillRect(bx - 7, y - size, widest + 14, (lines.length - 1) * gap + size * 1.7);
    ctx.restore();
  }
  lines.forEach((line, index) => {
    const [text, color] = Array.isArray(line) ? line : [line, BLACK];
    note(ctx, text, x, y + index * gap, color, align, size);
  });
}

/** Text label joined to a feature by a thin leader. */
export function leader(ctx: CanvasRenderingContext2D, text: string, fromX: number, fromY: number, toX: number, toY: number, color = BLACK, size = 12) {
  hairline(ctx, fromX, fromY, toX, toY, SILVER);
  const align: CanvasTextAlign = toX >= fromX ? "left" : "right";
  note(ctx, text, toX + (align === "left" ? 5 : -5), toY, color, align, size);
}

/**
 * Blocklayer dimension: long silver extension lines at each end plus a single
 * label rotated onto the dimension axis, with arrow glyphs standing in for
 * arrowheads. `offset` pushes the label off the measured line.
 */
export function dimension(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  text: string,
  color: string = BLACK,
  offset = 0,
  options: { extend?: boolean; arrows?: boolean; size?: number; extra?: number } = {},
) {
  const { extend = true, arrows = true, size = 12, extra = 10 } = options;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(Math.hypot(dx, dy), .001);
  const nx = -dy / length;
  const ny = dx / length;
  const ax = x1 + nx * offset;
  const ay = y1 + ny * offset;
  const bx = x2 + nx * offset;
  const by = y2 + ny * offset;

  if (extend && Math.abs(offset) > .5) {
    hairline(ctx, x1, y1, ax + nx * Math.sign(offset) * extra, ay + ny * Math.sign(offset) * extra);
    hairline(ctx, x2, y2, bx + nx * Math.sign(offset) * extra, by + ny * Math.sign(offset) * extra);
  }
  // the dimension line itself; the label's white backing breaks it in the middle
  hairline(ctx, ax, ay, bx, by);

  let angle = Math.atan2(by - ay, bx - ax);
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI; // keep text upright

  const label = arrows ? `← ${text} →` : text;
  ctx.save();
  ctx.font = font(size);
  const measured = ctx.measureText(label).width;
  // Slide the label along its own line back onto the sheet when the dimension
  // is staged near an edge — the rotated equivalent of the clamp every plain
  // note already gets.
  const hx = Math.abs(Math.cos(angle)) * measured / 2 + Math.abs(Math.sin(angle)) * size * .72;
  const hy = Math.abs(Math.sin(angle)) * measured / 2 + Math.abs(Math.cos(angle)) * size * .72;
  let midX = (ax + bx) / 2;
  let midY = (ay + by) / 2;
  if (sheetW > 0) midX = Math.min(Math.max(midX, hx + 2), sheetW - hx - 2);
  if (sheetH > 0) midY = Math.min(Math.max(midY, hy + 2), sheetH - hy - 2);
  ctx.translate(midX, midY);
  ctx.rotate(angle);
  // Clear the hairline behind the text so the label stays legible.
  ctx.fillStyle = WHITE;
  ctx.fillRect(-measured / 2 - 3, -size * .72, measured + 6, size * 1.44);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/** Tight dimension where only a double-headed glyph fits, e.g. "↕ 180". */
export function shortDimension(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, vertical = true, color = BLACK, align: CanvasTextAlign = "left", size = 12) {
  note(ctx, vertical ? `↕ ${text}` : `↔ ${text}`, x, y, color, align, size);
}

/** Running set-out figure printed along a member, rotated upright. Blue by convention. */
export function setOutMark(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = BLUE, size = 11) {
  ctx.save();
  ctx.font = font(size);
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "left";
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Bold green angle callout. */
export function angleLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = "center") {
  note(ctx, text, x, y, GREEN, align, 15, "bold");
}

export function angleArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, from: number, to: number, text: string) {
  ctx.save();
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = HAIR;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, from, to);
  ctx.stroke();
  ctx.restore();
  const mid = (from + to) / 2;
  angleLabel(ctx, text, cx + Math.cos(mid) * (radius + 24), cy + Math.sin(mid) * (radius + 24));
}

/** Small centre cross. Blocklayer keeps these very light. */
export function centerMark(ctx: CanvasRenderingContext2D, x: number, y: number, text?: string, color = BLACK) {
  strokeLine(ctx, x - 6, y, x + 6, y, color, HAIR);
  strokeLine(ctx, x, y - 6, x, y + 6, color, HAIR);
  if (text) note(ctx, text, x + 8, y - 8, color, "left", 11);
}

export function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, spacing = 8) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  for (let d = -height; d < width + height; d += spacing) strokeLine(ctx, x + d, y + height, x + d + height, y, "#b0b0b0", HAIR);
  ctx.restore();
}

/** Filled shape with a thin black outline — the blocklayer material convention. */
export function shape(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], fill: string | CanvasPattern, outline = BLACK, lineWidth = 1) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export function plate(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string | CanvasPattern = FILL, outline = BLACK) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
  }
}

/**
 * Timber member drawn as a rectangle swept along its axis. The grain follows the
 * member unless an explicit fill is supplied, and the pattern is rotated onto the
 * member's axis so a raking piece still reads as sawn timber rather than a
 * horizontally-striped block.
 */
export function member(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, depth: number, fill?: string | CanvasPattern) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(Math.hypot(dx, dy), .001);
  const nx = -dy / length * depth / 2;
  const ny = dx / length * depth / 2;
  const corners = [
    { x: x1 + nx, y: y1 + ny },
    { x: x2 + nx, y: y2 + ny },
    { x: x2 - nx, y: y2 - ny },
    { x: x1 - nx, y: y1 - ny },
  ];
  if (fill) { shape(ctx, corners, fill, BLACK, 1); return; }

  const angle = Math.atan2(dy, dx);
  const steep = Math.abs(dy) > Math.abs(dx);
  const grainFill = wood(ctx, steep ? "vert" : "horiz");
  // rotate the tile onto the member axis (the tile's own grain is already
  // along that axis, so only the residual tilt is applied)
  if (typeof grainFill !== "string" && grainFill.setTransform) {
    const spin = steep ? angle - Math.PI / 2 : angle;
    grainFill.setTransform(new DOMMatrix().translateSelf(x1, y1).rotateSelf(spin * 180 / Math.PI));
  }
  shape(ctx, corners, grainFill, BLACK, 1);
}

function safe(value: number, fallback = 1) { return Number.isFinite(value) && value > 0 ? value : fallback; }
const radians = (degrees: number) => degrees * Math.PI / 180;

type Point3 = { x: number; y: number; z: number };
type Point2 = { x: number; y: number };

export function to3DKind(kind: DiagramKind): DiagramKind {
  if (kind.endsWith("3d")) return kind;
  if (kind === "roof") return "roof3d";
  if (kind === "stairs" || kind === "stairdetail") return "stairs3d";
  if (kind === "spacing" || kind === "balusters" || kind === "studwall") return "spacing3d";
  if (kind === "masonry" || kind === "arch" || kind === "cladding") return "masonry3d";
  if (kind === "tube") return "tube3d";
  if (kind === "circle" || kind === "cone" || kind === "protractorface" || kind === "ovalplan" || kind === "paving") return "circle3d";
  if (kind === "rebarplan" || kind === "trench" || kind === "slabpour" || kind === "roomplan" || kind === "edgebeamplan") return "slab3d";
  if (kind === "deck" || kind === "grid" || kind === "postholes" || kind === "tilerow") return "deck3d";
  if (kind === "sheetlayout" || kind === "paintwall") return "masonry3d";
  if (kind === "goldenspiral" || kind === "boltring" || kind === "segmentarc" || kind === "blockring") return "circle3d";
  if (kind === "pitchgauge") return "roof3d";
  if (kind === "rampside") return "stairs3d";
  if (kind === "pyramidplan") return "pyramid3d";
  // the sheets added for the per-calculator review, mapped to the solid each
  // one actually stands up as
  if (kind === "railsection" || kind === "platemark" || kind === "markplate" ||
      kind === "battensection" || kind === "glasspanel" || kind === "glassplan" ||
      kind === "wainscotelev" || kind === "wainscotsection" || kind === "openingdetail" ||
      kind === "fastenrow" || kind === "fastendetail" ||
      kind === "fencebay" || kind === "fenceplan" || kind === "postmortise") return "spacing3d";
  if (kind === "barsection" || kind === "barbend" || kind === "slabsection") return "slab3d";
  if (kind === "stringermark" || kind === "spinedetail" || kind === "panelelev") return "stairs3d";
  if (kind === "spiralplan") return "spiral3d";
  if (kind === "roofplan" || kind === "raftercut" || kind === "cuttemplate" ||
      kind === "soffitdetail" || kind === "bullnoseprofile") return "roof3d";
  if (kind === "tubeend" || kind === "miterend" || kind === "sheetpierce" ||
      kind === "sqtubemiter" || kind === "threewayjoint" ||
      kind === "bendarc" || kind === "piecutwedges") return "tube3d";
  if (kind === "reducerelev") return "cone3d";
  if (kind === "anglelegs" || kind === "dividerstep" || kind === "circlequad" ||
      kind === "tapewrap" || kind === "segmentdetail") return "circle3d";
  return "solid3d";
}

/**
 * Every calculator now names its own sheets, so this only covers the two
 * families where a close-up is implied by the measured view itself. Returning
 * the same kind means "no second sheet" — there is deliberately no generic
 * stand-in to fall back on, because a shared stand-in is what made different
 * calculators draw the same picture.
 */
export function detailKind(kind: DiagramKind): DiagramKind {
  if (kind === "roof" || kind === "roof3d") return "triangle";
  if (kind === "stairs" || kind === "stairs3d" || kind === "stairdetail") return "stairdetail";
  // the handful of calculators that carry a single measured sheet and still earn
  // a second view; everything else names its own sheets outright
  if (kind === "spacing") return "markplate";
  if (kind === "circle") return "segmentdetail";
  if (kind === "dualscale") return "convtable";
  if (kind === "pitchgauge") return "triangle";
  return kind;
}

/**
 * Model extents [x, y, z] per isometric kind, including the offsets the
 * dimensions are staged at. Used to fit and centre each model on the sheet.
 */
const ISO_EXTENT: Record<string, [number, number, number]> = {
  roof3d: [3.1, 2.0, 1.5],
  spiral3d: [3.0, 2.2, 2.2],
  stairs3d: [2.9, 1.6, 1.8],
  tube3d: [3.0, 1.4, 2.1],
  slab3d: [3.0, 2.6, 0.4],
  arch3d: [2.9, 1.7, 2.3],
  masonry3d: [3.0, 1.5, 1.35],
  cone3d: [2.7, 2.1, 1.75],
  circle3d: [2.8, 2.3, 0.6],
  spacing3d: [3.0, 2.5, 1.0],
  deck3d: [3.0, 2.5, 1.0],
  pyramid3d: [2.8, 2.2, 1.85],
  solid3d: [2.8, 2.2, 1.0],
};

function iso(point: Point3, origin: Point2, scale: number): Point2 {
  const cos = .8660254, sin = .5;
  return { x: origin.x + (point.x - point.y) * cos * scale, y: origin.y + (point.x + point.y) * sin * scale - point.z * scale };
}

function box3d(ctx: CanvasRenderingContext2D, project: (point: Point3) => Point2, x: number, y: number, z: number, dx: number, dy: number, dz: number, fill: string | CanvasPattern = FILL) {
  const p100 = project({ x: x + dx, y, z }), p010 = project({ x, y: y + dy, z }), p110 = project({ x: x + dx, y: y + dy, z });
  const p001 = project({ x, y, z: z + dz }), p101 = project({ x: x + dx, y, z: z + dz }), p011 = project({ x, y: y + dy, z: z + dz }), p111 = project({ x: x + dx, y: y + dy, z: z + dz });
  // A pattern (timber) wraps every face; plain material takes the shading ramp
  // so the solid reads without needing an ad-hoc colour per call site.
  const pattern = typeof fill === "string" ? null : fill;
  shape(ctx, [p010, p110, p111, p011], pattern || FACE_DARK);
  shape(ctx, [p100, p110, p111, p101], pattern || FACE_MID);
  shape(ctx, [p001, p101, p111, p011], pattern || FACE_LIT);
}

function member3d(ctx: CanvasRenderingContext2D, project: (point: Point3) => Point2, start: Point3, end: Point3, depth = 8, fill?: string | CanvasPattern, hidden = false) {
  const a = project(start), b = project(end);
  if (hidden) { strokeLine(ctx, a.x, a.y, b.x, b.y, GREY, HAIR, true); return; }
  member(ctx, a.x, a.y, b.x, b.y, depth, fill);
}

// Set per iso draw, like the sheet extents above, so the dimension staging can
// follow the model scale.
let isoScale = 55;

function isoDimension(ctx: CanvasRenderingContext2D, project: (point: Point3) => Point2, a: Point3, b: Point3, text: string, color = BLACK, offset = 20) {
  const pa = project(a), pb = project(b);
  // Isometric anchors sit close to the solid, so labels are staged further out
  // than on a flat sheet to keep them off the faces they measure. The stage-out
  // follows the model scale, so on a small sheet the labels pull in with the
  // model instead of crossing each other; at desktop sheet sizes it is unchanged.
  const stage = Math.min(1.7, Math.max(1.05, isoScale / 55));
  dimension(ctx, pa.x, pa.y, pb.x, pb.y, text, color, offset * stage);
}

function drawIsoDiagram(ctx: CanvasRenderingContext2D, width: number, height: number, kind: DiagramKind, values: Record<string, number>, unit: string) {
  prepareSheet(ctx, width, height);
  // Each model occupies a different volume, so a single fit factor left most of
  // them small on the sheet. Fit and centre the projected bounding box instead.
  let [ex, ey, ez] = ISO_EXTENT[kind] || ISO_EXTENT.solid3d;
  if (kind === "roof3d" && !values.model) {
    const length = safe(values.length || values.span || values.run, 6000), widthValue = safe(values.width || values.diameter || values.memberWidth, 4000);
    const rise = values.rise ?? widthValue / 2 * Math.tan(radians(values.angle ?? 30));
    ex = 3.2; ey = 2.8 * widthValue / length + .95; ez = .65 + 2.8 * rise / length;
  }
  const spanW = (ex + ey) * .8660254;
  const spanH = (ex + ey) * .5 + ez;
  // Room for the dimension labels staged outside the model. On a phone-sized
  // sheet the full drawing-office margin would eat half the canvas, so it
  // shrinks proportionally — unchanged at desktop sheet sizes.
  const marginX = Math.min(76, width * .14);
  const marginY = Math.min(62, height * .13);
  const scale = Math.max(.000001, Math.min((width - marginX * 2) / spanW, (height - marginY * 2) / spanH));
  isoScale = scale;
  const origin = {
    x: width / 2 - (ex - ey) * .8660254 * scale / 2,
    y: height / 2 - ((ex + ey) * .5 - ez) * scale / 2,
  };
  const project = (point: Point3) => iso(point, origin, scale);
  const fmt = (value: number) => `${new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)} ${unit}`;
  const lengthValue = safe(values.length || values.span || values.run, 6000);
  const widthValue = safe(values.width || values.diameter || values.memberWidth, 4000);
  const heightValue = safe(values.height || values.totalRise || values.rise || values.thickness, 2400);
  const angle = values.angle || 30;
  const timber = wood(ctx);

  if (kind === "roof3d") {
    // the hip closes to a shortened ridge, the lean-to falls one way, the
    // gambrel breaks at a knee and the saltbox sets its ridge off centre
    const type = Math.round(values.roofType || 0);
    const roofModel = Math.round(values.model || 0);
    const oneSide = values.oneSide === 1 || type === 2;
    if (roofModel > 0) {
      const rAngle = radians(Math.min(Math.max(values.angle || 30, 5), 70));
      let rCaption = "";
      if (roofModel === 1) {
        // one rafter pair sitting on its plates, which is what the tool solves
        box3d(ctx, project, .1, .6, 0, .36, .5, .42, concrete(ctx));
        box3d(ctx, project, 2.3, .6, 0, .36, .5, .42, concrete(ctx));
        box3d(ctx, project, .08, .55, .42, .42, .6, .1, timber);
        box3d(ctx, project, 2.28, .55, .42, .42, .6, .1, timber);
        const apexZ = Math.min(.52 + Math.tan(rAngle) * 1.15, 1.8);
        for (const y of [.62, 1.0]) {
          member3d(ctx, project, { x: -.15, y, z: .5 }, { x: 1.4, y, z: apexZ }, 16, timber);
          member3d(ctx, project, { x: 1.4, y, z: apexZ }, { x: 2.95, y, z: .5 }, 16, timber);
        }
        box3d(ctx, project, 1.34, .55, apexZ - .1, .12, .6, .34, timber);
        rCaption = "One rafter pair on the wall plates";
      } else if (roofModel === 2) {
        // the eave: tail, fascia and soffit off the wall
        box3d(ctx, project, 1.5, .5, 0, 1.5, .7, 1.4, concrete(ctx));
        box3d(ctx, project, 1.45, .45, 1.4, .5, .8, .1, timber);
        member3d(ctx, project, { x: .35, y: .85, z: 1.5 }, { x: 2.6, y: .85, z: 1.5 + Math.tan(rAngle) * 1.5 }, 12, timber);
        box3d(ctx, project, .25, .6, 1.15, .1, .55, .4, timber);
        box3d(ctx, project, .3, .55, 1.12, 1.25, .7, .06, FILL);
        rCaption = "Eave - rafter tail, fascia and soffit";
      } else if (roofModel === 3) {
        // the bullnose: a long straight run turning down through its curve
        box3d(ctx, project, 1.9, .45, 0, 1.0, .9, .95, concrete(ctx));
        const bx = 1.9, bz = 1.05, br = .85;
        for (let y = .5; y <= 1.3; y += .4) {
          let prior = { x: bx, y, z: bz + br };
          const runIn = project({ x: 3.0, y, z: bz + br }), runOut = project(prior);
          member(ctx, runIn.x, runIn.y, runOut.x, runOut.y, 10, FACE_LIT);
          for (let i = 1; i <= 14; i++) {
            const a2 = Math.PI * .55 * i / 14;
            const next = { x: bx - Math.sin(a2) * br, y, z: bz + Math.cos(a2) * br };
            const p0 = project(prior), p1 = project(next);
            member(ctx, p0.x, p0.y, p1.x, p1.y, 10, FILL);
            prior = next;
          }
        }
        rCaption = "Straight run turning down through the bullnose";
      } else if (roofModel === 4) {
        // a polygon gazebo: hips to every corner off a centre hub
        const sides = Math.max(3, Math.min(16, Math.round(values.segments || values.count || 8)));
        const gcx = 1.5, gcy = .95, gr = 1.25;
        const apex = { x: gcx, y: gcy, z: 1.05 + Math.tan(rAngle) * .7 };
        const ring = Array.from({ length: sides }, (_, i) => {
          const a2 = i * Math.PI * 2 / sides;
          return { x: gcx + Math.cos(a2) * gr, y: gcy + Math.sin(a2) * gr * .78, z: .5 };
        });
        ring.forEach((corner, i) => {
          shape(ctx, [corner, ring[(i + 1) % sides], apex].map(project), i % 2 === 0 ? FACE_LIT : FACE_MID);
          box3d(ctx, project, corner.x - .05, corner.y - .05, 0, .11, .11, .5, timber);
        });
        for (const corner of ring) member3d(ctx, project, { ...corner, z: corner.z + .02 }, { ...apex, z: apex.z + .02 }, 6, timber);
        rCaption = `${sides}-sided gazebo - hips to every corner`;
      } else {
        // sheets running up the roof plane
        box3d(ctx, project, 0, 0, 0, 2.8, 1.75, .4, FILL);
        const plane = 1.75 * Math.tan(rAngle);
        const cols = Math.max(2, Math.min(14, Math.round(values.columns || values.count || 8)));
        for (let i = 0; i < cols; i++) {
          const x = .08 + i * 2.64 / cols, cw = 2.64 / cols - .03;
          shape(ctx, [{ x, y: 0, z: .42 }, { x: x + cw, y: 0, z: .42 },
            { x: x + cw, y: 1.75, z: .42 + plane }, { x, y: 1.75, z: .42 + plane }].map(project),
            i % 2 === 0 ? FACE_LIT : FACE_MID);
        }
        rCaption = `${cols} Sheets up the roof plane`;
      }
      isoDimension(ctx, project, { x: 0, y: -.7, z: 0 }, { x: 2.8, y: -.7, z: 0 }, fmt(lengthValue), BLACK, 26);
      infoLines(ctx, [rCaption], width * .5, 26);
      return;
    }
    const positionCount = Math.min(1000, Math.max(2, Math.round(values.count ?? 10)));
    const positions = Array.from({length:positionCount},(_,i)=>i*2.8/(positionCount-1));
    const modelWidth = 2.8 * widthValue / lengthValue;
    const modelRise = 2.8 * (values.rise ?? widthValue / 2 * Math.tan(radians(angle))) / lengthValue;
    box3d(ctx, project, 0, 0, 0, 2.8, modelWidth, .52);
    const z = .52, ridgeZ = .52 + modelRise;
    const ridgeY = type === 4 ? modelWidth * (values.run ?? widthValue / 2) / widthValue : modelWidth / 2;
    const inset = type === 1 ? ridgeY : 0;
    const r0 = { x: inset, y: ridgeY, z: ridgeZ }, r1 = { x: 2.8 - inset, y: ridgeY, z: ridgeZ };
    const e0 = { x: 0, y: 0, z }, e1 = { x: 2.8, y: 0, z };
    const b0 = { x: 0, y: modelWidth, z }, b1 = { x: 2.8, y: modelWidth, z };
    if (oneSide) {
      const h0 = { x: 0, y: 0, z: ridgeZ }, h1 = { x: 2.8, y: 0, z: ridgeZ };
      shape(ctx, [h0, h1, b1, b0].map(project), FACE_LIT);
      shape(ctx, [e0, h0, b0].map(project), FACE_MID);
      shape(ctx, [e1, b1, h1].map(project), FACE_DARK);
      for (const x of positions) member3d(ctx, project, { x, y: modelWidth, z: z + .02 }, { x, y: 0, z: ridgeZ + .02 }, 5, timber);
      member3d(ctx, project, { x: 0, y: 0, z: ridgeZ + .04 }, { x: 2.8, y: 0, z: ridgeZ + .04 }, 9, timber);
    } else if (type === 3) {
      const kneeZ = z + modelWidth / 4 * Math.tan(radians(values.angle2 ?? 60)), kneeY0 = modelWidth / 4, kneeY1 = modelWidth * .75;
      shape(ctx, [e0, e1, { x: 2.8, y: kneeY0, z: kneeZ }, { x: 0, y: kneeY0, z: kneeZ }].map(project), FACE_LIT);
      shape(ctx, [{ x: 0, y: kneeY0, z: kneeZ }, { x: 2.8, y: kneeY0, z: kneeZ }, r1, r0].map(project), FACE_LIT);
      shape(ctx, [b0, { x: 0, y: kneeY1, z: kneeZ }, { x: 2.8, y: kneeY1, z: kneeZ }, b1].map(project), FACE_MID);
      shape(ctx, [{ x: 0, y: kneeY1, z: kneeZ }, r0, r1, { x: 2.8, y: kneeY1, z: kneeZ }].map(project), FACE_MID);
      shape(ctx, [e0, { x: 0, y: kneeY0, z: kneeZ }, r0, { x: 0, y: kneeY1, z: kneeZ }, b0].map(project), FACE_LIT);
      shape(ctx, [e1, b1, { x: 2.8, y: kneeY1, z: kneeZ }, r1, { x: 2.8, y: kneeY0, z: kneeZ }].map(project), FACE_DARK);
      for (const x of positions) {
        member3d(ctx, project, { x, y: 0, z: z + .02 }, { x, y: kneeY0, z: kneeZ + .02 }, 5, timber);
        member3d(ctx, project, { x, y: kneeY0, z: kneeZ + .02 }, { x, y: ridgeY, z: ridgeZ + .02 }, 5, timber);
        member3d(ctx, project, { x, y: modelWidth, z: z + .02 }, { x, y: kneeY1, z: kneeZ + .02 }, 5, timber);
        member3d(ctx, project, { x, y: kneeY1, z: kneeZ + .02 }, { x, y: ridgeY, z: ridgeZ + .02 }, 5, timber);
      }
      member3d(ctx, project, { x: 0, y: kneeY0, z: kneeZ + .04 }, { x: 2.8, y: kneeY0, z: kneeZ + .04 }, 7, timber);
      member3d(ctx, project, { x: 0, y: kneeY1, z: kneeZ + .04 }, { x: 2.8, y: kneeY1, z: kneeZ + .04 }, 7, timber);
    } else {
      shape(ctx, [e0, e1, r1, r0].map(project), FACE_LIT);
      shape(ctx, [b0, r0, r1, b1].map(project), FACE_MID);
      shape(ctx, [e0, r0, b0].map(project), FACE_LIT);
      shape(ctx, [e1, b1, r1].map(project), FACE_DARK);
      for (const x of positions) {
        const y=type===1?Math.min(x,2.8-x,ridgeY):ridgeY;
        const upper=type===1?z+modelRise*y/Math.max(.001,ridgeY):ridgeZ;
        member3d(ctx,project,{x,y:0,z:z+.02},{x,y,z:upper+.02},5,timber);
        member3d(ctx,project,{x,y:modelWidth,z:z+.02},{x,y:type===1?modelWidth-y:ridgeY,z:upper+.02},5,timber);
      }
      if (type === 1) {
        for (const [corner, head] of [[e0, r0], [b0, r0], [e1, r1], [b1, r1]] as [Point3, Point3][]) {
          member3d(ctx, project, { ...corner, z: corner.z + .03 }, { ...head, z: head.z + .03 }, 8, timber);
        }
      }
    }
    if (!oneSide) member3d(ctx, project, { x: r0.x, y: ridgeY, z: ridgeZ + .04 }, { x: r1.x, y: ridgeY, z: ridgeZ + .04 }, 9, timber);
    isoDimension(ctx, project, { x: 0, y: -.75, z: 0 }, { x: 2.8, y: -.75, z: 0 }, fmt(lengthValue), BLACK, 26);
    isoDimension(ctx, project, { x: 3.02, y: 0, z: 0 }, { x: 3.02, y: modelWidth, z: 0 }, fmt(widthValue), BLACK, -26);
    isoDimension(ctx, project, { x: 3.08, y: modelWidth + .17, z }, { x: 3.08, y: modelWidth + .17, z: ridgeZ }, fmt(values.rise ?? heightValue), BLACK, -22);
    const shapes = ["Ridge over centre of span", "Hips to four corners - ridge shortened",
      "Single plane falling one way", "Two pitches breaking at the knee",
      "Ridge off centre - unequal planes"];
    infoLines(ctx, [`Roof Pitch ${angle.toFixed(2)}°`, shapes[Math.min(type, 4)]], width * .5, 26);
  } else if (kind === "spiral3d") {
    const risers = Math.max(6, Math.min(22, Math.round(values.risers || values.count || 16)));
    const cx = 1.5, cy = 1.05, inner = .25, outer = 1.02, totalRise = 1.8;
    const totalTurn = Math.min(340, Math.max(180, values.rotation || 300));
    member3d(ctx, project, { x: cx, y: cy, z: .02 }, { x: cx, y: cy, z: totalRise + .28 }, 16, FILL);
    let previousRail: Point3 | null = null;
    for (let i = 0; i < risers; i++) {
      const a = -Math.PI / 2 + radians(totalTurn * i / Math.max(risers - 1, 1));
      const da = radians(totalTurn / Math.max(risers - 1, 1)) * .82;
      const zStep = .08 + i * totalRise / Math.max(risers - 1, 1);
      const points3: Point3[] = [
        { x: cx + Math.cos(a - da / 2) * inner, y: cy + Math.sin(a - da / 2) * inner, z: zStep },
        { x: cx + Math.cos(a - da / 2) * outer, y: cy + Math.sin(a - da / 2) * outer, z: zStep },
        { x: cx + Math.cos(a + da / 2) * outer, y: cy + Math.sin(a + da / 2) * outer, z: zStep },
        { x: cx + Math.cos(a + da / 2) * inner, y: cy + Math.sin(a + da / 2) * inner, z: zStep },
      ];
      shape(ctx, points3.map(project), timber);
      const railPoint = { x: cx + Math.cos(a) * (outer + .04), y: cy + Math.sin(a) * (outer + .04), z: zStep + .48 };
      member3d(ctx, project, { x: railPoint.x, y: railPoint.y, z: zStep }, railPoint, 3, FILL);
      if (previousRail) member3d(ctx, project, previousRail, railPoint, 4, timber);
      previousRail = railPoint;
    }
    isoDimension(ctx, project, { x: cx + 1.2, y: cy, z: .08 }, { x: cx + 1.2, y: cy, z: totalRise }, fmt(values.totalRise || values.height || 2800), BLACK, -24);
    const d0 = project({ x: cx - outer, y: cy, z: .02 }), d1 = project({ x: cx + outer, y: cy, z: .02 });
    dimension(ctx, d0.x, d0.y, d1.x, d1.y, `Ø ${fmt(values.diameter || outer * 2)}`, BLACK, 24);
    infoLines(ctx, [`${risers} Risers @ ${totalTurn.toFixed(1)}° Total Rotation`], width * .5, 26);
  } else if (kind === "stairs3d") {
    const risers = Math.max(3, Math.min(14, Math.round(values.risers || values.count || 12)));
    const stairModel = Math.round(values.model || 0);
    const totalRun = 2.7, totalRise = 1.7, stairWidth = 1.15;
    // stringer thickness follows the model scale so a small sheet keeps the
    // steps legible instead of two planks swallowing them
    const stringer = Math.max(6, scale * .12);
    if (stairModel === 2) {
      // a ramp: one continuous incline between two landings, no steps
      box3d(ctx, project, -.5, .15, -.12, .5, stairWidth, .12, concrete(ctx));
      box3d(ctx, project, totalRun, .15, totalRise - .12, .5, stairWidth, .12, concrete(ctx));
      shape(ctx, [{ x: 0, y: .15, z: 0 }, { x: totalRun, y: .15, z: totalRise },
        { x: totalRun, y: .15 + stairWidth, z: totalRise }, { x: 0, y: .15 + stairWidth, z: 0 }].map(project), FACE_LIT);
      member3d(ctx, project, { x: 0, y: .15, z: 0 }, { x: totalRun, y: .15, z: totalRise }, stringer, FACE_DARK);
      member3d(ctx, project, { x: 0, y: .15 + stairWidth, z: 0 }, { x: totalRun, y: .15 + stairWidth, z: totalRise }, stringer, FACE_MID);
      for (const y of [.15, .15 + stairWidth]) {
        member3d(ctx, project, { x: .1, y, z: .06 }, { x: .1, y, z: .62 }, 4, FILL);
        member3d(ctx, project, { x: totalRun - .1, y, z: totalRise + .02 }, { x: totalRun - .1, y, z: totalRise + .58 }, 4, FILL);
        member3d(ctx, project, { x: .1, y, z: .62 }, { x: totalRun - .1, y, z: totalRise + .58 }, 5, FILL);
      }
    } else {
      for (let i = 0; i < risers; i++) box3d(ctx, project, i * totalRun / risers, .15, i * totalRise / risers, totalRun / risers + .025, stairWidth, .09, FILL);
      if (stairModel === 1) {
        // steel spine: one centre beam with a bracket under each tread
        member3d(ctx, project, { x: 0, y: .65, z: -.12 }, { x: totalRun, y: .65, z: totalRise - .12 }, stringer * 1.5, FACE_DARK);
        for (let i = 0; i < risers; i++) {
          const x = i * totalRun / risers + totalRun / risers / 2;
          box3d(ctx, project, x, .66, i * totalRise / risers - .1, .06, .12, .12, FILL);
        }
      } else if (stairModel === 3) {
        // raked panels standing off the stair line
        member3d(ctx, project, { x: 0, y: .25, z: -.03 }, { x: totalRun, y: .25, z: totalRise }, stringer, timber);
        for (let i = 0; i <= risers; i++) {
          const x = i * totalRun / risers, z = i * totalRise / risers;
          box3d(ctx, project, x, .2, z, .06, .08, .85, timber);
          if (i < risers) box3d(ctx, project, x + .06, .22, z + .08, totalRun / risers - .06, .04, .68, PALE);
        }
        member3d(ctx, project, { x: 0, y: .22, z: .85 }, { x: totalRun, y: .22, z: totalRise + .85 }, stringer, timber);
      } else {
        member3d(ctx, project, { x: 0, y: .25, z: -.03 }, { x: totalRun, y: .25, z: totalRise }, stringer, timber);
        member3d(ctx, project, { x: 0, y: 1.2, z: -.03 }, { x: totalRun, y: 1.2, z: totalRise }, stringer, timber);
      }
    }
    isoDimension(ctx, project, { x: 0, y: -.5, z: 0 }, { x: totalRun, y: -.5, z: 0 }, fmt(values.totalRun || values.run || 3000), BLACK, 28);
    isoDimension(ctx, project, { x: totalRun, y: -.5, z: 0 }, { x: totalRun, y: -.5, z: totalRise }, fmt(values.totalRise || values.rise || 2800), BLACK, -26);
    isoDimension(ctx, project, { x: totalRun, y: .15, z: totalRise }, { x: totalRun, y: 1.3, z: totalRise }, fmt(values.width || 1000), BLACK, -14);
    const stairCaptions = [`${risers} Equal Risers - ${Math.max(2, risers - 1)} Treads`,
      "Treads on brackets off a single steel spine",
      "One continuous incline, landing each end",
      `${risers} Raked panels following the stair line`];
    infoLines(ctx, [stairCaptions[Math.min(stairModel, 3)]], width * .5, 26);
  } else if (kind === "tube3d") {
    const jointModel = Math.round(values.model || 0);
    const joint = project({ x: 1.5, y: 1, z: .62 }), end = project({ x: 1.5, y: 1, z: 2.05 });
    if (jointModel === 1) {
      // a miter turns the run rather than branching off it
      const m0 = project({ x: .2, y: 1, z: .62 }), m2 = project({ x: 2.6, y: 1, z: 1.9 });
      member(ctx, m0.x, m0.y, joint.x, joint.y, 32, FILL);
      member(ctx, joint.x, joint.y, m2.x, m2.y, 32, FILL);
    } else if (jointModel === 2) {
      // a tube passing through a flat sheet
      shape(ctx, [{ x: .2, y: .2, z: .62 }, { x: 2.8, y: .2, z: .62 }, { x: 2.8, y: 1.8, z: .62 }, { x: .2, y: 1.8, z: .62 }].map(project), FACE_LIT);
      const low = project({ x: 1.5, y: 1, z: .1 });
      member(ctx, low.x, low.y, end.x, end.y, 28, FILL);
    } else if (jointModel === 3) {
      // three arms meeting at one hub
      const h0 = project({ x: .2, y: 1, z: .62 }), h1 = project({ x: 2.8, y: .4, z: .62 });
      member(ctx, h0.x, h0.y, joint.x, joint.y, 30, FILL);
      member(ctx, joint.x, joint.y, h1.x, h1.y, 30, FILL);
      member(ctx, joint.x, joint.y, end.x, end.y, 28, FILL);
    } else if (jointModel === 4 || jointModel === 5) {
      // a bend swept round its radius, in one piece or in welded wedges
      const steps = jointModel === 5 ? Math.max(1, Math.min(12, Math.round(values.count || values.segments || 5))) : 24;
      const bcx = 1.0, bcz = .5, br = 1.2;
      let prior = { x: bcx, y: 1, z: bcz };
      const lead = project({ x: .15, y: 1, z: bcz }), leadEnd = project(prior);
      member(ctx, lead.x, lead.y, leadEnd.x, leadEnd.y, 28, FILL);
      for (let i = 1; i <= steps; i++) {
        const a2 = Math.PI / 2 * i / steps;
        const next = { x: bcx + Math.sin(a2) * br, y: 1, z: bcz + (1 - Math.cos(a2)) * br };
        const p0 = project(prior), p1 = project(next);
        member(ctx, p0.x, p0.y, p1.x, p1.y, 28, i % 2 === 0 || jointModel === 4 ? FILL : FACE_MID);
        prior = next;
      }
      const tail = project(prior), tailEnd = project({ ...prior, z: prior.z + .5 });
      member(ctx, tail.x, tail.y, tailEnd.x, tailEnd.y, 28, FILL);
    } else if (jointModel === 6) {
      // square section turning a mitred corner
      box3d(ctx, project, .2, .85, .45, 1.35, .32, .32, FILL);
      box3d(ctx, project, 1.4, .85, .45, .32, .32, 1.3, FILL);
    } else {
      const a = project({ x: .2, y: 1, z: .62 }), b = project({ x: 2.8, y: 1, z: .62 });
      member(ctx, a.x, a.y, b.x, b.y, 36, FILL);
      member(ctx, joint.x, joint.y, end.x, end.y, 28, FILL);
    }
    ctx.beginPath();
    ctx.ellipse(end.x, end.y, 15, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = FACE_LIT;
    ctx.fill();
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 1;
    ctx.stroke();
    centerMark(ctx, joint.x, joint.y);
    isoDimension(ctx, project, { x: .2, y: 1, z: .28 }, { x: 2.8, y: 1, z: .28 }, `Wrap πD ${fmt(Math.PI * (values.diameter || values.tubeDiameter || 60))}`, BLACK, 24);
    dimension(ctx, end.x - 15, end.y, end.x + 15, end.y, `Cut Ø ${fmt(values.diameter || values.tubeDiameter || 60)}`, BLACK, -19);
    const parentEnd = project({ x: .2, y: 1, z: .62 });
    dimension(ctx, parentEnd.x - 18, parentEnd.y, parentEnd.x + 18, parentEnd.y, `Parent Ø ${fmt(values.parentDiameter || 90)}`, BLACK, 20);
    infoLines(ctx, [`Intersection Angle ${angle.toFixed(2)}°`], width * .5, 26);
  } else if (kind === "slab3d") {
    const model = Math.round(values.model || 0);
    let caption = "Slab body with reinforcement datum";
    if (model === 1) {
      box3d(ctx, project, .18, .25, .05, 2.65, 1.62, .18, concrete(ctx));
      for (const [bx, by, bdx, bdy] of [[.18, .25, 2.65, .3], [.18, 1.57, 2.65, .3], [.18, .25, .3, 1.62], [2.53, .25, .3, 1.62]]) {
        box3d(ctx, project, bx, by, -.32, bdx, bdy, .38, concrete(ctx));
      }
      caption = "Slab on thickened edge beams";
    } else if (model === 4) {
      shape(ctx, [{ x: 0, y: 0, z: .3 }, { x: 3.0, y: 0, z: .3 }, { x: 3.0, y: 1.9, z: .3 }, { x: 0, y: 1.9, z: .3 }].map(project), FACE_LIT);
      box3d(ctx, project, .42, .48, -.34, 2.16, 1.0, .64, concrete(ctx));
      shape(ctx, [{ x: .42, y: .48, z: .3 }, { x: 2.58, y: .48, z: .3 }, { x: 2.34, y: .72, z: -.34 }, { x: .66, y: .72, z: -.34 }].map(project), FACE_MID);
      caption = "Excavation battered back to the dig line";
    } else if (model === 5) {
      box3d(ctx, project, .18, .25, .05, 2.65, 1.62, .1, PALE);
      member3d(ctx, project, { x: .18, y: .25, z: .16 }, { x: 2.83, y: 1.87, z: .16 }, 2, RED);
      caption = "Floor plate with the diagonal struck";
    } else if (model === 6) {
      // a strip footing: a trench of concrete, not a slab
      shape(ctx, [{ x: 0, y: 0, z: .2 }, { x: 3.0, y: 0, z: .2 }, { x: 3.0, y: 1.9, z: .2 }, { x: 0, y: 1.9, z: .2 }].map(project), FACE_LIT);
      box3d(ctx, project, .3, .7, -.3, 2.4, .55, .5, concrete(ctx));
      for (let x = .4; x < 2.7; x += .28) member3d(ctx, project, { x, y: .82, z: .16 }, { x, y: 1.13, z: .16 }, 2, BLACK);
      member3d(ctx, project, { x: .35, y: .85, z: .14 }, { x: 2.65, y: .85, z: .14 }, 3, BLACK);
      member3d(ctx, project, { x: .35, y: 1.1, z: .14 }, { x: 2.65, y: 1.1, z: .14 }, 3, BLACK);
      caption = "Trench footing, reinforced and poured";
    } else if (model === 7) {
      // a garden bed: soil heaped inside its edging
      shape(ctx, [{ x: 0, y: 0, z: .2 }, { x: 3.0, y: 0, z: .2 }, { x: 3.0, y: 1.9, z: .2 }, { x: 0, y: 1.9, z: .2 }].map(project), FACE_LIT);
      for (const [bx, by, bdx, bdy] of [[.3, .35, 2.4, .08], [.3, 1.47, 2.4, .08], [.3, .35, .08, 1.2], [2.62, .35, .08, 1.2]]) {
        box3d(ctx, project, bx, by, .2, bdx, bdy, .3, timber);
      }
      box3d(ctx, project, .38, .43, .2, 2.24, 1.04, .26, PALE);
      caption = "Bed filled to the top of the edging";
    } else if (model === 8) {
      // bags stacked beside the pour they mix into
      box3d(ctx, project, .9, .5, .05, 1.9, 1.3, .16, concrete(ctx));
      for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) {
        box3d(ctx, project, .06 + i * .22, .35, .02 + row * .19, .2, .55, .17, PALE);
      }
      caption = "Bags stacked beside the pour";
    } else if (model === 9) {
      // a room with skirting run round the walls
      box3d(ctx, project, .18, .25, .02, 2.65, 1.62, .06, PALE);
      for (const [bx, by, bdx, bdy] of [[.18, .25, 2.65, .07], [.18, 1.8, 2.65, .07], [.18, .25, .07, 1.62], [2.76, .25, .07, 1.62]]) {
        box3d(ctx, project, bx, by, .08, bdx, bdy, .22, timber);
      }
      box3d(ctx, project, 1.2, .25, .08, .7, .09, .24, WHITE);
      caption = "Skirting run round the room, stopped at the door";
    } else {
      box3d(ctx, project, .18, .25, .05, 2.65, 1.62, .18, concrete(ctx));
      for (let x = .35; x < 2.78; x += .3) member3d(ctx, project, { x, y: .34, z: .245 }, { x, y: 1.76, z: .245 }, 2, BLACK);
      if (model === 3) {
        for (let x = .35; x < 2.78; x += .3) member3d(ctx, project, { x, y: .95, z: .245 }, { x, y: .95, z: .85 }, 3, BLACK);
        caption = "Starter bars standing out of the pour";
      } else {
        for (let y = .36; y < 1.78; y += .27) member3d(ctx, project, { x: .28, y, z: .25 }, { x: 2.72, y, z: .25 }, 2, BLACK);
        if (model === 2) caption = "Mesh both ways over the slab";
      }
    }
    isoDimension(ctx, project, { x: .18, y: -.55, z: .02 }, { x: 2.83, y: -.55, z: .02 }, fmt(lengthValue), BLACK, 24);
    isoDimension(ctx, project, { x: 2.98, y: .25, z: .02 }, { x: 2.98, y: 1.87, z: .02 }, fmt(widthValue), BLACK, -24);
    isoDimension(ctx, project, { x: 2.94, y: 1.95, z: .05 }, { x: 2.94, y: 1.95, z: .23 }, fmt(values.thickness || heightValue), BLACK, 20);
    infoLines(ctx, [caption], width * .5, 26);
  } else if (kind === "arch3d") {
    const archModel = Math.round(values.model || 0);
    if (archModel === 1) {
      // a bare arc template: the curve on its chord, no piers
      const centre = { x: 1.5, y: .7, z: .5 }, radius = 1.15;
      const segments = Math.max(8, Math.min(40, Math.round(values.count || 24)));
      let prior: Point3 | null = null;
      for (let i = 0; i <= segments; i++) {
        const a2 = Math.PI - i * Math.PI / segments;
        const point = { x: centre.x + Math.cos(a2) * radius, y: centre.y, z: centre.z + Math.sin(a2) * radius };
        if (prior) member3d(ctx, project, prior, point, 9, FILL);
        prior = point;
      }
      member3d(ctx, project, { x: centre.x - radius, y: centre.y, z: centre.z }, { x: centre.x + radius, y: centre.y, z: centre.z }, 3, RED);
      isoDimension(ctx, project, { x: centre.x - radius, y: centre.y - .6, z: centre.z }, { x: centre.x + radius, y: centre.y - .6, z: centre.z }, fmt(values.span || 2400), BLACK, 24);
      infoLines(ctx, [`Arc struck on its chord - ${segments} plotted points`], width * .5, 26);
      return;
    }
    if (archModel === 2) {
      // pickets cut to an arc, each one its own length
      const count = Math.max(5, Math.min(40, Math.round(values.count || 21)));
      const radius = 1.6, base = .75;
      box3d(ctx, project, .15, .9, .12, 2.7, .08, .09, timber);
      for (let i = 0; i < count; i++) {
        const x = .2 + (i / Math.max(count - 1, 1)) * 2.6, dx = x - 1.5;
        const top = base + Math.sqrt(Math.max(0, radius * radius - dx * dx * 1.9)) - radius * .62;
        box3d(ctx, project, x, .86, .12, 2.4 / count * .7, .05, Math.max(.15, top), timber);
      }
      isoDimension(ctx, project, { x: .2, y: .2, z: .12 }, { x: 2.8, y: .2, z: .12 }, fmt(values.span || 3600), BLACK, 24);
      infoLines(ctx, [`${count} Pickets cut to the arc`], width * .5, 26);
      return;
    }
    box3d(ctx, project, .25, .58, .04, .38, .52, 1.2, FILL);
    box3d(ctx, project, 2.37, .58, .04, .38, .52, 1.2, FILL);
    if (archModel === 3) {
      // gothic: two arcs struck off opposite centres, meeting at a point
      const segments = Math.max(5, Math.min(16, Math.round(values.count || 9)));
      const spring = 1.24, half = 1.06, radius = half * 1.75;
      const apex = { x: 1.5, y: .58, z: spring + Math.sqrt(Math.max(0, radius * radius - half * half)) };
      for (const side of [-1, 1]) {
        const hub = { x: 1.5 - side * (radius - half), y: .58, z: spring };
        let prior: Point3 | null = null;
        for (let i = 0; i <= segments; i++) {
          const start = Math.atan2(0, side), end = Math.atan2(apex.z - hub.z, apex.x - hub.x);
          const a2 = start + (end - start) * (i / segments);
          const point = { x: hub.x + Math.cos(a2) * radius, y: .58, z: hub.z + Math.sin(a2) * radius };
          if (prior) member3d(ctx, project, prior, point, 13, FILL);
          prior = point;
        }
      }
      isoDimension(ctx, project, { x: .44, y: .1, z: .04 }, { x: 2.56, y: .1, z: .04 }, fmt(values.span || 1800), BLACK, 24);
      infoLines(ctx, [`Pointed arch - two centres, ${segments} units a side`], width * .5, 26);
      return;
    }
    const archCentre = { x: 1.5, y: .58, z: 1.14 }, archRadius = 1.06;
    const segments = Math.max(7, Math.min(18, Math.round(values.count || 11)));
    let prior: Point3 | null = null;
    for (let i = 0; i <= segments; i++) {
      const a = Math.PI - i * Math.PI / segments;
      const point = { x: archCentre.x + Math.cos(a) * archRadius, y: archCentre.y, z: archCentre.z + Math.sin(a) * archRadius };
      if (prior) member3d(ctx, project, prior, point, 14, FILL);
      prior = point;
    }
    isoDimension(ctx, project, { x: .44, y: -.2, z: 1.14 }, { x: 2.56, y: -.2, z: 1.14 }, fmt(values.span || widthValue), BLACK, 24);
    isoDimension(ctx, project, { x: 2.88, y: .58, z: .04 }, { x: 2.88, y: .58, z: 2.2 }, fmt(values.rise || heightValue), BLACK, -24);
    infoLines(ctx, [`${segments} Arch Units with radial joints`], width * .5, 26);
  } else if (kind === "masonry3d") {
    // a block wall, a brick wall, board and batten, weatherboard, tile, paint,
    // batts and wallpaper are different trades on the same rectangle, so the
    // model is chosen by the calculator rather than by the flat sheet it shares
    const wallModel = Math.round(values.model || 0);
    const wallY = .45, wallD = .42, wallH = 1.25, wallW = 2.7;
    let wallCaption = "";
    if (wallModel === 2) {
      box3d(ctx, project, .12, wallY, 0, wallW, wallD, wallH, FILL);
      const boards = Math.max(3, Math.min(16, Math.round(values.count || 8)));
      for (let i = 0; i < boards; i++) {
        const bx = .12 + i * wallW / boards;
        box3d(ctx, project, bx, wallY - .06, 0, wallW / boards - .01, .06, wallH, timber);
        box3d(ctx, project, bx - .03, wallY - .12, 0, .07, .06, wallH, timber);
      }
      wallCaption = `${boards} Boards - batten over every joint`;
    } else if (wallModel === 3) {
      const courses = Math.max(3, Math.min(18, Math.round(values.rows || values.courses || 10)));
      box3d(ctx, project, .12, wallY, 0, wallW, wallD, wallH, FILL);
      for (let i = 0; i < courses; i++) {
        box3d(ctx, project, .12, wallY - .07, i * wallH / courses, wallW, .07, wallH / courses * 1.35, timber);
      }
      wallCaption = `${courses} Courses lapped over each other`;
    } else if (wallModel === 4) {
      const rows = Math.max(2, Math.min(12, Math.round(values.rows || 6)));
      const cols = Math.max(2, Math.min(14, Math.round(values.columns || values.count || 8)));
      box3d(ctx, project, .12, wallY, 0, wallW, wallD, wallH, FILL);
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        box3d(ctx, project, .14 + col * wallW / cols, wallY - .05, .02 + row * wallH / rows,
          wallW / cols - .03, .05, wallH / rows - .03, FILL);
      }
      wallCaption = `${rows * cols} Tiles - ${cols} across, ${rows} up`;
    } else if (wallModel === 5) {
      box3d(ctx, project, .12, wallY, 0, wallW, wallD, wallH, FILL);
      const done = Math.min(Math.max((values.coats || 2) / 3, .35), .85);
      box3d(ctx, project, .12, wallY - .04, 0, wallW * done, .04, wallH, PALE);
      member3d(ctx, project, { x: .12 + wallW * done, y: wallY - .1, z: .3 }, { x: .12 + wallW * done, y: wallY - .1, z: .72 }, 14, FACE_DARK);
      member3d(ctx, project, { x: .12 + wallW * done, y: wallY - .1, z: .5 }, { x: .12 + wallW * done, y: wallY - .5, z: .5 }, 5, FILL);
      wallCaption = "Wall part-coated - roller at the wet edge";
    } else if (wallModel === 6) {
      const bays = Math.max(2, Math.min(10, Math.round(values.count || 6)));
      box3d(ctx, project, .12, wallY + .18, 0, wallW, .05, wallH, PALE);
      for (let i = 0; i <= bays; i++) box3d(ctx, project, .12 + i * wallW / bays, wallY, 0, .07, .22, wallH, timber);
      for (let i = 0; i < bays; i++) {
        box3d(ctx, project, .12 + i * wallW / bays + .07, wallY + .03, .04, wallW / bays - .08, .16, wallH - .08, WHITE);
      }
      wallCaption = `${bays} Batts friction-fitted between studs`;
    } else if (wallModel === 7) {
      const drops = Math.max(2, Math.min(14, Math.round(values.count || values.columns || 7)));
      box3d(ctx, project, .12, wallY, 0, wallW, wallD, wallH, FILL);
      for (let i = 0; i < drops; i++) {
        box3d(ctx, project, .12 + i * wallW / drops, wallY - .05, 0, wallW / drops - .012, .05, wallH,
          i % 2 === 0 ? PALE : timber);
      }
      wallCaption = `${drops} Drops hung to the pattern repeat`;
    } else {
      const brick = wallModel === 1;
      const rows = Math.max(2, Math.min(12, Math.round(values.rows || values.courses || (brick ? 9 : 5))));
      const cols = Math.max(3, Math.min(16, Math.round(values.columns || values.count || (brick ? 12 : 8))));
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const stagger = row % 2 ? .17 : 0;
        box3d(ctx, project, .12 + col * wallW / cols + stagger, wallY, row * wallH / rows, 2.55 / cols, wallD, 1.1 / rows, FILL);
      }
      wallCaption = `${rows} Courses - ${cols} Modules`;
    }
    isoDimension(ctx, project, { x: .12, y: -.35, z: 0 }, { x: 2.82, y: -.35, z: 0 }, fmt(lengthValue), BLACK, 24);
    isoDimension(ctx, project, { x: 2.95, y: wallY, z: 0 }, { x: 2.95, y: wallY, z: wallH }, fmt(heightValue), BLACK, -24);
    infoLines(ctx, [wallCaption], width * .5, 26);
  } else if (kind === "cone3d") {
    if (Math.round(values.model || 0) === 1) {
      // round base opening out to a square top, with the corner seams shown
      const rcx = 1.5, rcy = 1.05, rr = .9, rh = 1.6;
      const side = Math.max(.25, Math.min(.85, (values.square || 450) / Math.max(values.diameter || 600, 1) * rr));
      const ring = Array.from({ length: 24 }, (_, i) => {
        const a2 = i * Math.PI * 2 / 24;
        return { x: rcx + Math.cos(a2) * rr, y: rcy + Math.sin(a2) * rr, z: .05 };
      });
      const top = [{ x: rcx - side, y: rcy - side, z: rh }, { x: rcx + side, y: rcy - side, z: rh },
        { x: rcx + side, y: rcy + side, z: rh }, { x: rcx - side, y: rcy + side, z: rh }];
      for (let i = 0; i < 24; i++) {
        shape(ctx, [ring[i], ring[(i + 1) % 24], top[Math.floor(i / 24 * 4) % 4]].map(project), i % 2 === 0 ? FACE_LIT : FACE_MID);
      }
      shape(ctx, top.map(project), FACE_DARK);
      for (const corner of top) {
        const nearest = ring.reduce((best, r) => Math.hypot(r.x - corner.x, r.y - corner.y) < Math.hypot(best.x - corner.x, best.y - corner.y) ? r : best, ring[0]);
        member3d(ctx, project, nearest, corner, 4, RED);
      }
      isoDimension(ctx, project, { x: rcx - rr, y: rcy - 1.35, z: .05 }, { x: rcx + rr, y: rcy - 1.35, z: .05 }, `Ø ${fmt(values.diameter || 600)}`, BLACK, 24);
      infoLines(ctx, ["Round base opening to a square top"], width * .5, 26);
      return;
    }
    const cx = 1.5, cy = 1.02, bottomRadius = .9;
    const topRadius = Math.max(.12, Math.min(.7, (values.topDiameter || 300) / safe(values.bottomDiameter || values.diameter, 900) * bottomRadius));
    const coneHeight = 1.65, points = 28;
    const bottomRing = Array.from({ length: points }, (_, i) => ({ x: cx + Math.cos(i * Math.PI * 2 / points) * bottomRadius, y: cy + Math.sin(i * Math.PI * 2 / points) * bottomRadius, z: .08 }));
    const topRing = Array.from({ length: points }, (_, i) => ({ x: cx + Math.cos(i * Math.PI * 2 / points) * topRadius, y: cy + Math.sin(i * Math.PI * 2 / points) * topRadius, z: coneHeight }));
    for (let i = 0; i < points; i++) {
      const next = (i + 1) % points;
      shape(ctx, [project(bottomRing[i]), project(bottomRing[next]), project(topRing[next]), project(topRing[i])], i % 2 ? FACE_MID : FACE_LIT, SILVER, HAIR);
    }
    shape(ctx, topRing.map(project), FACE_LIT);
    isoDimension(ctx, project, { x: cx + 1.1, y: cy, z: .08 }, { x: cx + 1.1, y: cy, z: coneHeight }, fmt(values.height || heightValue), BLACK, -24);
    const bd0 = project({ x: cx - bottomRadius, y: cy, z: .08 }), bd1 = project({ x: cx + bottomRadius, y: cy, z: .08 });
    dimension(ctx, bd0.x, bd0.y, bd1.x, bd1.y, `Ø ${fmt(values.bottomDiameter || values.diameter || widthValue)}`, BLACK, 26);
    infoLines(ctx, ["True frustum with developed seam shown"], width * .5, 26);
  } else if (kind === "circle3d") {
    const cx = width * .5, cy = height * .5;
    const rx = Math.min(width * .34, height * .62), ry = rx * .46, thickness = Math.max(10, rx * .06);
    ctx.beginPath();
    ctx.ellipse(cx, cy + thickness, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = FACE_DARK;
    ctx.fill();
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = FACE_LIT;
    ctx.fill();
    ctx.stroke();
    const divisions = Math.max(3, Math.min(36, Math.round(values.count || values.segments || 12)));
    const discModel = Math.round(values.model || 0);
    // 4-8 are solids in their own right rather than marks on a disc
    if (discModel >= 4) {
      const step = Math.PI * 2 / Math.max(divisions, 3);
      if (discModel <= 6) {
        const band = discModel === 5 ? .34 : discModel === 6 ? .16 : .24;
        const lift = discModel === 4 ? .34 : discModel === 6 ? .1 : .05;
        const courses = discModel === 4 ? 4 : 1;
        for (let c = 0; c < courses; c++) for (let i = 0; i < divisions; i++) {
          const a2 = i * step + (c % 2 === 1 ? step / 2 : 0), a3 = a2 + step * .9;
          const z = -c * lift * rx * .16;
          const at = (ang: number, f: number) => ({ x: cx + Math.cos(ang) * rx * f, y: cy + Math.sin(ang) * ry * f + z });
          shape(ctx, [at(a2, 1), at(a3, 1), at(a3, 1 - band), at(a2, 1 - band)], i % 2 === 0 ? FACE_LIT : FACE_MID);
          if (discModel !== 5) {
            const o1 = at(a2, 1), o2 = at(a3, 1);
            shape(ctx, [o1, o2, { x: o2.x, y: o2.y + lift * rx * .16 }, { x: o1.x, y: o1.y + lift * rx * .16 }], FACE_DARK);
          }
        }
        centerMark(ctx, cx, cy);
        dimension(ctx, cx - rx, cy, cx + rx, cy, `Ø ${fmt(values.diameter || values.span || 1200)}`, BLACK, -26);
        const ringNames: Record<number, string> = {
          4: `${divisions} Blocks in the course`, 5: `${divisions} Pavers to the ring`, 6: `${divisions} Molding segments`,
        };
        infoLines(ctx, [ringNames[discModel]], width * .5, 26);
      } else if (discModel === 7) {
        // a pipe with the tape wrapped round it
        for (const [oy, fill] of [[thickness * 3, FACE_DARK], [0, FACE_LIT]] as [number, string][]) {
          ctx.beginPath(); ctx.ellipse(cx, cy + oy, rx, ry, 0, 0, Math.PI * 2);
          ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = BLACK; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.beginPath(); ctx.ellipse(cx, cy, rx * .72, ry * .72, 0, 0, Math.PI * 2);
        ctx.fillStyle = WHITE; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx, cy + thickness, rx + 3, ry + 3, 0, 0, Math.PI * 2);
        ctx.strokeStyle = RED; ctx.lineWidth = 5; ctx.stroke();
        centerMark(ctx, cx, cy);
        dimension(ctx, cx - rx, cy, cx + rx, cy, `Ø ${fmt(values.value || values.diameter || 400)}`, BLACK, -26);
        infoLines(ctx, ["Tape wrapped round the pipe"], width * .5, 26);
      } else {
        // an ellipse laid flat, with both axes struck
        for (const [oy, fill] of [[thickness, FACE_DARK], [0, FACE_LIT]] as [number, string][]) {
          ctx.beginPath(); ctx.ellipse(cx, cy + oy, rx, ry * .62, 0, 0, Math.PI * 2);
          ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = BLACK; ctx.lineWidth = 1; ctx.stroke();
        }
        hairline(ctx, cx - rx, cy, cx + rx, cy);
        hairline(ctx, cx, cy - ry * .62, cx, cy + ry * .62);
        centerMark(ctx, cx, cy);
        dimension(ctx, cx - rx, cy, cx + rx, cy, `Major ${fmt(values.major || values.length || values.width || 1200)}`, BLACK, -30);
        infoLines(ctx, ["True ellipse - both axes struck"], width * .5, 26);
      }
      return;
    }
    for (let i = 0; i < divisions; i++) {
      const a2 = i * Math.PI * 2 / divisions;
      const x = cx + Math.cos(a2) * rx * .78, y = cy + Math.sin(a2) * ry * .78;
      if (discModel === 1) {
        // divided circle: spokes struck to each mark, no holes
        hairline(ctx, cx, cy, x, y);
        centerMark(ctx, x, y, undefined, RED);
      } else if (discModel === 2) {
        // plain template disc: the rim marks only
        strokeLine(ctx, cx + Math.cos(a2) * rx * .88, cy + Math.sin(a2) * ry * .88, x, y, BLACK, 1);
      } else if (discModel === 3) {
        // bolt circle: real holes bored on the pitch circle
        ctx.beginPath();
        ctx.ellipse(x, y, 6, 3.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = WHITE;
        ctx.fill();
        ctx.strokeStyle = BLACK;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        hairline(ctx, cx, cy, x, y);
        ctx.beginPath();
        ctx.ellipse(x, y, 3.5, 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = BLACK;
        ctx.fill();
      }
    }
    centerMark(ctx, cx, cy);
    dimension(ctx, cx - rx, cy, cx + rx, cy, `Ø ${fmt(values.diameter || values.span || 1200)}`, BLACK, -26);
    infoLines(ctx, [`${divisions} Divisions @ ${(360 / divisions).toFixed(3)}°`], width * .5, 26);
  } else if (kind === "spacing3d" || kind === "deck3d") {
    box3d(ctx, project, 0, .2, .03, 2.9, 1.7, .08, concrete(ctx));
    const count = Math.max(2, Math.min(16, Math.round(values.count || 8)));
    const gaps = Math.max(count - 1, 1);
    const model = Math.round(values.model || 0);
    let caption = `${count} Members - live set-out`;
    const boards = () => {
      for (let i = 0; i < count; i++) box3d(ctx, project, .12 + i * 2.65 / gaps, .32, .12, .055, 1.45, .12, timber);
      for (let y = .35; y < 1.75; y += .17) box3d(ctx, project, .08, y, .27, 2.76, .09, .065, timber);
    };
    if (kind === "deck3d") {
      if (model === 1) { boards(); caption = `${count} Joists under the board run`; }
      else if (model === 2) {
        for (let i = 0; i < count; i++) box3d(ctx, project, .12 + i * 2.65 / gaps, .32, .12, .055, 1.45, .12, timber);
        for (let y = .35; y < 1.75; y += .17) {
          box3d(ctx, project, .08, y, .27, 2.76, .09, .065, timber);
          for (let i = 0; i < count; i++) {
            const x = .12 + i * 2.65 / gaps;
            box3d(ctx, project, x - .01, y + .02, .335, .05, .05, .02, FILL);
            box3d(ctx, project, x - .01, y + .05, .335, .05, .05, .02, FILL);
          }
        }
        caption = `${count * 2} Fixings per board run`;
      } else if (model === 3) {
        // sheets fixed to a framed wall, not laid on a deck
        const studs = Math.max(1, Math.min(count, 8));
        for (let i = 0; i <= studs; i++) box3d(ctx, project, .12 + i * 2.6 / studs, 1.0, .11, .07, .1, 1.1, timber);
        const sheets = Math.max(1, Math.min(count, 4));
        for (let i = 0; i < sheets; i++) box3d(ctx, project, .12 + i * 2.66 / sheets, .88, .11, 2.66 / sheets - .02, .06, 1.1, FILL);
        caption = `${count} Sheets fixed to the framing`;
      } else if (model === 4) {
        // posts standing in their concreted holes
        const posts = Math.max(2, Math.min(count, 6));
        for (let i = 0; i < posts; i++) {
          const x = .25 + i * 2.4 / Math.max(posts - 1, 1);
          box3d(ctx, project, x - .11, .85, -.42, .34, .34, .5, concrete(ctx));
          box3d(ctx, project, x, .96, -.3, .12, .12, 1.25, timber);
        }
        caption = `${posts} Posts concreted into their holes`;
      } else if (model === 5) {
        // tiles bedded across the floor
        const cols = Math.max(2, Math.min(count, 9));
        for (let row = 0; row < 5; row++) for (let col = 0; col < cols; col++) {
          box3d(ctx, project, .12 + col * 2.66 / cols, .3 + row * .29, .11, 2.66 / cols - .03, .26, .04, FILL);
        }
        caption = `${cols * 5} Tiles bedded across the floor`;
      } else boards();
    } else if (model === 1) {
      box3d(ctx, project, .1, .7, .11, 2.7, .1, .07, timber);
      for (let i = 0; i < count; i++) box3d(ctx, project, .15 + i * 2.6 / gaps, .72, .18, .06, .06, .62, timber);
      box3d(ctx, project, .08, .66, .8, 2.74, .18, .09, timber);
      caption = `${count} Balusters between the rails`;
    } else if (model === 2) {
      box3d(ctx, project, .1, .35, .11, 2.7, .1, .06, timber);
      for (let i = 0; i < count; i++) {
        const x = .15 + i * 2.6 / gaps;
        const inOpening = x > 1.05 && x < 1.95;
        box3d(ctx, project, x, .35, .17, .065, .1, inOpening ? .24 : .82, timber);
      }
      box3d(ctx, project, 1.0, .33, .99, 1.0, .14, .12, timber);
      box3d(ctx, project, .1, .35, .99, 2.7, .1, .06, timber);
      caption = `Opening trimmed - ${count} studs each side`;
    } else if (model === 3) {
      const posts = Math.max(1, Math.min(count, 7));
      for (let i = 0; i < posts; i++) box3d(ctx, project, .15 + i * 2.6 / Math.max(posts - 1, 1), .8, 0, .12, .12, 1.05, timber);
      for (const z of [.28, .78]) box3d(ctx, project, .12, .83, z, 2.7, .06, .08, timber);
      const palings = Math.max(1, Math.min(count * 2, 26));
      for (let i = 0; i < palings; i++) box3d(ctx, project, .12 + i * 2.68 / palings, .9, .06, 2.5 / palings, .03, .95, timber);
      caption = `${posts} Posts - rails and palings`;
    } else if (model === 4) {
      for (let i = 0; i < count; i++) {
        const x = .15 + i * 2.6 / gaps;
        box3d(ctx, project, x, .8, .12, 2.3 / gaps, .035, .78, PALE);
        box3d(ctx, project, x + .02, .78, .08, .09, .09, .14, FILL);
      }
      caption = `${count} Glass panels on spigots`;
    } else if (model === 5) {
      box3d(ctx, project, .1, .6, .11, 2.7, .5, .1, timber);
      for (let i = 0; i < count; i++) box3d(ctx, project, .18 + i * 2.5 / gaps, .82, .21, .06, .06, .03, FILL);
      caption = `${count} Fixings along the run`;
    } else if (model === 6) {
      box3d(ctx, project, .35, .6, .05, .08, .9, 1.5, timber);
      box3d(ctx, project, 2.45, .6, .05, .08, .9, 1.5, timber);
      for (let i = 0; i < count; i++) box3d(ctx, project, .43, .6, .12 + i * 1.35 / gaps, 2.02, .9, .05, timber);
      caption = `${count} Shelves in the bay`;
    } else if (model === 8) {
      // a framed wall: plates top and bottom, studs between, noggins staggered
      box3d(ctx, project, .1, .55, .11, 2.7, .12, .06, timber);
      box3d(ctx, project, .1, .55, .17, 2.7, .12, .06, timber);
      for (let i = 0; i < count; i++) {
        const x = .15 + i * 2.6 / gaps;
        box3d(ctx, project, x, .55, .23, .06, .12, .78, timber);
        if (i < count - 1) box3d(ctx, project, x + .06, .56, i % 2 === 0 ? .52 : .62, 2.6 / gaps - .06, .1, .06, timber);
      }
      box3d(ctx, project, .1, .55, 1.01, 2.7, .12, .06, timber);
      caption = `${count} Studs between plates, noggins staggered`;
    } else if (model === 7) {
      box3d(ctx, project, .1, .7, .11, 2.7, .1, .16, timber);
      for (let i = 0; i < count; i++) {
        const x = .15 + i * 2.6 / gaps;
        box3d(ctx, project, x, .72, .24, .07, .07, .62, timber);
        if (i < count - 1) box3d(ctx, project, x + .05, .74, .3, 2.6 / gaps - .09, .03, .48, PALE);
      }
      box3d(ctx, project, .08, .66, .84, 2.74, .2, .1, timber);
      caption = `${count} Stiles - panels between, cap over`;
    } else {
      for (let i = 0; i < count; i++) box3d(ctx, project, .15 + i * 2.6 / gaps, .35, .11, .065, 1.35, .85, timber);
    }
    isoDimension(ctx, project, { x: 0, y: -.5, z: 0 }, { x: 2.9, y: -.5, z: 0 }, fmt(values.span || values.length || 6000), BLACK, 24);
    isoDimension(ctx, project, { x: 2.95, y: .2, z: 0 }, { x: 2.95, y: 1.9, z: 0 }, fmt(widthValue), BLACK, -24);
    infoLines(ctx, [caption], width * .5, 26);
  } else if (kind === "pyramid3d") {
    const base = [{ x: .5, y: .42, z: .05 }, { x: 2.5, y: .42, z: .05 }, { x: 2.5, y: 1.72, z: .05 }, { x: .5, y: 1.72, z: .05 }];
    const apex = { x: 1.5, y: 1.07, z: 1.75 };
    shape(ctx, [project(base[0]), project(base[1]), project(apex)], FACE_LIT);
    shape(ctx, [project(base[1]), project(base[2]), project(apex)], FACE_DARK);
    shape(ctx, [project(base[2]), project(base[3]), project(apex)], FACE_MID);
    shape(ctx, [project(base[3]), project(base[0]), project(apex)], FACE_LIT);
    isoDimension(ctx, project, { x: .5, y: -.35, z: .05 }, { x: 2.5, y: -.35, z: .05 }, fmt(values.width || lengthValue), BLACK, 24);
    isoDimension(ctx, project, { x: 2.7, y: 1.72, z: .05 }, { x: 2.7, y: 1.72, z: 1.75 }, fmt(values.height || heightValue), BLACK, -23);
    infoLines(ctx, ["Apex, face slant and true edge"], width * .5, 26);
  } else {
    const solidModel = Math.round(values.model || 0);
    if (solidModel === 1) {
      // a kerfed board, sprung round its curve
      for (let i = 0; i < 14; i++) {
        const a2 = Math.PI * .55 * i / 14 - Math.PI * .1;
        box3d(ctx, project, 1.4 + Math.cos(a2) * 1.15, .35 + Math.sin(a2) * 1.15, .05, .2, .2, .75, timber);
      }
    } else if (solidModel === 2) {
      for (let i = 0; i < 4; i++) box3d(ctx, project, .3, .4, .05 + i * .2, 2.3, 1.2, .17, timber);
    } else if (solidModel === 4) {
      // two boards meeting at a compound miter, each tilted to its slope
      const slope = radians(Math.min(Math.max(values.slope || 35, 5), 75));
      const plan = radians(Math.min(Math.max(values.planAngle || 90, 20), 160)) / 2;
      const apex = { x: 1.5, y: 1.1, z: .15 };
      for (const side of [-1, 1]) {
        const far = { x: apex.x + Math.cos(plan) * 1.25 * side, y: apex.y - Math.sin(plan) * 1.05, z: apex.z + Math.tan(slope) * .9 };
        member3d(ctx, project, apex, far, 26, timber);
        member3d(ctx, project, { ...apex, z: apex.z + .22 }, { ...far, z: far.z + .22 }, 26, timber);
      }
      member3d(ctx, project, { ...apex, z: apex.z - .05 }, { ...apex, z: apex.z + .34 }, 3, RED);
    } else {
      box3d(ctx, project, .25, .35, .05, 2.35, 1.3, .85, FILL);
    }
    isoDimension(ctx, project, { x: .25, y: -.45, z: .05 }, { x: 2.6, y: -.45, z: .05 }, fmt(lengthValue), BLACK, 24);
    isoDimension(ctx, project, { x: 2.72, y: .35, z: .05 }, { x: 2.72, y: 1.65, z: .05 }, fmt(widthValue), BLACK, -24);
    isoDimension(ctx, project, { x: 2.72, y: 1.65, z: .05 }, { x: 2.72, y: 1.65, z: .9 }, fmt(heightValue), BLACK, -24);
  }
}

export function drawDiagram(ctx: CanvasRenderingContext2D, width: number, height: number, kind: DiagramKind, values: Record<string, number>, unit: string, title: string) {
  if(values.nativeRing||values.nativePipe||values.nativeRoofDrain)return drawNativeExtra(ctx,width,height,kind,values,unit);
  if (values.layoutKind) { drawLayout(ctx, width, height, kind, values, unit); return; }
  if (kind.endsWith("3d")) { drawIsoDiagram(ctx, width, height, kind, values, unit); return; }
  prepareSheet(ctx, Math.max(width, 0), Math.max(height, 0));
  // A canvas can be measured at zero size before layout settles; drawing into it
  // would produce negative radii and throw, so bail out until it has real bounds.
  if (!(width > 40) || !(height > 40)) return;

  // Margins shrink with the sheet so the usable area is always positive.
  const marginX = Math.min(62, width * .12);
  const left = marginX, right = width - marginX;
  const top = Math.min(54, height * .12), bottom = height - Math.min(62, height * .14);
  const w = right - left, h = bottom - top;
  const L = (key: string, fallback: number) => safe(values[key], fallback);
  const n = (value: number, digits = 2) => new Intl.NumberFormat("en-NZ", { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);
  const fmt = (value: number) => `${n(value)}`;
  const timber = wood(ctx);
  void title;

  // the per-calculator sheets live in their own module
  if (drawTradeSheet({ ctx, width, height, left, right, top, bottom, w, h, unit, values }, kind)) return;

  if (kind === "roof") {
    // gambrel and saltbox are not gables, so they draw their own profile
    const profile = ROOF_PROFILES[Math.round(values.roofType || 0)];
    if (profile) { profile({ ctx, width, height, left, right, top, bottom, w, h, unit, values }); return; }
  }
  if (kind === "roof") {
    const run = L("run", L("width", 6000) / 2);
    const rise = L("rise", run * Math.tan(radians(values.angle || 30)));
    const oneSide = values.oneSide === 1;
    const scale = Math.min(w * (oneSide ? .74 : .44) / run, h * .6 / rise);
    const roofWidth = run * scale * (oneSide ? 1 : 2);
    const x = left + (w - roofWidth) / 2;
    const y = bottom - 46;
    const ridgeX = x + run * scale;
    const ridgeY = y - rise * scale;
    const pitchAngle = values.angle || Math.atan2(rise, run) * 180 / Math.PI;

    // wall line and wall plates
    hairline(ctx, left - 10, y, right + 10, y);
    plate(ctx, x - 10, y, 20, 16);
    if (!oneSide) plate(ctx, ridgeX + run * scale - 10, y, 20, 16);

    // rafters
    member(ctx, x, y, ridgeX, ridgeY, 13, timber);
    if (!oneSide) member(ctx, ridgeX, ridgeY, ridgeX + run * scale, y, 13, timber);
    plate(ctx, ridgeX - 5, ridgeY - 6, 10, 26, FILL);

    hairline(ctx, ridgeX, ridgeY - 30, ridgeX, y + 26);
    dimension(ctx, x, y, ridgeX, y, fmt(run), BLACK, 46);
    // rise is staged clear of the right-hand roof plane, not through it —
    // and held onto the sheet when a narrow canvas leaves no stage room
    dimension(ctx, ridgeX, y, ridgeX, ridgeY, fmt(rise), BLACK, Math.min(oneSide ? 48 : run * scale + 48, width - 16 - ridgeX));
    dimension(ctx, x, y, ridgeX, ridgeY, fmt(Math.hypot(run, rise)), BLACK, -22);
    angleLabel(ctx, `${n(pitchAngle)}°`, x - 14, y - 16, "right");
    const roofType = Math.round(values.roofType || 0);
    note(ctx, roofType === 1 ? "Ridge (shortened)" : "Ridge", ridgeX, ridgeY - 38, GREY, "center", 11);
    if (roofType === 1) {
      // the hip end, raking back behind the section at the same pitch
      const endRun = L("width", 6000) / 2 * scale;
      for (const side of [-1, 1]) strokeLine(ctx, ridgeX + side * endRun, y, ridgeX, ridgeY, RED, 1, true);
      note(ctx, "Hip end behind", ridgeX, ridgeY + (y - ridgeY) * .42, RED, "center", 11);
    }
    const overhangMM = safe(values.overhang, 0);
    const rafterMM = Math.hypot(run, rise);
    infoLines(ctx, [
      `Roof Pitch ${n(pitchAngle)}° ~ ${n(Math.tan(radians(pitchAngle)) * 12)}:12`,
      `Rafter Length ${fmt(rafterMM)} ${unit}`,
      ...(overhangMM > 0 ? [
        `Overhang ${n(overhangMM)} - Stock ${n(rafterMM + overhangMM / Math.cos(radians(pitchAngle)))}`,
      ] : []),
      ...(values.count ? [[`${Math.round(values.count)} Rafter positions`, RED] as [string, string]] : []),
    ], width / 2, top + 4);
  } else if (kind === "stairs") {
    // clamped so a huge or non-finite riser count cannot lock up the draw loop
    const risers = Math.max(2, Math.min(60, Math.round(safe(values.risers || values.count, 12))));
    const treads = Math.max(1, risers - 1);
    const totalRunValue = L("totalRun", L("run", 3000) * treads);
    const totalRiseValue = L("totalRise", L("rise", 175) * risers);
    const stepW = w * .80 / treads;
    const stepH = h * .74 / risers;
    const x = left + 54;   // clear of the angle callout at the base
    const y = bottom - 22;
    const topX = x + treads * stepW;
    const topY = y - risers * stepH;

    // stringer band under the nosing line
    const drop = Math.max(26, stepH * .95);
    const dx = topX - x, dy = topY - y, len = Math.hypot(dx, dy) || 1;
    const ox = -dy / len * drop, oy = dx / len * drop;
    shape(ctx, [
      { x, y },
      { x: topX, y: topY },
      { x: topX - ox, y: topY - oy },
      { x: x - ox, y: y - oy },
    ], timber, BLACK, 1);

    // treads with riser faces, so the profile reads as a staircase
    for (let i = 0; i < treads; i++) {
      const tx = x + i * stepW;
      const ty = y - (i + 1) * stepH;
      plate(ctx, tx, ty, 4, stepH);        // riser
      plate(ctx, tx, ty - 7, stepW, 7);    // tread
    }
    hairline(ctx, x, y, topX, topY);

    // upper-floor landing at the top nosing level, when the calculator gives a
    // floor thickness — the built context blocklayer's sheet shows
    const floorThk = safe(values.floorThickness, 0);
    if (floorThk > 0 && width - topX > 46) {
      const thkPx = Math.min(Math.max(floorThk * (risers * stepH) / totalRiseValue, 7), 46);
      shape(ctx, [
        { x: topX, y: topY },
        { x: width - 8, y: topY },
        { x: width - 8, y: topY + thkPx },
        { x: topX, y: topY + thkPx },
      ], timber, BLACK, 1);
      note(ctx, `\u2195 ${n(floorThk)}`, width - 14, topY + thkPx + 14, BLACK, "right", 11);
    }
    // the full blocklayer dimension set: nested rises on the right, floor
    // opening and headroom off the landing, slope along the stringer, and the
    // void volume printed with the width
    const riseStep = totalRiseValue / risers;
    const runStep = totalRunValue / treads;
    const floorMM = safe(values.floorThickness, 0);
    const thkPx = floorMM > 0 ? Math.min(Math.max(floorMM * (risers * stepH) / totalRiseValue, 7), 46) : 0;
    dimension(ctx, x - ox / 2, y - oy / 2, topX - ox / 2, topY - oy / 2,
      fmt(Math.hypot(totalRunValue, totalRiseValue)), BLACK, -drop / 2 - 14);
    dimension(ctx, x, y, topX, y, fmt(totalRunValue), BLACK, 40);
    dimension(ctx, x, y, topX + Math.min(stepW, width - 12 - topX), y,
      `Overall ${n(totalRunValue + runStep)}`, BLACK, 68);
    const avail = width - 18 - topX;
    dimension(ctx, topX, y, topX, topY, fmt(totalRiseValue), BLACK, Math.min(34, avail * 0.4));
    if (avail > 56) {
      dimension(ctx, topX, y, topX, topY + stepH, `${n(totalRiseValue - riseStep)} to nosing`, GREY, Math.min(64, avail * 0.75));
      if (floorMM > 0) dimension(ctx, topX, y, topX, topY + thkPx, n(totalRiseValue - floorMM), GREY, Math.min(92, avail));
    }
    const openingMM = safe(values.openingRun, 0);
    if (floorMM > 0 && openingMM > 0 && openingMM < totalRunValue) {
      const k = (treads * stepW) / totalRunValue;
      const xEdge = topX - openingMM * k;
      // above the landing on a wide sheet, below it on a narrow one where the
      // info block owns the top-left corner
      const openY = width < 520 ? topY + thkPx + 18 : topY - thkPx - 6;
      dimension(ctx, xEdge, openY, topX, openY, `Floor Opening ${n(openingMM)}`, BLACK, width < 520 ? 0 : -16);
      const lineY = y + (xEdge - x) * (topY - y) / Math.max(topX - x, 1e-6);
      const headroomMM = totalRiseValue - floorMM
        - Math.tan(Math.atan2(totalRiseValue, totalRunValue)) * (totalRunValue - openingMM);
      if (headroomMM > riseStep && lineY > topY + thkPx + 30) {
        dimension(ctx, xEdge, topY + thkPx, xEdge, lineY, `Headroom ${n(headroomMM)}`, BLACK, 0);
      }
    }
    angleLabel(ctx, `${n(Math.atan2(totalRiseValue, totalRunValue) * 180 / Math.PI)}°`, left, y - 18, "left");
    const widthMM = L("width", 1000);
    const metricSheet = unit === "mm";
    infoLines(ctx, [
      `${risers} Rises @ ${n(riseStep)} - ${treads} Runs @ ${n(runStep)}`,
      `Stair Width ${fmt(widthMM)} ${unit}`,
      `Void Volume ${n(totalRiseValue * totalRunValue * widthMM / 2 / (metricSheet ? 1e9 : 1728), 2)} ${metricSheet ? "m³" : "ft³"}`,
    ], left, top + 4, "left");
  } else if (kind === "stairdetail") {
    const runValue = L("run", L("totalRun", 3750) / Math.max(1, Math.round(safe(values.risers || values.count, 15)) - 1));
    const riseValue = L("rise", L("totalRise", 2800) / Math.max(2, Math.round(safe(values.risers || values.count, 16))));
    const cx = left + w / 2, cy = top + h / 2;
    const R = Math.min(w, h) * .5;
    // one going drawn large at the true rise:run ratio, fitted to the bubble
    const fit = Math.min(1, 1.25 * runValue / Math.max(riseValue, runValue));
    const sRun = R * .88 * fit;
    const sRise = sRun * riseValue / Math.max(runValue, 1e-6);
    const treadThk = Math.max(10, R * .085);
    const riserThk = Math.max(7, R * .05);
    const reveal = riserThk * .7;   // visual nosing overhang only, not dimensioned
    const nose1 = { x: cx - sRun * .58, y: cy + sRise * .3 };
    const nose2 = { x: nose1.x + sRun, y: nose1.y - sRise };

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    // riser-first joinery: each tread butts the riser behind it, and each riser
    // runs down behind the tread below to that tread's underside
    const tread = (fromX: number, toX: number, topY: number) => shape(ctx, [
      { x: fromX, y: topY }, { x: toX, y: topY },
      { x: toX, y: topY + treadThk }, { x: fromX, y: topY + treadThk },
    ], timber, BLACK, 1);
    const riser = (faceX: number, fromY: number, toY: number) => shape(ctx, [
      { x: faceX, y: fromY }, { x: faceX + riserThk, y: fromY },
      { x: faceX + riserThk, y: toY }, { x: faceX, y: toY },
    ], timber, BLACK, 1);

    tread(cx - R - 10, nose1.x + reveal, nose1.y + sRise);          // tread below, entering
    riser(nose1.x + reveal, nose1.y + treadThk, nose1.y + sRise + treadThk);
    tread(nose1.x, nose2.x + reveal, nose1.y);                       // the dimensioned going
    riser(nose2.x + reveal, nose2.y + treadThk, nose1.y + treadThk);
    tread(nose2.x, cx + R + 10, nose2.y);                            // tread above, exiting

    // going, nosing to nosing, and the rise between tread tops
    hairline(ctx, nose1.x, nose2.y - R * .34, nose1.x, nose1.y);
    hairline(ctx, nose2.x, nose2.y - R * .34, nose2.x, nose2.y);
    dimension(ctx, nose1.x, nose2.y - R * .28, nose2.x, nose2.y - R * .28, `Run ${n(runValue)}`, BLACK, 0);
    const riseX = nose1.x - R * .26;
    hairline(ctx, riseX - 12, nose1.y, nose1.x, nose1.y);
    hairline(ctx, riseX - 12, nose2.y, nose2.x, nose2.y);
    dimension(ctx, riseX, nose1.y, riseX, nose2.y, `Rise ${n(riseValue)}`, BLACK, 0);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = SILVER;
    ctx.lineWidth = 1;
    ctx.stroke();
    infoLines(ctx, [
      "Tread and riser detail",
      `Stair angle ${n(Math.atan2(riseValue, runValue) * 180 / Math.PI)}\u00b0`,
    ], cx + R * .12, cy + R * .62, "center", 12, 19, true);
  } else if (kind === "spacing" || kind === "deck") {
    const count = Math.max(2, Math.min(28, Math.round(values.count || 8)));
    const span = L("span", L("length", 6000));
    const memberW = Math.max(4, w / count * .18);
    const planTop = top + 46;
    const planH = Math.max(24, h - 96);
    plate(ctx, left, planTop, w, planH, PALE, SILVER);

    // Follow the calculator's own set-out when it supplies one (centres inset by
    // an end margin), so the printed figures agree with the results table.
    const centres = safe(values.spacing || values.center, 0);
    const endGap = Number.isFinite(values.gap) && values.gap > 0 ? values.gap : 0;
    const stock = safe(values.memberWidth, 0);
    const first = centres > 0 ? endGap + stock / 2 : 0;
    const step = centres > 0 ? centres : span / Math.max(count - 1, 1);
    const at = (i: number) => first + i * step;

    // deck boards first, so they cannot strike through the set-out figures
    if (kind === "deck") for (let yy = planTop + 34; yy < planTop + planH - 12; yy += 30) hairline(ctx, left, yy, right, yy, "#c8b48c");

    for (let i = 0; i < count; i++) {
      const x = left + at(i) / Math.max(span, 1e-6) * w;
      const cx = Math.min(right - memberW / 2, Math.max(left + memberW / 2, x));
      plate(ctx, cx - memberW / 2, planTop, memberW, planH, timber);
      // running set-out figures, blue and rotated, staggered to both edges the
      // way blocklayer's framing plans run them
      setOutMark(ctx, n(at(i)), cx - 3, i % 2 ? planTop + 62 : planTop + planH - 14);
    }

    dimension(ctx, left, planTop + planH, right, planTop + planH, fmt(span), BLACK, 40);
    // Blocklayer prints the whole schedule on the plan, adjusted value in red.
    const memberLen = safe(values.width, 0);
    infoLines(ctx, [
      `${count} Members across ${fmt(span)} ${unit}`,
      [`Adjusted Spacing ${n(step)}`, RED],
      ...(kind === "deck" && values.length && memberLen ? [
        `Deck ${n(values.length)} x ${n(memberLen)} - Area ${n(values.length * memberLen / (unit === "mm" ? 1e6 : 144), 2)} ${unit === "mm" ? "m²" : "ft²"}`,
        ...(values.rows ? [`${Math.round(values.rows)} Bearers under joists @ ${n(memberLen)}`] : []),
      ] : []),
    ], width / 2, top + 4);
  } else if (kind === "circle" || kind === "cone") {
    if (kind === "cone") {
      const cx = left + w * .46, cy = top + h * .5;
      const outer = Math.min(w * .38, h * .46);
      // True radial development. The given slant is the frustum's, so project it
      // back to the apex before taking the sector angle, or a frustum reads as a
      // full cone and both the drawn arc and the printed angle come out wrong.
      const rBottom = L("bottomDiameter", 900) / 2;
      const rTop = Math.max(0, (values.topDiameter || 0) / 2);
      const apexSlant = L("slant", 1200) * rBottom / Math.max(rBottom - rTop, 1e-6);
      const inner = outer * Math.min(.92, rTop / Math.max(rBottom, 1e-6));
      const sweep = Math.min(Math.PI * 1.92, 2 * Math.PI * rBottom / Math.max(apexSlant, 1e-6));
      ctx.beginPath();
      ctx.arc(cx, cy, outer, -Math.PI / 2, -Math.PI / 2 + sweep);
      ctx.arc(cx, cy, inner, -Math.PI / 2 + sweep, -Math.PI / 2, true);
      ctx.closePath();
      ctx.fillStyle = FILL;
      ctx.fill();
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = 1;
      ctx.stroke();
      hairline(ctx, cx, cy, cx, cy - outer);
      for (let i = 1; i < 8; i++) {
        const a = -Math.PI / 2 + sweep * i / 8;
        hairline(ctx, cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      }
      angleArc(ctx, cx, cy, Math.max(inner * .55, 34), -Math.PI / 2, -Math.PI / 2 + sweep, `${n(sweep * 180 / Math.PI)}°`);
      infoLines(ctx, [
        `Slant ${fmt(L("slant", 1200))} - Developed Radius ${fmt(apexSlant)} ${unit}`,
        `Included Angle ${n(sweep * 180 / Math.PI)}°`,
      ], left, top + 4, "left");
    } else {
      const count = Math.max(3, Math.min(72, Math.round(values.count || values.segments || values.holes || 12)));
      const r = Math.min(w, h) * .44;
      const cx = left + w / 2;
      const cy = top + h / 2;
      const diameter = values.diameter || values.span || 1200;
      if (values.polygon === 1) {
        // The side dimension floats above the top edge and the info block sits
        // in the bottom band, so the polygon is sized against the height that
        // remains — at any sheet ratio the three can no longer meet.
        const bandBottom = bottom - 60;
        const pr = Math.min(w * .44, (bandBottom - top - 28) / 2);
        const pcy = (top + 28 + bandBottom) / 2;
        const sideValue = diameter * Math.sin(Math.PI / count);
        const apothemValue = diameter / 2 * Math.cos(Math.PI / count);
        const vertex = (i: number) => ({
          x: cx + Math.cos(i * 2 * Math.PI / count - Math.PI / 2 - Math.PI / count) * pr,
          y: pcy + Math.sin(i * 2 * Math.PI / count - Math.PI / 2 - Math.PI / count) * pr,
        });
        for (let i = 0; i < count; i++) {
          shape(ctx, [{ x: cx, y: pcy }, vertex(i), vertex(i + 1)], PALE, SILVER, HAIR);
        }
        // outline over the segment fills
        for (let i = 0; i < count; i++) {
          const a = vertex(i), b = vertex(i + 1);
          strokeLine(ctx, a.x, a.y, b.x, b.y, BLACK, 1);
        }
        // side across the top edge, radius along a spoke, apothem in set-out blue
        const t0 = vertex(0), t1 = vertex(1);
        dimension(ctx, t0.x, t0.y, t1.x, t1.y, fmt(sideValue), BLACK, -26);
        const vr = vertex(Math.ceil(count * .72));
        dimension(ctx, cx, pcy, vr.x, vr.y, fmt(diameter / 2), BLACK, 0);
        const mid = { x: (vertex(count - 1).x + vertex(0).x) / 2, y: (vertex(count - 1).y + vertex(0).y) / 2 };
        dimension(ctx, cx, pcy, mid.x, mid.y, fmt(apothemValue), BLUE, 0);
        angleLabel(ctx, `${n(360 / count)}°`, cx + 8, pcy + 24, "left");
        centerMark(ctx, cx, pcy);
        infoLines(ctx, [
          `${count} Sides @ ${fmt(sideValue)} ${unit}`,
          `Across corners ${fmt(diameter)} - Across flats ${fmt(apothemValue * 2)}`,
        ], left, bandBottom + 22, "left");
        return;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let i = 0; i < count; i++) {
        const a = i * Math.PI * 2 / count - Math.PI / 2;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        // radial set-out line stops short of the centre, leaving the info block clear
        hairline(ctx, cx + Math.cos(a) * r * .32, cy + Math.sin(a) * r * .32, x, y);
        strokeLine(ctx, x, y, cx + Math.cos(a) * (r + 9), cy + Math.sin(a) * (r + 9), BLACK, 1);
        // labels sit radially outside the rim, upright — as on the divider templates
        ctx.save();
        ctx.font = font(11);
        ctx.translate(cx + Math.cos(a) * (r + 22), cy + Math.sin(a) * (r + 22));
        let rot = a + Math.PI / 2;
        if (rot > Math.PI / 2 && rot < Math.PI * 1.5) rot += Math.PI;
        ctx.rotate(rot);
        ctx.textAlign = "center";
        ctx.fillStyle = BLACK;
        ctx.fillText(String(i + 1), 0, 0);
        ctx.restore();
      }
      // info panel is cleared first so its white backing cannot erase the centre mark
      infoLines(ctx, [
        `${count} Divisions of ${n(360 / count, 3)}°`,
        `Circumference ${fmt(Math.PI * diameter)}`,
        `Diameter ${fmt(diameter)}`,
      ], cx, cy - 20, "center", 12, 19, true);
      centerMark(ctx, cx, cy);
      dimension(ctx, cx - r, cy, cx + r, cy, `Ø ${fmt(diameter)} ${unit}`, BLACK, r + 42);
    }
  } else if (kind === "tube") {
    const x = left + 6, y = top + 54;
    const plotW = w * .68, plotH = h * .5, points = 64;
    // white template field with station ordinates only — no tinted panel, frame or graph grid
    for (let i = 0; i <= 12; i++) hairline(ctx, x + i / 12 * plotW, y, x + i / 12 * plotW, y + plotH);
    strokeLine(ctx, x, y + plotH, x + plotW, y + plotH, BLACK, 1);
    // Each joint unrolls to its own curve, so the template is plotted from the
    // joint's own geometry rather than one shared cosine: a miter is a raised
    // cosine, a notch is the saddle of the parent tube, and a tube through a
    // flat sheet cuts twice per turn.
    const joint = Math.round(values.jointKind || 0);
    const cutDiameter = values.diameter || values.tubeDiameter || 60;
    const depthAt = tubeCutProfile(joint, cutDiameter, values.parentDiameter || cutDiameter * 1.5, values.angle || 45);
    let peak = 1e-6;
    for (let i = 0; i <= points; i++) peak = Math.max(peak, depthAt(i / points * Math.PI * 2));
    const plot = (i: number) => ({
      x: x + i / points * plotW,
      y: y + plotH * .16 + depthAt(i / points * Math.PI * 2) / peak * plotH * .68,
    });
    // the waste below the cut line, shaded the way a printed wrap shows it
    const waste = Array.from({ length: points + 1 }, (_, i) => plot(i));
    shape(ctx, [...waste, { x: x + plotW, y: y + plotH }, { x, y: y + plotH }], PALE, "", 0);
    ctx.beginPath();
    waste.forEach((point, i) => (i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // degree stations along the wrap, as on the printed notching templates
    for (let i = 0; i <= 12; i += 3) {
      strokeLine(ctx, x + i / 12 * plotW, y + plotH, x + i / 12 * plotW, y + plotH + 5, BLACK, 1);
      note(ctx, `${i * 30}°`, x + i / 12 * plotW, y + plotH + 14, BLACK, "center", 11);
    }
    // dashed datum through the deepest point of the cut
    const deepY = y + plotH * .16 + plotH * .68;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = SILVER;
    ctx.lineWidth = HAIR;
    ctx.beginPath();
    ctx.moveTo(x, deepY);
    ctx.lineTo(x + plotW, deepY);
    ctx.stroke();
    ctx.restore();
    // name the station the curve actually bottoms out at, rather than assuming
    let deepestAt = 0, deepestValue = -1;
    for (let i = 0; i <= points; i++) {
      const d = depthAt(i / points * Math.PI * 2);
      if (d > deepestValue) { deepestValue = d; deepestAt = i / points * 360; }
    }
    note(ctx, `Deepest cut at ${n(deepestAt, 0)}°`, x + plotW - 6, deepY + 13, GREY, "right", 11);
    dimension(ctx, x, y + plotH, x + plotW, y + plotH, `Wrap ${fmt(Math.PI * (values.diameter || values.tubeDiameter || 60))}`, BLACK, 44);
    const cx = right - w * .12, cy = y + plotH / 2, r = Math.min(44, plotH * .32);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = FILL;
    ctx.fill();
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 1;
    ctx.stroke();
    centerMark(ctx, cx, cy);
    note(ctx, "End view", cx, cy + r + 18, GREY, "center", 11);
    // big saw-setting angle with the joint sizes beside it, template style
    note(ctx, `${n(values.angle || 45)}°`, cx, cy - r - 60, BLACK, "center", 22, "bold");
    infoLines(ctx, [
      `Cut Ø ${fmt(values.diameter || values.tubeDiameter || 60)} ${unit}`,
      ...(values.parentDiameter ? [`Parent Ø ${fmt(values.parentDiameter)} ${unit}`] : []),
    ], cx, cy - r - 32, "center", 12);
    infoLines(ctx, ["Cut profile wrap template"], left, top + 4, "left");
  } else if (kind === "masonry" || kind === "grid") {
    const rows = Math.max(2, Math.min(12, Math.round(values.rows || values.courses || 6)));
    const cols = Math.max(2, Math.min(16, Math.round(values.columns || values.count || 9)));
    const gridTop = top + 40;
    const cellW = w / cols;
    const cellH = Math.max(4, (h - 74) / rows);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, gridTop, w, rows * cellH);
    ctx.clip();
    for (let row = 0; row < rows; row++) for (let col = -1; col <= cols; col++) {
      const stagger = kind === "masonry" && row % 2 ? cellW / 2 : 0;
      const x = left + col * cellW + stagger;
      plate(ctx, x + 1, gridTop + row * cellH + 1, cellW - 2, cellH - 2, FILL, SILVER);
    }
    ctx.restore();
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 1;
    ctx.strokeRect(left, gridTop, w, rows * cellH);
    dimension(ctx, left, gridTop + rows * cellH, right, gridTop + rows * cellH, fmt(values.length || values.span || 6000), BLACK, 38);
    // Only dimension the height when a real one exists — the old fallback
    // printed the course count as though it were a length.
    const wallHeight = values.height || (values.courseHeight ? rows * values.courseHeight : 0);
    if (wallHeight > 0) dimension(ctx, right, gridTop, right, gridTop + rows * cellH, fmt(wallHeight), BLACK, -Math.min(38, width - right - 16));
    // running course heights up the left edge, on the bonded walls
    if (kind === "masonry" && values.courseHeight) {
      for (let row = 1; row < rows; row += rows > 8 ? 2 : 1) {
        setOutMark(ctx, n(row * values.courseHeight), left + 10, gridTop + rows * cellH - row * cellH + cellH * 0.5);
      }
    }
    infoLines(ctx, [
      `${rows} Courses - ${cols} Modules`,
      ...(values.memberWidth && values.courseHeight ? [
        `Module ${n(values.memberWidth)} x ${n(values.courseHeight - (values.gap || 0))} - Joint ${n(values.gap || 0)}`,
      ] : []),
    ], width / 2, top + 4);
  } else if (kind === "arch") {
    const cx = left + w / 2;
    const spring = bottom - 32;
    const radius = Math.min(w * .44, h * .72);
    const segments = Math.max(5, Math.min(19, Math.round(values.count || 11)));
    hairline(ctx, left - 10, spring, right + 10, spring);
    for (let i = 0; i < segments; i++) {
      const a0 = Math.PI + i * Math.PI / segments;
      const a1 = Math.PI + (i + 1) * Math.PI / segments;
      const inner = radius * .74;
      ctx.beginPath();
      ctx.arc(cx, spring, radius, a0, a1);
      ctx.arc(cx, spring, inner, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? FILL : PALE;
      ctx.fill();
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // voussoir numbers on the ring, as blocklayer numbers its arch units
    for (let i = 0; i < segments; i += segments > 11 ? 2 : 1) {
      const a = Math.PI + (i + 0.5) * Math.PI / segments;
      const mid = radius * 0.87;
      ctx.save();
      ctx.font = font(10);
      ctx.translate(cx + Math.cos(a) * mid, spring + Math.sin(a) * mid);
      let rot = a + Math.PI / 2;
      if (rot > Math.PI / 2 && rot < Math.PI * 1.5) rot += Math.PI;
      ctx.rotate(rot);
      ctx.textAlign = "center";
      ctx.fillStyle = GREY;
      ctx.fillText(String(i + 1), 0, 0);
      ctx.restore();
    }
    const radiusMM = (values.span || values.width || radius * 2) / 2;
    leader(ctx, `R ${n(radiusMM)}`, cx + Math.cos(-Math.PI / 4) * radius * 0.74, spring + Math.sin(-Math.PI / 4) * radius * 0.74,
      cx + radius * 0.62, spring - radius - 18, BLACK, 11);
    centerMark(ctx, cx, spring);
    dimension(ctx, cx - radius, spring, cx + radius, spring, fmt(values.span || values.width || radius * 2), BLACK, 40);
    // rise is dimensioned clear of the arch ring, not through the voussoirs —
    // and held onto the sheet when a narrow canvas leaves no stage room
    dimension(ctx, cx, spring, cx, spring - radius, fmt(values.rise || radius), BLACK, -Math.min(radius + 46, cx - 16));
    infoLines(ctx, [
      `${segments} Voussoirs @ ${n(180 / segments, 3)}°`,
      ...(values.thickness ? [`Ring Depth ${n(values.thickness)} - Springline level`] : []),
    ], width / 2, top + 4);
  } else if (kind === "tilerow") {
    // tiled floor rows with the balanced edge cuts shaded and dimensioned
    const cols = Math.max(2, Math.min(24, Math.round(values.columns || values.count || 6)));
    const rows = Math.max(1, Math.min(12, Math.round(values.rows || 4)));
    const span = L("span", 3600);
    const tile = Math.max(1, values.memberWidth || 600);
    const joint = Math.max(0, values.gap || 0);
    const edge = Math.max(0, cols === 1 ? span : (span - (cols - 2) * tile - (cols - 1) * joint) / 2);
    const floorTop = top + 56, floorH = Math.max(50, h - 118);
    const rowH = floorH / rows;
    const sc = w / span;
    for (let r = 0; r < rows; r++) {
      let px = left;
      for (let i = 0; i < cols; i++) {
        const cw = (i === 0 || i === cols - 1 ? edge : tile) * sc;
        plate(ctx, px, floorTop + r * rowH + 1, Math.max(2, cw - joint * sc), rowH - 3,
          i === 0 || i === cols - 1 ? FILL : PALE, SILVER);
        px += cw + joint * sc;
      }
    }
    dimension(ctx, left, floorTop + 1, left + edge * sc, floorTop + 1, n(edge), RED, -16);
    if (cols > 2) dimension(ctx, left + (edge + joint) * sc, floorTop + floorH, left + (edge + joint + tile) * sc, floorTop + floorH, n(tile), BLACK, 18);
    dimension(ctx, left, floorTop + floorH, right, floorTop + floorH, fmt(span), BLACK, 42);
    infoLines(ctx, [
      `${cols} Tiles across - Joint ${n(joint)}`,
      [`Equal End Cuts ${n(edge)}`, RED],
    ], width / 2, top + 4);
  } else if (kind === "roomplan") {
    // room outline with diagonal, perimeter and door openings
    const roomL = L("length", 4000);
    const roomW = L("width", 3000);
    const sc = Math.min(w * 0.8 / roomL, (h - 96) * 0.9 / roomW);
    const px = left + (w - roomL * sc) / 2, py = top + 58;
    const pw = roomL * sc, ph = roomW * sc;
    plate(ctx, px, py, pw, ph, PALE, BLACK);
    hairline(ctx, px, py, px + pw, py + ph);
    dimension(ctx, px, py, px + pw, py + ph, n(Math.hypot(roomL, roomW)), GREY, -14);
    const doors = Math.max(0, Math.min(4, Math.round(values.doors || 0)));
    const doorW = Math.max(0, values.doorWidth || 820) * sc;
    for (let d = 0; d < doors; d++) {
      const dx = px + pw * (0.25 + d * 0.3) - doorW / 2;
      ctx.fillStyle = WHITE;
      ctx.fillRect(dx, py + ph - 2, doorW, 5);
      note(ctx, "door", dx + doorW / 2, py + ph + 12, GREY, "center", 10);
    }
    dimension(ctx, px, py + ph, px + pw, py + ph, fmt(roomL), BLACK, doors ? 34 : 22);
    dimension(ctx, px + pw, py, px + pw, py + ph, fmt(roomW), BLACK, -Math.min(38, width - (px + pw) - 16));
    infoLines(ctx, [
      `Perimeter ${n(2 * (roomL + roomW))} ${unit}`,
      `Area ${n(roomL * roomW / (unit === "mm" ? 1e6 : 144), 2)} ${unit === "mm" ? "m²" : "ft²"}`,
    ], width / 2, top + 4);
  } else if (kind === "sheetlayout") {
    // sheets over a wall, the cut column shaded and dimensioned
    const cols = Math.max(1, Math.min(14, Math.round(values.columns || 3)));
    const rows = Math.max(1, Math.min(8, Math.round(values.rows || 2)));
    const sheetL = safe(values.sheetLength || values.tileLength || values.battLength, 2400);
    const sheetW = safe(values.sheetWidth || values.tileWidth || values.battWidth, 1200);
    const wallL = L("length", cols * sheetL);
    const areaTop = top + 56, areaH = Math.max(60, h - 118);
    const sc = w / Math.max(cols * sheetL, wallL);
    const cellW = sheetL * sc, cellH = areaH / rows;
    const lastW = Math.max(6, (wallL - (cols - 1) * sheetL) * sc);
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
      const cw = i === cols - 1 ? lastW : cellW;
      plate(ctx, left + i * cellW + 1, areaTop + r * cellH + 1, cw - 2, cellH - 3,
        i === cols - 1 && lastW < cellW - 2 ? FILL : PALE, SILVER);
    }
    dimension(ctx, left, areaTop + 8, left + cellW, areaTop + 8, `${n(sheetL)} x ${n(sheetW)}`, BLACK, -18);
    if (lastW < cellW - 2) dimension(ctx, left + (cols - 1) * cellW, areaTop + areaH, left + (cols - 1) * cellW + lastW, areaTop + areaH, n(wallL - (cols - 1) * sheetL), RED, 18);
    dimension(ctx, left, areaTop + areaH, left + Math.min(w, wallL * sc), areaTop + areaH, fmt(wallL), BLACK, 42);
    infoLines(ctx, [
      `${rows * cols} Sheets - ${rows} Rows of ${cols}`,
      [`Cut column against the far wall`, GREY],
    ], width / 2, top + 4);
  } else if (kind === "timberstack") {
    // a stack of sawn sections, end grain out, with the section dimensioned
    const secW = L("width", 90), secH = L("height", 45);
    const pieces = Math.max(1, Math.min(12, Math.round(values.count || 8)));
    const sc = Math.min(w * 0.16 / secW, h * 0.2 / secH);
    const pw = Math.max(26, secW * sc), ph = Math.max(16, secH * sc);
    const perRow = Math.min(pieces, 4);
    const stackX = left + w * 0.5 - perRow * (pw + 8) / 2;
    const stackY = top + h * 0.62;
    for (let i = 0; i < pieces; i++) {
      const rx = stackX + (i % perRow) * (pw + 8) + (Math.floor(i / perRow) % 2 ? pw * 0.24 : 0);
      const ry = stackY - Math.floor(i / perRow) * (ph + 7);
      plate(ctx, rx, ry, pw, ph, wood(ctx, "end"));
    }
    dimension(ctx, stackX, stackY + ph, stackX + pw, stackY + ph, n(secW), BLACK, 20);
    dimension(ctx, stackX, stackY, stackX, stackY + ph, n(secH), BLACK, Math.min(30, stackX - left));
    const lenMM = safe(values.length, 0);
    infoLines(ctx, [
      `${pieces > 1 ? `${pieces} Pieces` : "Section"} ${n(secW)} x ${n(secH)} ${unit}`,
      ...(lenMM ? [`Length ${fmt(lenMM)} ${unit}`] : []),
    ], width / 2, top + 4);
  } else if (kind === "paintwall") {
    // wall part-painted on the diagonal, roller at the wet edge
    const wallL = L("length", 12000), wallH = L("height", 2400);
    const py = top + 56, ph = Math.max(60, h - 118);
    plate(ctx, left, py, w, ph, WHITE, BLACK);
    shape(ctx, [{ x: left, y: py }, { x: left + w * 0.62, y: py }, { x: left + w * 0.38, y: py + ph }, { x: left, y: py + ph }], FILL, SILVER, HAIR);
    const rx = left + w * 0.52;
    plate(ctx, rx - 5, py + ph * 0.36, 10, ph * 0.26, FILL);
    strokeLine(ctx, rx, py + ph * 0.36, rx + 26, py + ph * 0.24, BLACK, 1.4);
    dimension(ctx, left, py + ph, right, py + ph, fmt(wallL), BLACK, 42);
    dimension(ctx, right, py, right, py + ph, fmt(wallH), BLACK, -Math.min(38, width - right - 16));
    infoLines(ctx, [
      `${Math.max(1, Math.round(values.coats || 1))} Coats over ${n(wallL * wallH / (unit === "mm" ? 1e6 : 144), 2)} ${unit === "mm" ? "m²" : "ft²"}`,
    ], width / 2, top + 4);
  } else if (kind === "trench") {
    // trench in section, hatched ground each side, concrete when poured
    const trenchW = L("width", 300), trenchD = L("depth", 300);
    const concreteFill = values.concrete === 1;
    const sc = Math.min(w * 0.2 / trenchW, h * 0.5 / trenchD);
    const tw = Math.max(40, trenchW * sc), td = Math.max(50, trenchD * sc);
    const cx = left + w / 2, gy = top + h * 0.34;
    hairline(ctx, left - 10, gy, right + 10, gy);
    hatch(ctx, left, gy, cx - tw / 2 - left, td + 26);
    hatch(ctx, cx + tw / 2, gy, right - cx - tw / 2, td + 26);
    strokeLine(ctx, cx - tw / 2, gy, cx - tw / 2, gy + td, BLACK, 1);
    strokeLine(ctx, cx + tw / 2, gy, cx + tw / 2, gy + td, BLACK, 1);
    strokeLine(ctx, cx - tw / 2, gy + td, cx + tw / 2, gy + td, BLACK, 1);
    if (concreteFill) plate(ctx, cx - tw / 2 + 1, gy + td * 0.25, tw - 2, td * 0.75, concrete(ctx), BLACK);
    dimension(ctx, cx - tw / 2, gy + td, cx + tw / 2, gy + td, n(trenchW), BLACK, 26);
    dimension(ctx, cx + tw / 2, gy, cx + tw / 2, gy + td, n(trenchD), BLACK, -Math.min(60, width - cx - tw / 2 - 24));
    const runMM = safe(values.length, 0);
    infoLines(ctx, [
      `Section ${n(trenchW)} x ${n(trenchD)}${runMM ? ` - Run ${fmt(runMM)} ${unit}` : ""}`,
      concreteFill ? "Poured to the shoulder line" : "Excavated section",
    ], width / 2, top + 4);
  } else if (kind === "slabpour") {
    // small pour with its depth, and the mix counted out in bags
    const pourL = L("length", 2000), pourW = L("width", 1000);
    const sc = Math.min(w * 0.5 / pourL, h * 0.34 / pourW);
    const pw = Math.max(80, pourL * sc), ph = Math.max(46, pourW * sc);
    const px = left + 8, py = top + 66;
    plate(ctx, px, py, pw, ph, concrete(ctx), BLACK);
    dimension(ctx, px, py + ph, px + pw, py + ph, n(pourL), BLACK, 24);
    dimension(ctx, px + pw, py, px + pw, py + ph, n(pourW), BLACK, -26);
    note(ctx, `↕ ${n(values.depth || values.thickness || 100)}`, px + pw + 34, py + 12, BLACK, "left", 11);
    const bags = Math.max(1, Math.min(60, Math.round(values.bags || 6)));
    const shown = Math.max(2, Math.min(bags, 10, Math.floor((w - 90) / 34)));
    const by = bottom - 44;
    for (let i = 0; i < shown; i++) {
      const bx = left + 14 + i * 34;
      plate(ctx, bx, by - 20, 24, 26, FILL, BLACK);
      plate(ctx, bx + 7, by - 26, 10, 7, FILL, BLACK);
    }
    note(ctx, `× ${values.bags ? Math.round(values.bags) : bags} bags`, left + 14 + shown * 34 + 8, by - 6, BLACK, "left", 12);
    infoLines(ctx, [`Bagged mix pour`], width / 2, top + 4);
  } else if (kind === "dualscale") {
    // two scales, source over converted, tied at the entered value
    const pairs: [string, string][] = [["mm", "in"], ["m²", "ft²"], ["m³", "ft³"], ["kg", "lb"]];
    const pair = pairs[Math.max(0, Math.min(3, Math.round(values.convKind || 1) - 1))];
    const factor = safe(values.factor, 25.4) === 25.4 && values.convKind === 1 ? 25.4 : safe(values.factor, 25.4);
    const val = safe(values.value, 1);
    const full = val * 1.25;
    const x = left + 6, barW = w - 12;
    const yA = top + h * 0.34, yB = top + h * 0.66;
    for (const [y, label, mult] of [[yA, pair[0], 1], [yB, pair[1], 1 / factor]] as [number, string, number][]) {
      strokeLine(ctx, x, y, x + barW, y, BLACK, 1);
      for (let i = 0; i <= 10; i++) {
        const px = x + i / 10 * barW;
        strokeLine(ctx, px, y - (i % 5 === 0 ? 13 : 7), px, y, BLACK, i % 5 === 0 ? 1 : HAIR);
        if (i % 5 === 0) note(ctx, n(full * i / 10 * (label === pair[0] ? 1 : factor), 2), px, y + 14, BLACK, "center", 10);
      }
      note(ctx, label, x + barW + 4, y - 4, GREY, "left", 11);
      void mult;
    }
    const vx = x + Math.min(0.99, val / Math.max(full, 1e-9)) * barW;
    strokeLine(ctx, vx, yA - 20, vx, yB + 6, RED, 1);
    note(ctx, n(val, 3), vx, yA - 28, RED, "center", 12);
    note(ctx, n(val * factor, 3), vx, yB + 20, RED, "center", 12);
    infoLines(ctx, [`1 ${pair[0]} = ${n(factor, 6)} ${pair[1]}`], width / 2, top + 4);
  } else if (kind === "moneybar") {
    // the quote built up as a bar: cost, markup, then GST
    const cost = Math.max(0, values.cost || 1000);
    const markupAmt = cost * Math.max(0, values.markup || 0) / 100;
    const sub = cost + markupAmt;
    const gstAmt = sub * Math.max(0, values.gst || 0) / 100;
    const total = Math.max(sub + gstAmt, 1e-9);
    const y = top + h * 0.42, bh = Math.max(40, h * 0.2);
    const x = left + 6, barW = w - 12;
    const wCost = cost / total * barW, wMk = markupAmt / total * barW, wGst = gstAmt / total * barW;
    plate(ctx, x, y, wCost, bh, FILL, BLACK);
    plate(ctx, x + wCost, y, wMk, bh, PALE, BLACK);
    plate(ctx, x + wCost + wMk, y, wGst, bh, WHITE, BLACK);
    hatch(ctx, x + wCost + wMk, y, wGst, bh, 7);
    note(ctx, `Cost $${n(cost, 2)}`, x + wCost / 2, y + bh + 16, BLACK, "center", 11);
    if (wMk > 40) note(ctx, `Markup $${n(markupAmt, 2)}`, x + wCost + wMk / 2, y - 12, BLACK, "center", 11);
    note(ctx, `GST $${n(gstAmt, 2)}`, x + wCost + wMk + wGst / 2, y + bh + 16, RED, "center", 11);
    dimension(ctx, x, y, x + barW, y, `Quote $${n(total, 2)}`, BLACK, -34);
    infoLines(ctx, [[`Margin on sell ${n(sub > 0 ? markupAmt / sub * 100 : 0, 2)}%`, GREEN]], width / 2, bottom - 8);
  } else if (kind === "rulerin") {
    // three inches of rule at sixteenths, the entered value arrowed
    const val = Math.max(0, Math.min(2.95, safe(values.value, 0.6875)));
    const x = left + 6, barW = w - 12;
    const y = top + h * 0.5;
    plate(ctx, x, y - 26, barW, 52, PALE, BLACK);
    for (let i = 0; i <= 48; i++) {
      const px = x + i / 48 * barW;
      const len = i % 16 === 0 ? 22 : i % 8 === 0 ? 15 : i % 4 === 0 ? 10 : 6;
      strokeLine(ctx, px, y - 26, px, y - 26 + len, BLACK, i % 16 === 0 ? 1 : HAIR);
      if (i % 16 === 0) note(ctx, String(i / 16), px + 3, y + 14, BLACK, "left", 11);
    }
    const vx = x + val / 3 * barW;
    strokeLine(ctx, vx, y - 40, vx, y + 26, RED, 1);
    note(ctx, `${n(val, 4)} in`, vx, y - 50, RED, "center", 12);
    infoLines(ctx, ["Sixteenths of an inch"], width / 2, bottom - 8);
  } else if (kind === "pitchgauge") {
    // the pitch triangle with a protractor fan at the base corner
    const run = L("width", 1200), rise = safe(values.height, 400);
    const sc = Math.min(w * 0.7 / run, h * 0.6 / Math.max(rise, run * 0.2));
    const bx = left + 24, by = bottom - 40;
    const tx = bx + run * sc, ty = by - rise * sc;
    shape(ctx, [{ x: bx, y: by }, { x: tx, y: by }, { x: tx, y: ty }], FILL, BLACK, 1);
    for (let deg = 0; deg <= 60; deg += 10) {
      const a = -radians(deg);
      hairline(ctx, bx + Math.cos(a) * 52, by + Math.sin(a) * 52, bx + Math.cos(a) * 66, by + Math.sin(a) * 66);
      note(ctx, String(deg), bx + Math.cos(a) * 80, by + Math.sin(a) * 80, GREY, "center", 9);
    }
    const angle = Math.atan2(rise, Math.max(run, 1e-9));
    strokeLine(ctx, bx, by, bx + Math.cos(-angle) * 66, by + Math.sin(-angle) * 66, GREEN, 1.4);
    angleLabel(ctx, `${n(angle * 180 / Math.PI, 2)}°`, bx + 96, by - 44, "left");
    dimension(ctx, bx, by, tx, by, fmt(run), BLACK, 30);
    dimension(ctx, tx, by, tx, ty, fmt(rise), BLACK, -Math.min(40, width - tx - 16));
    infoLines(ctx, [`Pitch ${n(rise / Math.max(run, 1e-9) * 12, 2)} : 12`], width / 2, top + 4);
  } else if (kind === "levelvial") {
    // a spirit level, its bubble drifted by the entered fall
    const angle = Math.atan2(safe(values.rise, 0), Math.max(values.run || 1000, 1e-9));
    const y = top + h * 0.5, x = left + 12, bw = w - 24;
    plate(ctx, x, y - 22, bw, 44, FILL, BLACK);
    plate(ctx, x - 8, y - 26, 8, 52, FILL, BLACK);
    plate(ctx, x + bw, y - 26, 8, 52, FILL, BLACK);
    const vialW = Math.min(150, bw * 0.3);
    ctx.beginPath();
    ctx.ellipse(x + bw / 2, y, vialW / 2, 15, 0, 0, Math.PI * 2);
    ctx.fillStyle = PALE;
    ctx.fill();
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 1;
    ctx.stroke();
    strokeLine(ctx, x + bw / 2 - 12, y - 15, x + bw / 2 - 12, y + 15, BLACK, HAIR);
    strokeLine(ctx, x + bw / 2 + 12, y - 15, x + bw / 2 + 12, y + 15, BLACK, HAIR);
    const drift = Math.max(-1, Math.min(1, angle / radians(3)));
    ctx.beginPath();
    ctx.ellipse(x + bw / 2 + drift * (vialW / 2 - 18), y, 11, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = WHITE;
    ctx.fill();
    ctx.stroke();
    angleLabel(ctx, `${n(angle * 180 / Math.PI, 3)}°`, x + bw / 2, y + 52);
    infoLines(ctx, [`Grade ${n(Math.tan(angle) * 100, 3)}%`], width / 2, top + 4);
  } else if (kind === "rampside") {
    // ramp between two landings, gradient written on the slope
    const rise = safe(values.rise, 450);
    const run = safe(values.run, rise * 14);
    const sc = Math.min(w * 0.62 / run, h * 0.42 / Math.max(rise, run * 0.08));
    const x0 = left + w * 0.14, by = bottom - 46;
    const rx = x0 + run * sc, ty = by - rise * sc;
    plate(ctx, left, by, x0 - left, 12, FILL, BLACK);
    shape(ctx, [{ x: x0, y: by }, { x: rx, y: by }, { x: rx, y: ty }, { x: x0, y: by - 2 }], concrete(ctx), BLACK, 1);
    plate(ctx, rx, ty, right - rx, 12, FILL, BLACK);
    note(ctx, `1 : ${n(values.gradient || run / Math.max(rise, 1e-9), 0)}`, (x0 + rx) / 2, (by + ty) / 2 - 14, GREEN, "center", 13);
    dimension(ctx, x0, by + 12, rx, by + 12, fmt(run), BLACK, 26);
    dimension(ctx, rx, by, rx, ty, fmt(rise), BLACK, -Math.min(40, width - rx - 16));
    infoLines(ctx, [`Landings each end - slope ${n(Math.hypot(run, rise))} ${unit}`], width / 2, top + 4);
  } else if (kind === "bracedframe") {
    // a framed rectangle: both diagonals to square up, or one timber brace
    const frameW = L("width", 4000), frameH = L("height", 3000);
    const sc = Math.min(w * 0.72 / frameW, (h - 100) / frameH);
    const px = left + (w - frameW * sc) / 2, py = top + 58;
    const pw = frameW * sc, ph = frameH * sc;
    member(ctx, px, py + 5, px + pw, py + 5, 10, timber);
    member(ctx, px, py + ph - 5, px + pw, py + ph - 5, 10, timber);
    member(ctx, px + 5, py, px + 5, py + ph, 10);
    member(ctx, px + pw - 5, py, px + pw - 5, py + ph, 10);
    const diagonal = Math.hypot(frameW, frameH);
    if (values.measured !== undefined) {
      hairline(ctx, px, py, px + pw, py + ph);
      hairline(ctx, px + pw, py, px, py + ph);
      dimension(ctx, px, py, px + pw, py + ph, n(diagonal), BLACK, -14);
      note(ctx, `Measured ${n(values.measured)}`, px + pw * 0.32, py + ph * 0.72, RED, "center", 11);
    } else {
      member(ctx, px, py + ph, px + pw, py, 12, timber);
      dimension(ctx, px, py + ph, px + pw, py, n(diagonal), BLACK, -16);
    }
    dimension(ctx, px, py + ph, px + pw, py + ph, fmt(frameW), BLACK, 34);
    dimension(ctx, px + pw, py, px + pw, py + ph, fmt(frameH), BLACK, -Math.min(38, width - (px + pw) - 16));
    infoLines(ctx, [[`Diagonal ${n(diagonal)} ${unit}`, GREEN]], width / 2, top + 4);
  } else if (kind === "goldenspiral") {
    // golden rectangle subdivided, quarter arcs sweeping the spiral
    const long = L("width", 1000);
    const phi = (1 + Math.sqrt(5)) / 2;
    const sc = Math.min(w * 0.7 / long, (h - 96) / (long / phi));
    const pw = long * sc, ph = long / phi * sc;
    const px = left + (w - pw) / 2, py = top + 60;
    plate(ctx, px, py, pw, ph, WHITE, BLACK);
    let sx = px, sy = py, sw2 = pw, sh2 = ph;
    for (let i = 0; i < 5; i++) {
      const side = Math.min(sw2, sh2);
      if (i % 4 === 0) { strokeLine(ctx, sx + side, sy, sx + side, sy + sh2, SILVER, HAIR); ctx.beginPath(); ctx.arc(sx + side, sy + side, side, Math.PI, Math.PI * 1.5); ctx.strokeStyle = GREEN; ctx.lineWidth = 1.2; ctx.stroke(); sx += side; sw2 -= side; }
      else if (i % 4 === 1) { strokeLine(ctx, sx, sy + side, sx + sw2, sy + side, SILVER, HAIR); ctx.beginPath(); ctx.arc(sx, sy + side, side, Math.PI * 1.5, Math.PI * 2); ctx.strokeStyle = GREEN; ctx.stroke(); sy += side; sh2 -= side; }
      else if (i % 4 === 2) { strokeLine(ctx, sx + sw2 - side, sy, sx + sw2 - side, sy + sh2, SILVER, HAIR); ctx.beginPath(); ctx.arc(sx + sw2 - side, sy, side, 0, Math.PI * 0.5); ctx.strokeStyle = GREEN; ctx.stroke(); sw2 -= side; }
      else { strokeLine(ctx, sx, sy + sh2 - side, sx + sw2, sy + sh2 - side, SILVER, HAIR); ctx.beginPath(); ctx.arc(sx + sw2, sy + sh2 - side, side, Math.PI * 0.5, Math.PI); ctx.strokeStyle = GREEN; ctx.stroke(); sh2 -= side; }
    }
    dimension(ctx, px, py + ph, px + pw, py + ph, fmt(long), BLACK, 34);
    dimension(ctx, px + pw, py, px + pw, py + ph, n(long / phi), BLACK, -Math.min(38, width - (px + pw) - 16));
    infoLines(ctx, [`φ = ${n(phi, 6)}`], width / 2, top + 4);
  } else if (kind === "pyramidplan") {
    // plan with diagonals beside the true elevation
    const base = L("width", 2000), pHeight = safe(values.height, 1800);
    const sc = Math.min(w * 0.3 / base, (h - 110) / base, (h - 110) / pHeight);
    const pw = base * sc;
    const px = left + w * 0.08, py = top + 60 + Math.max(0, (pHeight - base) * sc / 2);
    plate(ctx, px, py, pw, pw, PALE, BLACK);
    hairline(ctx, px, py, px + pw, py + pw);
    hairline(ctx, px + pw, py, px, py + pw);
    centerMark(ctx, px + pw / 2, py + pw / 2);
    dimension(ctx, px, py + pw, px + pw, py + pw, fmt(base), BLACK, 30);
    const ex = left + w * 0.58, ey = py + pw;
    const eh = pHeight * sc;
    shape(ctx, [{ x: ex, y: ey }, { x: ex + pw, y: ey }, { x: ex + pw / 2, y: ey - eh }], FILL, BLACK, 1);
    hairline(ctx, ex + pw / 2, ey, ex + pw / 2, ey - eh);
    dimension(ctx, ex + pw / 2, ey, ex + pw / 2, ey - eh, n(pHeight), BLACK, 0);
    dimension(ctx, ex, ey, ex + pw / 2, ey - eh, n(Math.hypot(pHeight, base / 2)), BLACK, -16);
    note(ctx, "Plan", px + pw / 2, py - 12, GREY, "center", 11);
    note(ctx, "Elevation", ex + pw / 2, ey + 16, GREY, "center", 11);
    infoLines(ctx, [`Base ${n(base)} - Apex ${n(pHeight)} ${unit}`], width / 2, top + 4);
  } else if (kind === "miterjoint") {
    // two pieces meeting at the plan angle, saw line on the joint
    const included = Math.max(1, Math.min(179, safe(values.planAngle, 90)));
    const half = radians(included) / 2;
    const cx = left + w / 2, cy = top + h * 0.62;
    const armLen = Math.min(w * 0.4, h * 0.5);
    const bw = Math.max(16, armLen * 0.16);
    for (const s of [-1, 1]) {
      const a = -Math.PI / 2 + s * half;
      member(ctx, cx, cy, cx + Math.cos(a) * armLen, cy + Math.sin(a) * armLen, bw, timber);
    }
    strokeLine(ctx, cx, cy - bw, cx, cy + bw * 1.6, RED, 1);
    angleArc(ctx, cx, cy, 40, -Math.PI / 2 - half, -Math.PI / 2 + half, `${n(included, 2)}°`);
    note(ctx, `Miter ${n((180 - included) / 2, 2)}°`, cx, cy + bw * 1.6 + 16, BLACK, "center", 12);
    const slope = safe(values.slope, 0);
    infoLines(ctx, [
      `Included plan angle ${n(included, 2)}°`,
      ...(slope ? [`Piece slope ${n(slope, 2)}° - see saw settings`] : []),
    ], width / 2, top + 4);
  } else if (kind === "boltring") {
    // pitch circle with the holes drilled on it
    const holes = Math.max(3, Math.min(36, Math.round(values.count || 8)));
    const r = Math.min(w, h) * 0.4;
    const cx = left + w / 2, cy = top + h * 0.52;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = SILVER;
    ctx.lineWidth = HAIR;
    ctx.stroke();
    const holeR = Math.max(4, Math.min(14, r * 0.09));
    for (let i = 0; i < holes; i++) {
      const a = i * Math.PI * 2 / holes - Math.PI / 2;
      const hx = cx + Math.cos(a) * r, hy = cy + Math.sin(a) * r;
      ctx.beginPath();
      ctx.arc(hx, hy, holeR, 0, Math.PI * 2);
      ctx.fillStyle = WHITE;
      ctx.fill();
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = 1;
      ctx.stroke();
      centerMark(ctx, hx, hy);
    }
    const a0 = -Math.PI / 2, a1 = -Math.PI / 2 + Math.PI * 2 / holes;
    dimension(ctx, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, n(2 * (values.diameter || 1200) / 2 * Math.sin(Math.PI / holes)), RED, -20);
    centerMark(ctx, cx, cy);
    dimension(ctx, cx - r, cy, cx + r, cy, `PCD Ø ${fmt(values.diameter || 1200)} ${unit}`, BLACK, r * 0.6 + 40);
    infoLines(ctx, [`${holes} Holes @ ${n(360 / holes, 3)}°`], left, top + 4, "left");
  } else if (kind === "segmentarc") {
    // curved molding built from straight segments over the sweep
    const sweep = Math.max(10, Math.min(360, safe(values.sweep, 180)));
    const segs = Math.max(2, Math.min(24, Math.round(values.segments || values.count || 12)));
    const r = Math.min(w, h * (sweep > 200 ? 0.9 : 1.4)) * 0.4;
    const cx = left + w / 2, cy = sweep > 200 ? top + h * 0.52 : bottom - 40;
    const start = Math.PI + (Math.PI - radians(sweep)) / 2;
    const band = r * 0.18;
    let prev: Point2 | null = null;
    for (let i = 0; i <= segs; i++) {
      const a = start + radians(sweep) * i / segs;
      const p = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
      if (prev) member(ctx, prev.x, prev.y, p.x, p.y, band, timber);
      if (i > 0 && i < segs) hairline(ctx, cx + Math.cos(a) * (r - band), cy + Math.sin(a) * (r - band), cx + Math.cos(a) * (r + band), cy + Math.sin(a) * (r + band));
      prev = p;
    }
    const chord = 2 * (values.diameter || 2400) / 2 * Math.sin(radians(sweep / segs) / 2);
    const c0 = start, c1 = start + radians(sweep) / segs;
    dimension(ctx, cx + Math.cos(c0) * r, cy + Math.sin(c0) * r, cx + Math.cos(c1) * r, cy + Math.sin(c1) * r, n(chord), RED, 22);
    centerMark(ctx, cx, cy);
    angleLabel(ctx, `${n(sweep / segs / 2, 2)}°`, cx, cy - 24);
    infoLines(ctx, [
      `${segs} Segments over ${n(sweep, 1)}°`,
      `Miter each end ${n(sweep / segs / 2, 2)}°`,
    ], left, top + 4, "left");
  } else if (kind === "blockring") {
    // one course of a circular wall, joints radiating to centre
    const units = Math.max(6, Math.min(60, Math.round(values.count || 24)));
    const r = Math.min(w, h) * 0.4;
    const cx = left + w / 2, cy = top + h * 0.52;
    const band = Math.max(12, r * 0.16);
    for (let i = 0; i < units; i++) {
      const a0 = i * Math.PI * 2 / units, a1 = (i + 1) * Math.PI * 2 / units;
      ctx.beginPath();
      ctx.arc(cx, cy, r + band / 2, a0, a1);
      ctx.arc(cx, cy, r - band / 2, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? FILL : PALE;
      ctx.fill();
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = HAIR;
      ctx.stroke();
    }
    centerMark(ctx, cx, cy);
    dimension(ctx, cx - r, cy, cx + r, cy, `Ø ${fmt(values.diameter || 6000)} ${unit}`, BLACK, r * 0.55 + 42);
    angleLabel(ctx, `${n(360 / units, 3)}°`, cx, cy - 24);
    infoLines(ctx, [
      `${units} Blocks per course`,
      [`Joint tapers to centre`, GREY],
    ], left, top + 4, "left");
  } else if (kind === "edgebeamplan") {
    // slab plan with the thickened edge band and its section
    const slabL = L("length", 6000), slabW = L("width", 4000);
    const beamW = Math.max(1, values.beamWidth || 300);
    const sc = Math.min(w * 0.64 / slabL, (h - 100) / slabW);
    const px = left + 10, py = top + 58;
    const pw = slabL * sc, ph = slabW * sc;
    const bw = Math.max(6, Math.min(pw * 0.2, beamW * sc));
    plate(ctx, px, py, pw, ph, FILL, BLACK);
    plate(ctx, px + bw, py + bw, pw - bw * 2, ph - bw * 2, PALE, SILVER);
    dimension(ctx, px, py + ph, px + pw, py + ph, fmt(slabL), BLACK, 34);
    dimension(ctx, px + pw, py, px + pw, py + ph, fmt(slabW), BLACK, -22);
    dimension(ctx, px, py + bw, px + bw, py + bw, n(beamW), RED, -14);
    const sx = right - Math.min(78, w * 0.16), sy = py + 12;
    const sh = Math.min(96, h * 0.3);
    plate(ctx, sx - 30, sy, 60, sh * 0.4, concrete(ctx));
    plate(ctx, sx - 30, sy + sh * 0.4, 26, sh * 0.6, concrete(ctx));
    note(ctx, `↕ ${n(values.beamDepth || 450)}`, sx + 34, sy + sh * 0.5, BLACK, "left", 11);
    note(ctx, "Edge section", sx, sy + sh + 14, GREY, "center", 10);
    infoLines(ctx, [
      `Edge beam ${n(beamW)} x ${n(values.beamDepth || 450)} all round`,
      `Slab body ${n(values.thickness || 100)} thick`,
    ], width / 2, top + 4);
  } else if (kind === "balusters") {
    // balustrade elevation: rails, posts and the infill set out to equal gaps
    const count = Math.max(1, Math.min(60, Math.round(values.count || 8)));
    const span = L("span", 3600);
    const stockW = Math.max(0, values.memberWidth || 40);
    const clearGap = Math.max(0, values.gap || 0);
    const panel = values.panel === 1;
    const railTop = top + 64, railBottom = bottom - 58;
    const sc = w / span;
    // a tool that resolved its own centres (fence bays) starts at zero
    const explicit = safe(values.spacing || values.center, 0);
    const centres = explicit > 0 ? explicit : stockW + clearGap;
    const first = explicit > 0 ? 0 : clearGap + stockW / 2;
    plate(ctx, left - 15, railTop - 8, 15, railBottom - railTop + 16, wood(ctx, "vert"));
    plate(ctx, right, railTop - 8, 15, railBottom - railTop + 16, wood(ctx, "vert"));
    plate(ctx, left, railTop, w, 12, timber);
    plate(ctx, left, railBottom - 12, w, 12, timber);
    for (let i = 0; i < count; i++) {
      const mx = left + (first + i * centres) * sc;
      const bw = Math.max(panel ? 10 : 5, stockW * sc);
      if (mx - bw / 2 < left || mx + bw / 2 > right) continue;
      if (panel) plate(ctx, mx - bw / 2, railTop + 12, bw, railBottom - railTop - 24, PALE, SILVER);
      else plate(ctx, mx - bw / 2, railTop + 12, bw, railBottom - railTop - 24, wood(ctx, "vert"));
      if (i < 26) setOutMark(ctx, n(first + i * centres), mx - 3, railBottom - 22);
    }
    dimension(ctx, left, railBottom, right, railBottom, fmt(span), BLACK, 42);
    infoLines(ctx, [
      `${count} ${panel ? "Panels" : "Balusters"} across ${fmt(span)} ${unit}`,
      [`Equal Clear Gap ${n(clearGap)}`, RED],
    ], width / 2, top + 4);
  } else if (kind === "studwall") {
    // wall framing elevation: plates, studs and staggered noggins
    const count = Math.max(2, Math.min(40, Math.round(values.count || 8)));
    const span = L("span", 6000);
    const stockW = Math.max(0, values.memberWidth || 45);
    const clearGap = Math.max(0, values.gap || 0);
    const opening = values.opening === 1;
    const plateTop = top + 62, plateBottom = bottom - 56;
    const sc = w / span;
    const centres = stockW + clearGap;
    const first = clearGap + stockW / 2;
    plate(ctx, left, plateTop, w, 11, timber);
    plate(ctx, left, plateTop + 11, w, 11, timber);
    plate(ctx, left, plateBottom - 12, w, 12, timber);
    const nogginY = (plateTop + plateBottom) / 2;
    for (let i = 0; i < count; i++) {
      const mx = left + (first + i * centres) * sc;
      const sw = Math.max(6, Math.min(16, stockW * sc));
      if (mx - sw / 2 < left || mx + sw / 2 > right) continue;
      plate(ctx, mx - sw / 2, plateTop + 22, sw, plateBottom - plateTop - 34, wood(ctx, "vert"));
      if (i > 0) {
        const px = left + (first + (i - 0.5) * centres) * sc;
        plate(ctx, px - centres * sc / 2 + sw / 2, nogginY + (i % 2 ? -16 : 5), Math.max(8, centres * sc - sw), 11, timber);
      }
      if (i < 26) setOutMark(ctx, n(first + i * centres), mx - 3, plateBottom - 22);
    }
    if (opening) {
      const ox = left + w * 0.36, ow = w * 0.3;
      ctx.fillStyle = WHITE;
      ctx.fillRect(ox, plateTop + 22, ow, (plateBottom - plateTop) * 0.58);
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = SILVER;
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, plateTop + 22, ow, (plateBottom - plateTop) * 0.58);
      ctx.restore();
      note(ctx, "Opening", ox + ow / 2, plateTop + (plateBottom - plateTop) * 0.32, GREY, "center", 11);
    }
    dimension(ctx, left, plateBottom, right, plateBottom, fmt(span), BLACK, 40);
    const wallH = values.height || 0;
    if (wallH > 0) dimension(ctx, right, plateTop, right, plateBottom, fmt(wallH), BLACK, -Math.min(38, width - right - 16));
    infoLines(ctx, [
      `${count} Studs across ${fmt(span)} ${unit}`,
      [`Stud Centres ${n(centres)}`, RED],
    ], width / 2, top + 4);
  } else if (kind === "cladding") {
    // lapped weatherboards, or vertical board-and-batten when asked
    const vertical = values.vertical === 1;
    if (vertical) {
      const count = Math.max(2, Math.min(40, Math.round(values.count || 8)));
      const clTop = top + 60, clBottom = bottom - 56;
      const boardW = w / count;
      for (let i = 0; i < count; i++) {
        plate(ctx, left + i * boardW, clTop, boardW, clBottom - clTop, wood(ctx, "vert"), SILVER);
      }
      for (let i = 0; i <= count; i++) {
        const bx = Math.min(right - 4, Math.max(left, left + i * boardW - 4));
        plate(ctx, bx, clTop, 8, clBottom - clTop, wood(ctx, "vert"));
      }
      dimension(ctx, left, clBottom, right, clBottom, fmt(L("span", 6000)), BLACK, 40);
      infoLines(ctx, [
        `${count} Boards with battens over joints`,
        [`Batten Centres ${n(Math.max(0, values.gap || 0) + Math.max(0, values.memberWidth || 0))}`, RED],
      ], width / 2, top + 4);
    } else {
      const rows = Math.max(3, Math.min(26, Math.round(values.rows || 10)));
      const clTop = top + 60, clBottom = bottom - 56;
      const cover = (clBottom - clTop) / rows;
      for (let i = 0; i < rows; i++) {
        const y = clTop + i * cover;
        plate(ctx, left, y, w, cover + 6, timber, BLACK);
        hairline(ctx, left, y + cover + 6, right, y + cover + 6, "#9a805c");
      }
      const wallH = values.height || 2700;
      dimension(ctx, right, clTop, right, clBottom, fmt(wallH), BLACK, -Math.min(38, width - right - 16));
      dimension(ctx, left, clTop + cover, left, clTop + cover * 2, n(wallH / rows), RED, Math.min(34, left - 16));
      infoLines(ctx, [
        `${rows} Courses - lap over course below`,
        [`Actual Cover ${n(wallH / rows)}`, RED],
      ], width / 2, top + 4);
    }
  } else if (kind === "rebarplan") {
    // slab plan with the bar grid set out to centres
    const count = Math.max(2, Math.min(30, Math.round(values.count || 8)));
    const span = L("span", 3600);
    const both = values.both !== 0;
    const stockW = Math.max(0, values.memberWidth || 12);
    const clearGap = Math.max(0, values.gap || 0);
    const centres = stockW + clearGap;
    const first = clearGap + stockW / 2;
    const slabTop = top + 56, slabBottom = bottom - 62;
    const sc = w / span;
    plate(ctx, left, slabTop, w, slabBottom - slabTop, PALE, BLACK);
    const bars: number[] = [];
    for (let i = 0; i < count; i++) {
      const mx = left + (first + i * centres) * sc;
      if (mx < left + 4 || mx > right - 4) continue;
      bars.push(mx);
      strokeLine(ctx, mx, slabTop + 8, mx, slabBottom - 8, BLACK, 2);
      if (i < 22) setOutMark(ctx, n(first + i * centres), mx - 3, slabBottom - 18);
    }
    if (both) {
      const rowsN = Math.max(2, Math.min(12, Math.floor((slabBottom - slabTop) / Math.max(centres * sc, 14))));
      for (let r = 0; r < rowsN; r++) {
        const y = slabTop + 14 + r * (slabBottom - slabTop - 28) / Math.max(rowsN - 1, 1);
        strokeLine(ctx, left + 8, y, right - 8, y, BLACK, 2);
      }
    }
    if (bars.length > 1) dimension(ctx, bars[0], slabTop + 22, bars[1], slabTop + 22, n(centres), RED, 0);
    dimension(ctx, left, slabBottom, right, slabBottom, fmt(span), BLACK, 40);
    infoLines(ctx, [
      `${count} Bars @ ${n(centres)} crs`,
      both ? "Both ways over the slab" : "Single direction set-out",
    ], width / 2, top + 4);
  } else if (kind === "kerf") {
    // kerf-cut board in section, with the bend zone hinted
    const count = Math.max(2, Math.min(40, Math.round(values.count || 8)));
    const span = L("span", 3600);
    const stockW = Math.max(0, values.memberWidth || 3);
    const clearGap = Math.max(0, values.gap || 0);
    const centres = stockW + clearGap;
    const first = clearGap + stockW / 2;
    const boardY = top + h * 0.42, boardH = Math.max(34, h * 0.18);
    const sc = w / span;
    plate(ctx, left, boardY, w, boardH, timber, BLACK);
    const cuts: number[] = [];
    for (let i = 0; i < count; i++) {
      const mx = left + (first + i * centres) * sc;
      if (mx < left + 3 || mx > right - 3) continue;
      cuts.push(mx);
      ctx.fillStyle = WHITE;
      ctx.fillRect(mx - 1.5, boardY, 3, boardH * 0.78);
      strokeLine(ctx, mx - 1.5, boardY, mx - 1.5, boardY + boardH * 0.78, BLACK, HAIR);
      strokeLine(ctx, mx + 1.5, boardY, mx + 1.5, boardY + boardH * 0.78, BLACK, HAIR);
    }
    if (cuts.length > 1) dimension(ctx, cuts[0], boardY - 4, cuts[1], boardY - 4, n(centres), RED, -18);
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = SILVER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(right - 10, boardY - 60, 78, Math.PI * 0.5, Math.PI * 0.94);
    ctx.stroke();
    ctx.restore();
    note(ctx, "Bend zone", right - 96, boardY - 88, GREY, "center", 11);
    dimension(ctx, left, boardY + boardH, right, boardY + boardH, fmt(span), BLACK, 40);
    infoLines(ctx, [
      `${count} Kerfs @ ${n(centres)} crs`,
      "Web remaining under each cut",
    ], width / 2, top + 4);
  } else if (kind === "shelfbay") {
    // cabinet side elevation: the spacing span runs vertically as shelf heights
    const count = Math.max(1, Math.min(20, Math.round(values.count || 5)));
    const span = L("span", 2000);
    const stockW = Math.max(0, values.memberWidth || 18);
    const clearGap = Math.max(0, values.gap || 0);
    const centres = stockW + clearGap;
    const first = clearGap + stockW / 2;
    const bayLeft = left + w * 0.2, bayRight = right - w * 0.2;
    const bayTop = top + 58, bayBottom = bottom - 54;
    const sc = (bayBottom - bayTop) / span;
    plate(ctx, bayLeft - 15, bayTop - 10, 15, bayBottom - bayTop + 20, wood(ctx, "vert"));
    plate(ctx, bayRight, bayTop - 10, 15, bayBottom - bayTop + 20, wood(ctx, "vert"));
    plate(ctx, bayLeft - 15, bayTop - 10, bayRight - bayLeft + 30, 11, timber);
    plate(ctx, bayLeft - 15, bayBottom, bayRight - bayLeft + 30, 11, timber);
    for (let i = 0; i < count; i++) {
      const my = bayBottom - (first + i * centres) * sc;
      if (my < bayTop + 6 || my > bayBottom - 6) continue;
      const sh = Math.max(7, Math.min(14, stockW * sc));
      plate(ctx, bayLeft, my - sh / 2, bayRight - bayLeft, sh, timber);
      note(ctx, n(first + i * centres), bayLeft - 22, my, BLUE, "right", 11);
    }
    dimension(ctx, bayRight + 15, bayTop, bayRight + 15, bayBottom, fmt(span), BLACK, -Math.min(44, width - bayRight - 32));
    infoLines(ctx, [
      `${count} Shelves - Clear Opening ${n(clearGap)}`,
      [`Openings measured over ${fmt(span)} ${unit}`, GREY],
    ], width / 2, top + 4);
  } else if (kind === "protractorface") {
    // printable half protractor with true degree ticks
    const increment = Math.max(1, Math.min(30, Math.round(values.tick || values.count || 5)));
    const cx = left + w / 2, cy = bottom - 64;
    const R = Math.min(w * 0.44, h - 130);
    strokeLine(ctx, cx - R - 18, cy, cx + R + 18, cy, BLACK, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, Math.PI * 2);
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.6, Math.PI, Math.PI * 2);
    ctx.strokeStyle = SILVER;
    ctx.lineWidth = HAIR;
    ctx.stroke();
    for (let deg = 0; deg <= 180; deg += increment) {
      const a = Math.PI + radians(deg);
      const len = deg % 30 === 0 ? 16 : deg % 10 === 0 ? 11 : 6;
      strokeLine(ctx, cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len),
                 cx + Math.cos(a) * R, cy + Math.sin(a) * R, BLACK, deg % 30 === 0 ? 1 : HAIR);
      if (deg % 30 === 0) {
        note(ctx, String(deg), cx + Math.cos(a) * (R - 30), cy + Math.sin(a) * (R - 30), BLACK, "center", 11);
      }
    }
    centerMark(ctx, cx, cy);
    dimension(ctx, cx - R, cy, cx + R, cy, `Ø ${fmt(values.diameter || 1200)} ${unit}`, BLACK, 40);
    infoLines(ctx, [
      `Ticks every ${increment}° - majors at 30°`,
    ], left, top + 4, "left");
  } else if (kind === "ovalplan") {
    // true ellipse with axes and foci, string-line construction shown
    const major = L("diameter", 1600) / 2;
    const minor = Math.max(1, (values.minor || 1000) / 2);
    const sc = Math.min(w * 0.42 / major, h * 0.34 / minor);
    const ea = major * sc, eb = minor * sc;
    const cx = left + w / 2, cy = top + h * 0.46;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ea, eb, 0, 0, Math.PI * 2);
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 1;
    ctx.stroke();
    hairline(ctx, cx - ea - 14, cy, cx + ea + 14, cy);
    hairline(ctx, cx, cy - eb - 14, cx, cy + eb + 14);
    const c = Math.sqrt(Math.max(0, major * major - minor * minor)) * sc;
    hairline(ctx, cx - c, cy, cx, cy - eb);
    hairline(ctx, cx + c, cy, cx, cy - eb);
    centerMark(ctx, cx - c, cy, "F1");
    centerMark(ctx, cx + c, cy, "F2");
    centerMark(ctx, cx, cy);
    dimension(ctx, cx - ea, cy + eb, cx + ea, cy + eb, fmt(values.diameter || 1600), BLACK, 44);
    dimension(ctx, cx + ea, cy - eb, cx + ea, cy + eb, fmt(values.minor || 1000), BLACK, -Math.min(44, width - (cx + ea) - 16));
    infoLines(ctx, [
      "Pin the string at F1 and F2",
      `Foci ${fmt(c / sc)} ${unit} from centre`,
    ], left, top + 4, "left");
  } else if (kind === "paving") {
    // circular paving: rings of pavers with a laid sector shown
    const cx = left + w / 2, cy = top + h * 0.52;
    const R = Math.min(w * 0.4, h * 0.4);
    const rings = 5;
    const spokes = Math.max(10, Math.min(48, Math.round(values.count || 24)));
    for (let ring = 1; ring <= rings; ring++) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * ring / rings, 0, Math.PI * 2);
      ctx.strokeStyle = ring === rings ? BLACK : SILVER;
      ctx.lineWidth = ring === rings ? 1 : HAIR;
      ctx.stroke();
    }
    for (let i = 0; i < spokes; i++) {
      const a = i * Math.PI * 2 / spokes;
      if (a > Math.PI * 0.16 && a < Math.PI * 0.5) {
        for (let ring = 1; ring < rings; ring++) {
          const r0 = R * ring / rings, r1 = R * (ring + 1) / rings;
          const a1 = (i + 1) * Math.PI * 2 / spokes;
          ctx.beginPath();
          ctx.arc(cx, cy, r1, a, a1);
          ctx.arc(cx, cy, r0, a1, a, true);
          ctx.closePath();
          ctx.fillStyle = (i + ring) % 2 ? FILL : PALE;
          ctx.fill();
          ctx.strokeStyle = SILVER;
          ctx.lineWidth = HAIR;
          ctx.stroke();
        }
      }
      strokeLine(ctx, cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2,
                 cx + Math.cos(a) * R, cy + Math.sin(a) * R, SILVER, HAIR);
    }
    centerMark(ctx, cx, cy);
    dimension(ctx, cx - R, cy, cx + R, cy, `Ø ${fmt(values.diameter || 5000)} ${unit}`, BLACK, R * 0.62 + 44);
    infoLines(ctx, [
      `${rings} Rings - laid sector shown`,
      `${n(values.count || 24, 0)} Pavers on the outer ring`,
    ], left, top + 4, "left");
  } else if (kind === "postholes") {
    // post hole run in plan, with one hole in section beside it
    const count = Math.max(2, Math.min(12, Math.round(values.count || 6)));
    const spacing = L("spacing", 1800);
    const runSpan = (count - 1) * spacing;
    const lineY = top + h * 0.36;
    const planLeft = left + 18, planRight = right - w * 0.24;
    const sc = (planRight - planLeft) / Math.max(runSpan, 1e-6);
    hairline(ctx, planLeft - 12, lineY, planRight + 12, lineY);
    const holeR = Math.max(9, Math.min(20, (values.diameter || 300) * sc / 2));
    for (let i = 0; i < count; i++) {
      const mx = planLeft + i * spacing * sc;
      ctx.beginPath();
      ctx.arc(mx, lineY, holeR, 0, Math.PI * 2);
      ctx.fillStyle = PALE;
      ctx.fill();
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = 1;
      ctx.stroke();
      centerMark(ctx, mx, lineY);
      if (i < 14) setOutMark(ctx, n(i * spacing), mx - 3, lineY + holeR + 58);
    }
    dimension(ctx, planLeft, lineY, planLeft + spacing * sc, lineY, n(spacing), RED, -holeR - 18);
    dimension(ctx, planLeft, lineY + holeR + 66, planRight, lineY + holeR + 66, fmt(runSpan), BLACK, 24);
    const secX = right - w * 0.13, secW = Math.min(84, w * 0.16);
    const secTop = lineY - 30, secH = Math.min(120, h * 0.34);
    hairline(ctx, secX - secW, secTop, secX + secW, secTop);
    plate(ctx, secX - secW / 2, secTop, secW, secH, concrete(ctx));
    plate(ctx, secX - 7, secTop - 26, 14, secH * 0.7, wood(ctx, "vert"));
    note(ctx, `↕ ${n(values.depth || 600)}`, secX + secW / 2 + 6, secTop + secH / 2, BLACK, "left", 11);
    note(ctx, "Section", secX, secTop + secH + 16, GREY, "center", 11);
    infoLines(ctx, [
      `${count} Holes Ø ${n(values.diameter || 300)} - Depth ${n(values.depth || 600)}`,
    ], left, top + 4, "left");
  } else if (kind === "scale") {
    const x = left + 6;
    const y = top + h * .46;
    const barW = w - 12;
    strokeLine(ctx, x, y, x + barW, y, BLACK, 1);
    for (let i = 0; i <= 20; i++) {
      const px = x + i / 20 * barW;
      const tick = i % 5 === 0 ? 30 : i % 2 === 0 ? 19 : 11;
      strokeLine(ctx, px, y - tick / 2, px, y + tick / 2, BLACK, i % 5 === 0 ? 1 : HAIR);
      if (i % 5 === 0) note(ctx, n(i * (values.value || values.known || 1) / 20, 3), px, y + 30, BLACK, "center", 11);
    }
    dimension(ctx, x, y - 52, x + barW, y - 52, `${n(values.value || values.known || 1, 4)} ${unit}`, BLACK, 0);
    infoLines(ctx, ["Reference scale - live conversion"], width / 2, top + 4);
  } else {
    // right triangle: run, rise, hypotenuse
    const run = values.run || values.width || values.length || 3000;
    const rise = values.rise || values.height || 2000;
    const scale = Math.min(w * .8 / safe(run), h * .74 / safe(rise));
    const bx = left + 20 + run * scale;
    const by = bottom - 34;
    const a = { x: left + 20, y: by };
    const b = { x: bx, y: by };
    const c = { x: bx, y: by - rise * scale };
    shape(ctx, [a, b, c], FILL, BLACK, 1);
    // square the right angle
    strokeLine(ctx, bx - 13, by, bx - 13, by - 13, BLACK, HAIR);
    strokeLine(ctx, bx - 13, by - 13, bx, by - 13, BLACK, HAIR);
    dimension(ctx, a.x, a.y, b.x, b.y, fmt(run), BLACK, 40);
    dimension(ctx, b.x, b.y, c.x, c.y, fmt(rise), BLACK, 40);   // outside the vertical leg
    dimension(ctx, a.x, a.y, c.x, c.y, fmt(Math.hypot(run, rise)), BLACK, -22);
    angleArc(ctx, a.x, a.y, 44, -Math.atan2(rise * scale, run * scale), 0, `${n(Math.atan2(rise, run) * 180 / Math.PI)}°`);
    infoLines(ctx, [
      `Slope Length ${fmt(Math.hypot(run, rise))} ${unit}`,
      `Grade ${n(rise / safe(run) * 100)}%`,
    ], left, top + 4, "left");
  }
}
