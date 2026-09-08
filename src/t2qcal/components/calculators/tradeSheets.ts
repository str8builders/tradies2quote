/*
 * The per-calculator sheets.
 *
 * These are the second and third drawings each calculator carries. They used to
 * fall through to one shared scale bar, which meant fifty-odd calculators drew
 * the same picture the moment you tabbed off the first sheet. Every kind here
 * draws its own subject instead, and mirrors the Swift engine branch for branch
 * so the app and the site show the same sheet.
 *
 * Conventions follow the rest of the engine: white sheet, no border, silver
 * construction lines, dimensions as arrow glyphs on a rotated label.
 */

import {
  BLACK, RED, GREEN, SILVER, GREY, FILL, PALE, FACE_DARK, FACE_LIT, WHITE, HAIR,
  type DiagramKind,
  angleArc, centerMark, concrete, dimension, hairline, hatch, infoLines, member,
  note, plate, setOutMark, shape, strokeLine, wood,
} from "./technicalDrawing";

export type SheetGeom = {
  ctx: CanvasRenderingContext2D;
  width: number; height: number;
  left: number; right: number; top: number; bottom: number;
  w: number; h: number;
  unit: string;
  values: Record<string, number>;
};

const rad = (degrees: number) => degrees * Math.PI / 180;
const deg = (radians: number) => radians * 180 / Math.PI;
const safe = (value: number, fallback = 1) => (Number.isFinite(value) && value > 0 ? value : fallback);

function num(value: number, digits = 2) {
  return new Intl.NumberFormat("en-NZ", { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);
}

/** First key holding a usable figure; zero counts as absent. */
function pick(values: Record<string, number>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = values[key];
    if (Number.isFinite(value) && value !== 0) return value;
  }
  return fallback;
}

function timberPlate(g: SheetGeom, x: number, y: number, w: number, h: number, vertical = false, outline: string | null = BLACK) {
  shape(g.ctx, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
    wood(g.ctx, vertical ? "vert" : "horiz"), outline ?? "", 1);
}

function ring(g: SheetGeom, cx: number, cy: number, r: number, fill: string, outline = BLACK) {
  const { ctx } = g;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(r, 0.1), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(r, 0.1), 0, Math.PI * 2);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** A member swept along its axis in plain material — steel and tube are not sawn timber. */
function steelMember(g: SheetGeom, x1: number, y1: number, x2: number, y2: number, depth: number, fill = FILL) {
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.max(Math.hypot(dx, dy), 0.001);
  const nx = -dy / length * depth / 2, ny = dx / length * depth / 2;
  shape(g.ctx, [
    { x: x1 + nx, y: y1 + ny }, { x: x2 + nx, y: y2 + ny },
    { x: x2 - nx, y: y2 - ny }, { x: x1 - nx, y: y1 - ny },
  ], fill, BLACK, 1);
}

/** The balanced set-out the spacing family shares, resolved once. */
function setOut(g: SheetGeom) {
  const count = Math.max(1, Math.min(500, Math.round(pick(g.values, ["count"], 8))));
  const span = safe(g.values.span, 3600);
  const stock = Math.max(0, pick(g.values, ["memberWidth"], 45));
  const gap = Math.max(0, g.values.gap || 0);
  return { count, span, stock, gap, centres: stock + gap, first: gap + stock / 2 };
}

/**
 * Marks the stock the way blocklayer prints a stringer template: the member laid
 * flat with a leader and a running figure at every position.
 */
function markedStock(g: SheetGeom, x: number, y: number, w: number, h: number, marks: number[], label: string) {
  timberPlate(g, x, y, w, h);
  const sc = w / safe(setOut(g).span);
  let last = -1e9;
  for (const mark of marks) {
    const mx = x + mark * sc;
    if (mx < x - 1 || mx > x + w + 1) continue;
    strokeLine(g.ctx, mx, y, mx, y + h, RED, HAIR);
    // crowd control: only print a figure when it has clear air beside it
    if (mx - last > 26) {
      hairline(g.ctx, mx, y, mx, y - 12);
      setOutMark(g.ctx, num(mark), mx - 3, y - 16);
      last = mx;
    }
  }
  note(g.ctx, label, x, y + h + 16, GREY, "left", 11);
}

// MARK: - Spacing details

function railSection(g: SheetGeom) {
  const s = setOut(g);
  const sc = g.w / safe(s.span);
  const railY = g.top + g.h * 0.30;
  const railD = Math.max(30, Math.min(60, g.h * 0.17));
  timberPlate(g, g.left, railY, g.w, railD);
  const firstTwo: number[] = [];
  for (let i = 0; i < s.count; i++) {
    const mx = g.left + (s.first + i * s.centres) * sc;
    const bw = Math.max(4, s.stock * sc);
    if (mx - bw / 2 < g.left || mx + bw / 2 > g.right) continue;
    if (firstTwo.length < 2) firstTwo.push(mx);
    plate(g.ctx, mx - bw / 2, railY + 5, bw, railD - 10, FACE_DARK);
    hatch(g.ctx, mx - bw / 2, railY + 5, bw, railD - 10, 5);
  }
  if (firstTwo.length === 2) {
    dimension(g.ctx, firstTwo[0], railY + railD, firstTwo[1], railY + railD, num(s.centres), RED, 30);
    dimension(g.ctx, firstTwo[0] + s.stock * sc / 2, railY, firstTwo[1] - s.stock * sc / 2, railY, num(s.gap), GREEN, -26);
  }
  dimension(g.ctx, g.left, railY + railD, g.right, railY + railD, num(s.span), BLACK, 66);
  infoLines(g.ctx, ["Section through the rail - balusters cut",
    [`A ${num(s.gap)} gap passes no 100 sphere`, GREEN]], g.width / 2, g.top + 4);
}

function plateMark(g: SheetGeom) {
  const s = setOut(g);
  const marks = Array.from({ length: s.count }, (_, i) => s.first + i * s.centres);
  const stripH = Math.max(16, Math.min(26, g.h * 0.09));
  const topY = g.top + g.h * 0.30, botY = g.top + g.h * 0.62;
  markedStock(g, g.left, topY, g.w, stripH, marks, "Top plate - mark stud centres");
  markedStock(g, g.left, botY, g.w, stripH, marks, "Bottom plate - transfer the same marks");
  dimension(g.ctx, g.left, botY + stripH, g.right, botY + stripH, num(s.span), BLACK, 40);
  infoLines(g.ctx, ["Plates cramped together and marked as a pair",
    [`${s.count} studs @ ${num(s.centres)} centres`, RED]], g.width / 2, g.top + 4);
}

function markPlate(g: SheetGeom) {
  const s = setOut(g);
  const marks = Array.from({ length: s.count }, (_, i) => s.first + i * s.centres);
  const stripH = Math.max(24, Math.min(44, g.h * 0.16));
  const y = g.top + g.h * 0.40;
  markedStock(g, g.left, y, g.w, stripH, marks, "Hook the tape at zero and mark every figure");
  dimension(g.ctx, g.left, y + stripH, g.right, y + stripH, num(s.span), BLACK, 44);
  infoLines(g.ctx, [`Mark-out stick - ${s.count} positions`,
    [`Centres ${num(s.centres)} - end margin ${num(s.gap)}`, RED]], g.width / 2, g.top + 4);
}

function battenSection(g: SheetGeom) {
  const s = setOut(g);
  const sc = g.w / safe(s.span);
  const y = g.top + g.h * 0.34;
  const boardD = Math.max(14, Math.min(24, g.h * 0.08));
  timberPlate(g, g.left, y, g.w, boardD);
  const firstTwo: number[] = [];
  for (let i = 0; i < s.count; i++) {
    const mx = g.left + (s.first + i * s.centres) * sc;
    const bw = Math.max(6, s.stock * sc);
    if (mx - bw / 2 < g.left || mx + bw / 2 > g.right) continue;
    if (firstTwo.length < 2) firstTwo.push(mx);
    timberPlate(g, mx - bw / 2, y - boardD * 0.9, bw, boardD * 0.9);
  }
  plate(g.ctx, g.left, y + boardD, g.w, 9, PALE, SILVER);
  note(g.ctx, "Framing behind", g.right, y + boardD + 22, GREY, "right", 11);
  if (firstTwo.length === 2) {
    dimension(g.ctx, firstTwo[0], y - boardD * 0.9, firstTwo[1], y - boardD * 0.9, num(s.centres), RED, -26);
  }
  dimension(g.ctx, g.left, y + boardD + 9, g.right, y + boardD + 9, num(s.span), BLACK, 40);
  infoLines(g.ctx, ["Battens cover every board joint",
    [`${s.count} battens @ ${num(s.centres)} crs`, RED]], g.width / 2, g.top + 4);
}

function glassPanel(g: SheetGeom) {
  const s = setOut(g);
  const sc = g.w / safe(s.span);
  const glassTop = g.top + 70, glassBottom = g.bottom - 74;
  for (let i = 0; i < s.count; i++) {
    const mx = g.left + (s.first + i * s.centres) * sc;
    const pw = Math.max(12, s.stock * sc);
    if (mx - pw / 2 < g.left || mx + pw / 2 > g.right) continue;
    plate(g.ctx, mx - pw / 2, glassTop, pw, glassBottom - glassTop, PALE, GREY);
    // the sheen that reads as glass rather than a blank board
    strokeLine(g.ctx, mx - pw / 2 + 6, glassBottom - 8, mx + pw / 2 - 8, glassTop + 10, WHITE, 3);
    for (const side of [mx - pw / 2 + pw * 0.22, mx + pw / 2 - pw * 0.22]) {
      plate(g.ctx, side - 7, glassBottom - 6, 14, 22, FACE_DARK);
    }
    if (i < 20) setOutMark(g.ctx, num(s.first + i * s.centres), mx - 3, glassBottom - 26);
  }
  plate(g.ctx, g.left, glassBottom + 16, g.w, 12, FILL);
  dimension(g.ctx, g.left, glassBottom + 28, g.right, glassBottom + 28, num(s.span), BLACK, 30);
  dimension(g.ctx, g.right, glassTop, g.right, glassBottom, num(pick(g.values, ["height"], 1000)), BLACK,
    -Math.min(38, g.width - g.right - 16));
  infoLines(g.ctx, [`${s.count} glass panels on spigots`,
    [`Panel ${num(s.stock)} wide - gap ${num(s.gap)}`, RED]], g.width / 2, g.top + 4);
}

function glassPlan(g: SheetGeom) {
  const s = setOut(g);
  const sc = g.w / safe(s.span);
  const y = g.top + g.h * 0.42;
  const firstTwo: number[] = [];
  for (let i = 0; i < s.count; i++) {
    const mx = g.left + (s.first + i * s.centres) * sc;
    const pw = Math.max(8, s.stock * sc);
    if (mx - pw / 2 < g.left || mx + pw / 2 > g.right) continue;
    if (firstTwo.length < 2) firstTwo.push(mx);
    plate(g.ctx, mx - pw / 2, y, pw, 11, FACE_DARK);
    plate(g.ctx, mx - pw / 2 + pw * 0.2, y - 9, 16, 29, PALE, GREY);
  }
  if (firstTwo.length === 2) {
    dimension(g.ctx, firstTwo[0], y + 11, firstTwo[1], y + 11, num(s.centres), RED, 34);
  }
  dimension(g.ctx, g.left, y - 9, g.right, y - 9, num(s.span), BLACK, -40);
  infoLines(g.ctx, ["Plan on the spigots",
    [`Clear gap between panels ${num(s.gap)}`, GREEN]], g.width / 2, g.top + 4);
}

function wainscotElevation(g: SheetGeom) {
  const s = setOut(g);
  const sc = g.w / safe(s.span);
  const capY = g.top + 62, baseY = g.bottom - 66;
  const stileW = Math.max(8, s.stock * sc);
  plate(g.ctx, g.left, capY - 12, g.w, 12, FACE_DARK);
  timberPlate(g, g.left, capY, g.w, 14);
  timberPlate(g, g.left, baseY - 18, g.w, 18);
  const edges: number[] = [g.left];
  for (let i = 0; i < s.count; i++) {
    const mx = g.left + (s.first + i * s.centres) * sc;
    if (mx - stileW / 2 < g.left || mx + stileW / 2 > g.right) continue;
    edges.push(mx);
  }
  edges.push(g.right);
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i] + (i === 0 ? 0 : stileW / 2);
    const b = edges[i + 1] - (i === edges.length - 2 ? 0 : stileW / 2);
    if (b - a <= 8) continue;
    plate(g.ctx, a + 4, capY + 20, b - a - 8, baseY - capY - 44, PALE, SILVER);
    plate(g.ctx, a + 11, capY + 27, b - a - 22, baseY - capY - 58, WHITE, SILVER);
  }
  for (const mx of edges.slice(1, -1)) {
    timberPlate(g, mx - stileW / 2, capY + 14, stileW, baseY - capY - 32, true);
  }
  dimension(g.ctx, g.left, baseY, g.right, baseY, num(s.span), BLACK, 40);
  infoLines(g.ctx, [`${s.count} stiles - ${edges.length - 1} panels`,
    [`Panel opening ${num(s.gap)}`, RED]], g.width / 2, g.top + 4);
}

function wainscotSection(g: SheetGeom) {
  const s = setOut(g);
  const hgt = pick(g.values, ["height"], 1000);
  const x = g.left + g.w * 0.34;
  const secTop = g.top + 60, secBottom = g.bottom - 60;
  plate(g.ctx, x + 46, secTop - 26, 16, secBottom - secTop + 46, PALE, SILVER);
  note(g.ctx, "Wall lining", x + 70, secTop - 14, GREY, "left", 11);
  // cap, rail, panel, skirting stacked down the wall
  timberPlate(g, x - 16, secTop, 62, 13);
  note(g.ctx, "Cap", x - 24, secTop + 8, BLACK, "right", 11);
  timberPlate(g, x + 4, secTop + 13, 42, 22);
  note(g.ctx, "Top rail", x - 24, secTop + 26, BLACK, "right", 11);
  plate(g.ctx, x + 16, secTop + 35, 30, secBottom - secTop - 88, PALE, SILVER);
  note(g.ctx, "Panel", x - 24, (secTop + secBottom) / 2, BLACK, "right", 11);
  timberPlate(g, x + 4, secBottom - 53, 42, 20);
  timberPlate(g, x - 8, secBottom - 33, 54, 33);
  note(g.ctx, "Skirting", x - 24, secBottom - 16, BLACK, "right", 11);
  dimension(g.ctx, x + 62, secTop, x + 62, secBottom, num(hgt), BLACK, -46);
  infoLines(g.ctx, ["Section through the wainscot",
    [`Height to cap ${num(hgt)} ${g.unit}`, RED],
    `Stile ${num(s.stock)} - panel ${num(s.gap)}`], g.right, g.top + 4, "right");
}

function shelfSection(g: SheetGeom) {
  const s = setOut(g);
  const bayTop = g.top + 60, bayBottom = g.bottom - 60;
  const sc = (bayBottom - bayTop) / safe(s.span);
  const x = g.left + g.w * 0.26;
  const depth = Math.max(80, g.w * 0.34);
  timberPlate(g, x - 17, bayTop - 10, 17, bayBottom - bayTop + 20, true);
  note(g.ctx, "Side", x - 26, bayTop + 14, GREY, "right", 11);
  const firstTwo: number[] = [];
  for (let i = 0; i < s.count; i++) {
    const my = bayTop + (s.first + i * s.centres) * sc;
    const th = Math.max(4, s.stock * sc);
    if (my < bayTop || my + th > bayBottom) continue;
    if (firstTwo.length < 2) firstTwo.push(my);
    timberPlate(g, x, my, depth, th);
    timberPlate(g, x, my + th, 22, Math.max(5, th * 0.7));
  }
  if (firstTwo.length === 2) {
    dimension(g.ctx, x + depth, firstTwo[0], x + depth, firstTwo[1], num(s.centres), RED, -30);
  }
  dimension(g.ctx, x - 17, bayTop, x - 17, bayBottom, num(s.span), BLACK, Math.min(40, x - 34));
  infoLines(g.ctx, [`${s.count} shelves on cleats`,
    [`Clear opening ${num(s.gap)} ${g.unit}`, GREEN]], g.width / 2, g.top + 4);
}

function openingDetail(g: SheetGeom) {
  const s = setOut(g);
  const hgt = pick(g.values, ["height"], 2400);
  const frTop = g.top + 56, frBottom = g.bottom - 58;
  const openW = Math.min(g.w * 0.52, Math.max(90, s.centres * 2 * g.w / safe(s.span)));
  const ox = g.left + (g.w - openW) / 2;
  const headY = frTop + (frBottom - frTop) * 0.42;
  timberPlate(g, g.left, frTop, g.w, 12);
  timberPlate(g, g.left, frBottom - 12, g.w, 12);
  timberPlate(g, ox - 22, headY, openW + 44, 26);
  note(g.ctx, "Lintel", ox + openW / 2, headY + 17, BLACK, "center", 11);
  for (const tx of [ox - 22, ox + openW]) {
    timberPlate(g, tx, headY + 26, 22, frBottom - headY - 38, true);
    timberPlate(g, tx - 16, frTop + 12, 16, frBottom - frTop - 24, true);
  }
  const cripples = Math.max(1, Math.round(openW / 60));
  for (let i = 0; i <= cripples; i++) {
    const cx = ox + i * openW / cripples;
    timberPlate(g, cx - 6, frTop + 12, 12, headY - frTop - 12, true);
  }
  note(g.ctx, "Cripples", ox + openW / 2, frTop + 30, GREY, "center", 11);
  dimension(g.ctx, ox, frBottom - 12, ox + openW, frBottom - 12, num(s.gap), RED, -20);
  dimension(g.ctx, ox, headY + 26, ox, frBottom - 12, num(hgt * 0.86), BLACK, -Math.min(40, ox - g.left - 30));
  dimension(g.ctx, g.left, frBottom, g.right, frBottom, num(s.span), BLACK, 40);
  infoLines(g.ctx, ["Trimmed opening - lintel on trimmer studs",
    [`Full studs each side stay on ${num(s.centres)} crs`, RED]], g.width / 2, g.top + 4);
}

function kerfBent(g: SheetGeom) {
  const s = setOut(g);
  const thickBand = 26;
  const radius = Math.max(50, Math.min(g.w / 2 - thickBand, g.h * 0.62));
  const cx = g.width / 2, cy = g.bottom - 30;
  const sweep = Math.min(Math.PI * 0.9, s.span / safe(radius * 2.2));
  const thick = Math.max(9, Math.min(20, g.h * 0.06));
  const start = -Math.PI / 2 - sweep / 2;
  const outer: { x: number; y: number }[] = [], inner: { x: number; y: number }[] = [];
  for (let i = 0; i <= 60; i++) {
    const a = start + sweep * i / 60;
    outer.push({ x: cx + Math.cos(a) * (radius + thick), y: cy + Math.sin(a) * (radius + thick) });
    inner.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  shape(g.ctx, [...outer, ...inner.reverse()], wood(g.ctx, "horiz"), BLACK, 1);
  for (let i = 0; i < Math.min(s.count, 60); i++) {
    const a = start + sweep * (i + 0.5) / Math.max(s.count, 1);
    strokeLine(g.ctx, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius,
      cx + Math.cos(a) * (radius + thick * 0.8), cy + Math.sin(a) * (radius + thick * 0.8), GREY, HAIR);
  }
  hairline(g.ctx, cx, cy, cx + Math.cos(start) * (radius + thick), cy + Math.sin(start) * (radius + thick));
  hairline(g.ctx, cx, cy, cx + Math.cos(start + sweep) * (radius + thick), cy + Math.sin(start + sweep) * (radius + thick));
  centerMark(g.ctx, cx, cy);
  note(g.ctx, `R ${num(radius / safe(g.w / s.span))}`, cx + 8, cy - radius / 2, RED, "left", 11);
  infoLines(g.ctx, ["Kerfs closed - board pulled to the curve",
    [`${s.count} kerfs @ ${num(s.centres)} crs`, RED]], g.width / 2, g.top + 4);
}

function barSection(g: SheetGeom) {
  const s = setOut(g);
  const sc = g.w / safe(s.span);
  const slabTop = g.top + g.h * 0.34;
  const slabD = Math.max(34, Math.min(72, g.h * 0.22));
  shape(g.ctx, [{ x: g.left, y: slabTop }, { x: g.right, y: slabTop },
    { x: g.right, y: slabTop + slabD }, { x: g.left, y: slabTop + slabD }], concrete(g.ctx), BLACK, 1);
  hatch(g.ctx, g.left, slabTop + slabD, g.w, Math.max(18, g.h * 0.12), 9);
  hairline(g.ctx, g.left, slabTop + slabD, g.right, slabTop + slabD, GREY);
  const firstTwo: number[] = [];
  const barY = slabTop + slabD * 0.62;
  for (let i = 0; i < s.count; i++) {
    const mx = g.left + (s.first + i * s.centres) * sc;
    if (mx < g.left + 3 || mx > g.right - 3) continue;
    if (firstTwo.length < 2) firstTwo.push(mx);
    g.ctx.beginPath();
    g.ctx.arc(mx, barY, 4, 0, Math.PI * 2);
    g.ctx.fillStyle = BLACK;
    g.ctx.fill();
  }
  strokeLine(g.ctx, g.left + 6, barY - 9, g.right - 6, barY - 9, BLACK, 3);
  if (firstTwo.length === 2) {
    dimension(g.ctx, firstTwo[0], barY, firstTwo[1], barY, num(s.centres), RED, -26);
  }
  dimension(g.ctx, g.left, barY, g.left, slabTop + slabD, num(slabD - slabD * 0.62), GREEN, Math.min(36, g.left - 14));
  note(g.ctx, "Cover", g.left + 10, slabTop + slabD + 16, GREEN, "left", 11);
  dimension(g.ctx, g.left, slabTop, g.right, slabTop, num(s.span), BLACK, -34);
  infoLines(g.ctx, ["Section through the slab",
    [`${s.count} bars @ ${num(s.centres)} crs, both ways`, RED]], g.width / 2, g.top + 4);
}

function barBend(g: SheetGeom) {
  const s = setOut(g);
  const bx = g.left + g.w * 0.30;
  const footTop = g.top + g.h * 0.52;
  const lap = Math.min(g.h * 0.36, Math.max(50, s.centres * 0.9));
  const leg = Math.min(g.w * 0.30, Math.max(60, s.centres * 1.4));
  const footH = Math.max(40, g.h * 0.26);
  shape(g.ctx, [{ x: g.left, y: footTop }, { x: g.right, y: footTop },
    { x: g.right, y: footTop + footH }, { x: g.left, y: footTop + footH }], concrete(g.ctx), BLACK, 1);
  strokeLine(g.ctx, bx, footTop - lap, bx, footTop + 30, BLACK, 4);
  strokeLine(g.ctx, bx, footTop + 30, bx + leg, footTop + 30, BLACK, 4);
  // the bend radius, drawn as the quarter it really is
  g.ctx.save();
  g.ctx.strokeStyle = RED;
  g.ctx.lineWidth = HAIR;
  g.ctx.beginPath();
  g.ctx.arc(bx + 16, footTop + 14, 16, Math.PI, Math.PI / 2, true);
  g.ctx.stroke();
  g.ctx.restore();
  note(g.ctx, "Bend", bx + 34, footTop + 12, RED, "left", 11);
  dimension(g.ctx, bx, footTop - lap, bx, footTop, num(s.centres * 0.9), GREEN, -34);
  note(g.ctx, "Lap into the wall over", bx + 14, footTop - lap - 10, GREEN, "left", 11);
  dimension(g.ctx, bx, footTop + 30, bx + leg, footTop + 30, num(s.centres * 1.4), BLACK, 34);
  infoLines(g.ctx, ["Starter bar - bending detail",
    [`${s.count} starters @ ${num(s.centres)} crs`, RED]], g.width / 2, g.top + 4);
}

function fastenerRow(g: SheetGeom) {
  const s = setOut(g);
  const sc = g.w / safe(s.span);
  const y = g.top + g.h * 0.36;
  const boardH = Math.max(30, Math.min(56, g.h * 0.18));
  timberPlate(g, g.left, y, g.w, boardH);
  const firstTwo: number[] = [];
  for (let i = 0; i < s.count; i++) {
    const mx = g.left + (s.first + i * s.centres) * sc;
    if (mx < g.left + 3 || mx > g.right - 3) continue;
    if (firstTwo.length < 2) firstTwo.push(mx);
    // countersunk head, seen on the face
    g.ctx.beginPath();
    g.ctx.arc(mx, y + boardH / 2, 5, 0, Math.PI * 2);
    g.ctx.fillStyle = FACE_DARK;
    g.ctx.fill();
    g.ctx.beginPath();
    g.ctx.arc(mx, y + boardH / 2, 5, 0, Math.PI * 2);
    g.ctx.strokeStyle = BLACK;
    g.ctx.lineWidth = HAIR;
    g.ctx.stroke();
    strokeLine(g.ctx, mx - 3.5, y + boardH / 2, mx + 3.5, y + boardH / 2, BLACK, HAIR);
  }
  if (firstTwo.length === 2) {
    dimension(g.ctx, firstTwo[0], y, firstTwo[1], y, num(s.centres), RED, -24);
  }
  if (firstTwo.length) {
    dimension(g.ctx, g.left, y + boardH, firstTwo[0], y + boardH, num(s.first), GREEN, 22);
  }
  dimension(g.ctx, g.left, y + boardH, g.right, y + boardH, num(s.span), BLACK, 48);
  infoLines(g.ctx, [`${s.count} fixings on the run`,
    [`Centres ${num(s.centres)} - end margin ${num(s.first)}`, RED]], g.width / 2, g.top + 4);
}

function fastenerDetail(g: SheetGeom) {
  const s = setOut(g);
  const cx = g.width / 2, cy = g.top + g.h * 0.52;
  const boardW = Math.min(g.w * 0.66, 320), boardH = Math.min(g.h * 0.5, 190);
  const x0 = cx - boardW / 2, y0 = cy - boardH / 2;
  timberPlate(g, x0, y0, boardW, boardH);
  const px = x0 + boardW * 0.34, py = y0 + boardH * 0.42;
  g.ctx.beginPath();
  g.ctx.arc(px, py, 9, 0, Math.PI * 2);
  g.ctx.fillStyle = FACE_DARK;
  g.ctx.fill();
  g.ctx.beginPath();
  g.ctx.arc(px, py, 9, 0, Math.PI * 2);
  g.ctx.strokeStyle = BLACK;
  g.ctx.lineWidth = 1;
  g.ctx.stroke();
  strokeLine(g.ctx, px - 6, py, px + 6, py, BLACK, 1);
  hairline(g.ctx, x0, py, px, py);
  hairline(g.ctx, px, y0, px, py);
  dimension(g.ctx, x0, py, px, py, num(s.first), GREEN, -18);
  dimension(g.ctx, px, y0, px, py, num(s.stock * 1.5 + 8), GREEN, 20);
  dimension(g.ctx, x0, y0 + boardH, x0 + boardW, y0 + boardH, num(s.centres), BLACK, 30);
  infoLines(g.ctx, ["End and edge distance",
    ["Keep the fixing clear of the ends to stop splitting", GREY]], g.width / 2, g.top + 4);
}

// MARK: - Stairs details

function stringerMark(g: SheetGeom) {
  const risers = Math.max(2, Math.min(40, Math.round(pick(g.values, ["risers", "count"], 14))));
  const rise = pick(g.values, ["rise"], 175);
  const run = pick(g.values, ["run"], 250);
  const totalRun = pick(g.values, ["totalRun"], (risers - 1) * run);
  const depth = pick(g.values, ["thickness", "width"], 300);
  const slope = Math.hypot(totalRun, pick(g.values, ["totalRise"], risers * rise));
  const sc = Math.min(g.w / safe(slope), g.h * 0.34 / safe(depth));
  const boardH = Math.max(46, depth * sc);
  const y = g.top + g.h * 0.40;
  const x = g.left + (g.w - slope * sc) / 2;
  timberPlate(g, x, y, slope * sc, boardH);
  // the sawtooth, stepped along the board at the true slope pitch
  const step = slope * sc / Math.max(risers, 1);
  const cut = Math.min(boardH * 0.62, step * 0.8);
  const path: { x: number; y: number }[] = [{ x, y: y + cut }];
  for (let i = 0; i < risers; i++) {
    const px = x + i * step;
    path.push({ x: px + step * 0.62, y: y + cut }, { x: px + step * 0.62, y },
      { x: px + step, y }, { x: px + step, y: y + cut });
  }
  for (let i = 0; i < path.length - 1; i++) {
    strokeLine(g.ctx, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y, WHITE, 1.4);
  }
  let last = -1e9;
  for (let i = 0; i < risers; i++) {
    const px = x + (i + 1) * step;
    const along = (i + 1) * slope / Math.max(risers, 1);
    if (px - last > 30 && px < x + slope * sc - 6) {
      hairline(g.ctx, px, y, px, y - 12);
      setOutMark(g.ctx, num(along), px - 3, y - 16);
      last = px;
    }
  }
  dimension(g.ctx, x, y, x + slope * sc, y, num(slope), BLACK, -40);
  dimension(g.ctx, x, y, x, y + boardH, num(depth), BLACK, Math.min(34, x - g.left + 20));
  infoLines(g.ctx, [`Stringer marking template - ${risers} rises`,
    [`Rise ${num(rise)} - run ${num(run)} on the square`, RED]], g.width / 2, g.top + 4);
}

function spineDetail(g: SheetGeom) {
  const rise = pick(g.values, ["rise"], 175);
  const going = pick(g.values, ["run"], 270);
  const angle = rad(pick(g.values, ["angle"], 33));
  const cx = g.left + g.w * 0.22, cy = g.top + g.h * 0.66;
  const len = Math.min(g.w * 0.62, 340);
  const bx = cx + Math.cos(-angle) * len, by = cy + Math.sin(-angle) * len;
  steelMember(g, cx, cy, bx, by, 26, FACE_DARK);
  const mx = (cx + bx) / 2, my = (cy + by) / 2;
  plate(g.ctx, mx - 7, my - 46, 14, 46, FACE_DARK);
  plate(g.ctx, mx - 52, my - 58, 104, 12, FILL);
  timberPlate(g, mx - 62, my - 74, 124, 16);
  note(g.ctx, "Tread", mx + 70, my - 66, BLACK, "left", 11);
  note(g.ctx, "Bracket welded to spine", mx + 16, my - 26, GREY, "left", 11);
  dimension(g.ctx, mx - 62, my - 74, mx + 62, my - 74, num(going), BLACK, -22);
  dimension(g.ctx, mx + 62, my - 74, mx + 62, my - 74 + rise * 0.3 + 40, num(rise), RED, -26);
  angleArc(g.ctx, cx, cy, 54, -angle, 0, `${num(deg(angle))}°`);
  infoLines(g.ctx, ["Spine and bracket detail",
    [`Brackets pitched at ${num(deg(angle))}°`, RED]], g.width / 2, g.top + 4);
}

function rampPlan(g: SheetGeom) {
  const run = pick(g.values, ["run"], 6300);
  const rampW = Math.max(1000, run * 0.18);
  const total = run + rampW * 2;
  const sc = Math.min(g.w / safe(total), g.h * 0.5 / safe(rampW));
  const y = g.top + g.h * 0.36;
  const bandH = Math.max(50, rampW * sc);
  const x = g.left + (g.w - total * sc) / 2;
  plate(g.ctx, x, y, rampW * sc, bandH, PALE);
  note(g.ctx, "Landing", x + rampW * sc / 2, y + bandH / 2, GREY, "center", 11);
  plate(g.ctx, x + rampW * sc, y, run * sc, bandH, FILL);
  plate(g.ctx, x + (rampW + run) * sc, y, rampW * sc, bandH, PALE);
  note(g.ctx, "Landing", x + (rampW + run + rampW / 2) * sc, y + bandH / 2, GREY, "center", 11);
  const ay = y + bandH / 2;
  strokeLine(g.ctx, x + (rampW + run * 0.12) * sc, ay, x + (rampW + run * 0.88) * sc, ay, GREEN, 1.5);
  note(g.ctx, "▲ up", x + (rampW + run * 0.5) * sc, ay - 12, GREEN, "center", 11);
  dimension(g.ctx, x + rampW * sc, y + bandH, x + (rampW + run) * sc, y + bandH, num(run), BLACK, 34);
  dimension(g.ctx, x, y, x, y + bandH, num(rampW), BLACK, Math.min(34, x - g.left + 18));
  infoLines(g.ctx, ["Ramp on plan, landing each end",
    [`Run ${num(run)} ${g.unit} between landings`, RED]], g.width / 2, g.top + 4);
}

function panelElevation(g: SheetGeom) {
  const panels = Math.max(1, Math.min(20, Math.round(pick(g.values, ["risers", "count"], 6))));
  const rise = pick(g.values, ["totalRise", "height"], 2400);
  const run = pick(g.values, ["totalRun", "run"], 3600);
  const sc = Math.min(g.w * 0.9 / safe(run), (g.h - 210) / safe(rise));
  const x = g.left + (g.w - run * sc) / 2;
  const drop = rise * sc;
  const baseY = Math.min(g.bottom - 50, g.top + 172 + drop);
  const step = run * sc / panels;
  member(g.ctx, x, baseY, x + run * sc, baseY - drop, 12, wood(g.ctx, "horiz"));
  member(g.ctx, x, baseY - 150, x + run * sc, baseY - drop - 150, 12, wood(g.ctx, "horiz"));
  for (let i = 0; i <= panels; i++) {
    const px = x + i * step;
    const py = baseY - drop * i / panels;
    timberPlate(g, px - 6, py - 150, 12, 150, true);
    if (i < panels) {
      plate(g.ctx, px + 8, py - 142 - drop / panels / 2, step - 16, 128, PALE, SILVER);
    }
  }
  dimension(g.ctx, x, baseY, x + run * sc, baseY, num(run), BLACK, 34);
  dimension(g.ctx, x + run * sc, baseY - drop, x + run * sc, baseY, num(rise), BLACK,
    -Math.min(34, g.right - x - run * sc + 24));
  infoLines(g.ctx, [`${panels} raked panels`,
    [`Module ${num(run / panels)} on plan`, RED]], g.width / 2, g.top + 4);
}

function spiralPlan(g: SheetGeom) {
  const treads = Math.max(3, Math.min(40, Math.round(pick(g.values, ["segments", "risers"], 16))));
  const diameter = pick(g.values, ["diameter"], 1800);
  const column = pick(g.values, ["column"], 150);
  const walk = pick(g.values, ["walkLine"], 600);
  const radius = Math.min(g.w, g.h) * 0.42;
  const cx = g.width / 2, cy = g.top + g.h * 0.52;
  const sc = radius / safe(diameter / 2);
  const step = Math.PI * 2 / treads;
  for (let i = 0; i < treads; i++) {
    const a0 = -Math.PI / 2 + i * step;
    const a1 = a0 + step * 0.92;
    const poly = [{ x: cx + Math.cos(a0) * column / 2 * sc, y: cy + Math.sin(a0) * column / 2 * sc }];
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (a1 - a0) * k / 8;
      poly.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
    }
    poly.push({ x: cx + Math.cos(a1) * column / 2 * sc, y: cy + Math.sin(a1) * column / 2 * sc });
    shape(g.ctx, poly, i % 2 === 0 ? FILL : PALE, BLACK, 1);
  }
  g.ctx.save();
  g.ctx.strokeStyle = RED;
  g.ctx.lineWidth = 1;
  g.ctx.setLineDash([6, 4]);
  g.ctx.beginPath();
  g.ctx.arc(cx, cy, Math.max(walk * sc, 1), 0, Math.PI * 2);
  g.ctx.stroke();
  g.ctx.restore();
  ring(g, cx, cy, column / 2 * sc, FACE_DARK);
  centerMark(g.ctx, cx, cy);
  dimension(g.ctx, cx - radius, cy, cx + radius, cy, num(diameter), BLACK, radius + 30);
  note(g.ctx, `Walk line R ${num(walk)}`, cx, cy - walk * sc - 10, RED, "center", 11);
  infoLines(g.ctx, [`${treads} treads @ ${num(360 / treads)}° each`,
    `Column Ø ${num(column)}`], g.width / 2, g.top + 4);
}

// MARK: - Roof

/** 0 common/gable · 1 hip · 2 lean-to · 3 gambrel · 4 saltbox. */
export function roofTypeOf(values: Record<string, number>) {
  return Math.round(values.roofType || 0);
}

function gambrelProfile(g: SheetGeom) {
  const run = safe(g.values.run, safe(g.values.width, 6000) / 2);
  const upper = pick(g.values, ["angle"], 30);
  const lower = pick(g.values, ["angle2"], 60);
  const half = run / 2;
  const lowRise = half * Math.tan(rad(lower));
  const topRise = half * Math.tan(rad(upper));
  const rise = lowRise + topRise;
  const scale = Math.min(g.w * 0.42 / safe(run), g.h * 0.58 / safe(rise));
  const y = g.bottom - 46;
  const ridgeX = g.width / 2;
  const x = ridgeX - run * scale;
  const kneeX = x + half * scale;
  const kneeY = y - lowRise * scale;
  const ridgeY = y - rise * scale;

  hairline(g.ctx, g.left - 10, y, g.right + 10, y);
  plate(g.ctx, x - 10, y, 20, 16);
  plate(g.ctx, ridgeX + run * scale - 10, y, 20, 16);
  for (const side of [-1, 1]) {
    const x0 = ridgeX + side * run * scale;
    const xk = ridgeX + side * half * scale;
    member(g.ctx, x0, y, xk, kneeY, 13, wood(g.ctx, "horiz"));
    member(g.ctx, xk, kneeY, ridgeX, ridgeY, 13, wood(g.ctx, "horiz"));
    plate(g.ctx, xk - 6, kneeY - 7, 12, 14);
  }
  plate(g.ctx, ridgeX - 5, ridgeY - 6, 10, 24);
  hairline(g.ctx, ridgeX, ridgeY - 26, ridgeX, y + 26);
  hairline(g.ctx, kneeX, kneeY, kneeX, y + 26);
  dimension(g.ctx, x, y, kneeX, y, num(half), BLACK, 46);
  dimension(g.ctx, kneeX, y, ridgeX, y, num(half), BLACK, 46);
  dimension(g.ctx, x, y, x, kneeY, num(lowRise), RED, Math.min(40, x - g.left + 22));
  dimension(g.ctx, ridgeX + run * scale, y, ridgeX + run * scale, ridgeY, num(rise), BLACK,
    -Math.min(44, g.width - 16 - ridgeX - run * scale));
  note(g.ctx, `${num(lower)}°`, x + 26, y - 18, GREEN, "left", 15, "bold");
  note(g.ctx, `${num(upper)}°`, ridgeX - 30, ridgeY + 22, GREEN, "right", 15, "bold");
  infoLines(g.ctx, ["Gambrel - two pitches each side",
    `Lower ${num(lower)}° ${num(Math.hypot(half, lowRise))} - upper ${num(upper)}° ${num(Math.hypot(half, topRise))}`,
    [`Total rise ${num(rise)} ${g.unit}`, RED]], g.width / 2, g.top + 4);
}

function saltboxProfile(g: SheetGeom) {
  const run = safe(g.values.run, safe(g.values.width, 6000) / 2);
  const steep = pick(g.values, ["angle"], 30);
  const shallow = pick(g.values, ["angle2"], 22);
  const shortRun = run, longRun = safe(g.values.run2, safe(g.values.width, 6000) - run);
  const rise = shortRun * Math.tan(rad(steep));
  const scale = Math.min(g.w * 0.8 / safe(shortRun + longRun), g.h * 0.56 / safe(rise));
  const y = g.bottom - 46;
  const ridgeX = g.width / 2 - (longRun - shortRun) * scale / 2;
  const leftX = ridgeX - shortRun * scale;
  const rightX = ridgeX + longRun * scale;
  const ridgeY = y - rise * scale;

  hairline(g.ctx, g.left - 10, y, g.right + 10, y);
  plate(g.ctx, leftX - 10, y, 20, 16);
  plate(g.ctx, rightX - 10, y, 20, 16);
  member(g.ctx, leftX, y, ridgeX, ridgeY, 13, wood(g.ctx, "horiz"));
  member(g.ctx, ridgeX, ridgeY, rightX, y, 13, wood(g.ctx, "horiz"));
  plate(g.ctx, ridgeX - 5, ridgeY - 6, 10, 24);
  hairline(g.ctx, ridgeX, ridgeY - 26, ridgeX, y + 26);
  dimension(g.ctx, leftX, y, ridgeX, y, num(shortRun), BLACK, 46);
  dimension(g.ctx, ridgeX, y, rightX, y, num(longRun), BLACK, 46);
  dimension(g.ctx, rightX, y, rightX, ridgeY, num(rise), BLACK, -Math.min(42, g.width - 16 - rightX));
  note(g.ctx, `${num(steep)}°`, leftX + 22, y - 18, GREEN, "left", 15, "bold");
  note(g.ctx, `${num(deg(Math.atan2(rise, longRun)))}°`, rightX - 22, y - 18, GREEN, "right", 15, "bold");
  note(g.ctx, "Ridge off centre", ridgeX, ridgeY - 34, GREY, "center", 11);
  infoLines(g.ctx, ["Saltbox - unequal spans off one ridge",
    `Short ${num(Math.hypot(shortRun, rise))} - long ${num(Math.hypot(longRun, rise))} ${g.unit}`,
    [`Secondary pitch ${num(shallow)}° set at the eave`, RED]], g.width / 2, g.top + 4);
}

function roofPlan(g: SheetGeom) {
  const length = safe(g.values.length, 8000);
  const bldWidth = safe(g.values.width, 6000);
  const spacing = pick(g.values, ["spacing"], 600);
  const scale = Math.min(g.w * 0.94 / safe(length), g.h * 0.78 / safe(bldWidth));
  const pw = length * scale, ph = bldWidth * scale;
  const x = g.left + (g.w - pw) / 2, y = g.top + 58 + (g.h - 58 - ph) / 2;
  plate(g.ctx, x, y, pw, ph, WHITE, BLACK);

  const count = Math.max(2, Math.round(g.values.count ?? (Math.ceil(length / safe(spacing)) + 1)));
  const drawn = Math.min(count, 1000);
  const centres = length / (count - 1);
  const type = roofTypeOf(g.values);
  const inset = type === 1 ? ph / 2 : 0;
  for (let i = 0; i < drawn; i++) {
    const rx = x + i * centres * scale;
    const hipCut = type === 1 ? Math.max(0, Math.min(inset, Math.min(rx - x, x + pw - rx))) : 0;
    strokeLine(g.ctx, rx, y + hipCut, rx, y + ph - hipCut, GREY, 1);
  }
  if (type === 1) {
    strokeLine(g.ctx, x + inset, y + ph / 2, x + pw - inset, y + ph / 2, BLACK, 2.5);
    for (const [cx, cy] of [[x, y], [x, y + ph], [x + pw, y], [x + pw, y + ph]]) {
      const toX = cx < x + pw / 2 ? x + inset : x + pw - inset;
      strokeLine(g.ctx, cx, cy, toX, y + ph / 2, RED, 2);
    }
    note(g.ctx, "Hips", x + inset / 2, y + ph / 4, RED, "center", 11);
    dimension(g.ctx, x + inset, y + ph / 2, x + pw - inset, y + ph / 2, num(Math.max(0, length - bldWidth)), BLACK, -18);
  } else if (type === 2) {
    note(g.ctx, "Falls this way ▼", x + pw / 2, y + ph / 2, GREY, "center", 11);
    strokeLine(g.ctx, x, y, x + pw, y, RED, 2.5);
    note(g.ctx, "High plate", x + pw / 2, y - 12, RED, "center", 11);
  } else if (type === 3) {
    strokeLine(g.ctx, x, y + ph / 2, x + pw, y + ph / 2, BLACK, 2.5);
    for (const f of [0.25, 0.75]) strokeLine(g.ctx, x, y + ph * f, x + pw, y + ph * f, RED, 2);
    note(g.ctx, "Purlin at each knee", x + pw / 2, y + ph * 0.25 - 10, RED, "center", 11);
  } else if (type === 4) {
    strokeLine(g.ctx, x, y + ph * safe(g.values.run, bldWidth / 2) / bldWidth, x + pw, y + ph * safe(g.values.run, bldWidth / 2) / bldWidth, BLACK, 2.5);
    note(g.ctx, "Ridge off centre", x + pw / 2, y + ph * safe(g.values.run, bldWidth / 2) / bldWidth - 11, GREY, "center", 11);
  } else {
    strokeLine(g.ctx, x, y + ph / 2, x + pw, y + ph / 2, BLACK, 2.5);
    note(g.ctx, "Ridge full length", x + pw / 2, y + ph / 2 - 11, GREY, "center", 11);
  }
  dimension(g.ctx, x, y + ph, x + pw, y + ph, num(length), BLACK, 34);
  dimension(g.ctx, x, y, x, y + ph, num(bldWidth), BLACK, Math.min(36, x - g.left + 20));
  const names = ["Gable", "Hip", "Lean-to", "Gambrel", "Saltbox"];
  infoLines(g.ctx, [`${names[Math.min(type, 4)]} framing plan`,
    [`${count} rafter positions @ ${num(centres)} crs`, RED]], g.width / 2, g.top + 4);
}

function rafterCut(g: SheetGeom) {
  const baseRun = safe(g.values.run, safe(g.values.width, 6000) / 2);
  const baseAngle = pick(g.values, ["angle"], 30);
  const depth = pick(g.values, ["thickness", "depth"], 190);
  const seat = pick(g.values, ["seat"], 90);
  const overhang = Math.max(0, g.values.overhang ?? 450);
  const type = roofTypeOf(g.values);
  // hips run the diagonal of the plan square, so they are longer and shallower
  let run = baseRun, angle = baseAngle;
  if (type === 1) {
    run = baseRun * Math.SQRT2;
    angle = deg(Math.atan(Math.tan(rad(baseAngle)) / Math.SQRT2));
  } else if (type === 3) {
    run = baseRun / 2;
    angle = pick(g.values, ["angle2"], 60);
  } else if (type === 4) {
    run = safe(g.values.run2, safe(g.values.width, 6000) - baseRun);
    angle = pick(g.values, ["angle2"], 22);
  }
  const plumbAngle = rad(angle);
  const slope = run / Math.cos(plumbAngle);
  const tail = (type === 1 ? overhang * Math.SQRT2 : overhang) / Math.cos(plumbAngle);
  const total = slope + tail;
  const scale = Math.min(g.w * 0.9 / safe(total), g.h * 0.34 / safe(depth));
  const d = Math.max(30, depth * scale);
  const x = g.left + (g.w - total * scale) / 2;
  const y = g.top + g.h * 0.44;
  member(g.ctx, x, y, x + total * scale, y, d, wood(g.ctx, "horiz"));
  const plumbX = x + tail * scale;
  const seatW = Math.max(14, seat * scale);
  shape(g.ctx, [{ x: plumbX, y: y + d / 2 }, { x: plumbX + seatW, y: y + d / 2 },
    { x: plumbX + seatW, y: y + d / 2 - d * 0.34 }, { x: plumbX, y: y + d / 2 - d * 0.34 }], WHITE, RED, 1);
  note(g.ctx, "Birdsmouth", plumbX + seatW / 2, y + d / 2 + 18, RED, "center", 11);
  strokeLine(g.ctx, x + total * scale, y - d / 2, x + total * scale - d * 0.42, y + d / 2, RED, 1.5);
  note(g.ctx, `Plumb cut ${num(angle)}°`, x + total * scale - 6, y - d / 2 - 12, RED, "right", 11);
  strokeLine(g.ctx, x, y - d / 2, x + d * 0.42, y + d / 2, RED, 1.5);
  note(g.ctx, "Tail cut", x + 6, y - d / 2 - 12, RED, "left", 11);
  const names = ["Common rafter", "Hip rafter", "Mono-pitch rafter", "Lower gambrel rafter", "Long saltbox rafter"];
  if (type === 1) {
    note(g.ctx, "Side cut each face where the hip meets the ridge", g.width / 2, y - d * 1.5, GREY, "center", 11);
  } else if (type === 3) {
    const upperAngle = pick(g.values, ["angle"], 30);
    const upper = baseRun / 2 / Math.cos(rad(upperAngle));
    member(g.ctx, x, y - d * 1.5, x + upper * scale, y - d * 1.5, d * 0.8, wood(g.ctx, "horiz"));
    note(g.ctx, `Upper rafter ${num(upper)} @ ${num(upperAngle)}°`, x + upper * scale + 8, y - d * 1.5, GREY, "left", 11);
  } else if (type === 4) {
    const shortRun = baseRun;
    const shortSlope = Math.hypot(shortRun, shortRun * Math.tan(rad(baseAngle)));
    member(g.ctx, x, y - d * 1.5, x + shortSlope * scale, y - d * 1.5, d * 0.8, wood(g.ctx, "horiz"));
    note(g.ctx, `Short rafter ${num(shortSlope)} @ ${num(baseAngle)}°`, x + shortSlope * scale + 8, y - d * 1.5, GREY, "left", 11);
  }
  dimension(g.ctx, x, y + d / 2, plumbX, y + d / 2, num(tail), GREEN, 54);
  dimension(g.ctx, plumbX, y + d / 2, x + total * scale, y + d / 2, num(slope), BLACK, 54);
  dimension(g.ctx, x, y - d / 2, x, y + d / 2, num(depth), BLACK, Math.min(34, x - g.left + 18));
  infoLines(g.ctx, [`${names[Math.min(type, 4)]} - member detail`,
    [`Stock ${num(total)} ${g.unit} - seat ${num(seat)} - plumb ${num(angle)}°`, RED]], g.width / 2, g.top + 4);
}

function cutTemplate(g: SheetGeom) {
  const angle = pick(g.values, ["angle"], 30);
  const depth = pick(g.values, ["thickness", "depth"], 190);
  const seat = pick(g.values, ["seat"], 90);
  const boxW = g.w / 3.3;
  const cy = g.top + g.h * 0.52;
  const boxH = Math.min(g.h * 0.44, boxW * 1.1);
  const labels = ["Plumb cut", "Seat cut", "Side cut"];
  for (let i = 0; i < 3; i++) {
    const bx = g.left + i * (boxW * 1.15) + boxW * 0.08;
    const minX = bx, maxX = bx + boxW, minY = cy - boxH / 2, maxY = cy + boxH / 2;
    plate(g.ctx, minX, minY, boxW, boxH, PALE, SILVER);
    if (i === 0) {
      const c = { x: minX + boxH * Math.tan(rad(90 - angle)), y: minY };
      shape(g.ctx, [{ x: minX, y: maxY }, { x: maxX, y: maxY }, { x: maxX, y: minY }, c], FILL, BLACK, 1);
      angleArc(g.ctx, minX, maxY, 34, -rad(90 - angle), 0, `${num(90 - angle)}°`);
    } else if (i === 1) {
      const c = { x: minX + Math.min(boxW - 8, seat * boxW / 200), y: maxY - boxH * 0.5 };
      shape(g.ctx, [{ x: minX, y: maxY }, { x: maxX, y: maxY }, { x: maxX, y: c.y }, c], FILL, BLACK, 1);
      dimension(g.ctx, minX, maxY, c.x, maxY, num(seat), RED, 22);
    } else {
      const bevel = deg(Math.atan(Math.tan(rad(angle)) * 0.7071));
      shape(g.ctx, [{ x: minX, y: maxY }, { x: maxX, y: maxY }, { x: maxX, y: minY }], FILL, BLACK, 1);
      angleArc(g.ctx, maxX, maxY, 32, Math.PI, Math.PI + rad(bevel), `${num(bevel)}°`);
    }
    note(g.ctx, labels[i], (minX + maxX) / 2, maxY + 22, BLACK, "center", 11);
  }
  infoLines(g.ctx, [`Full-scale cut templates - ${num(angle)}° roof`,
    [`Rafter ${num(depth)} deep - mark from the top edge`, RED]], g.width / 2, g.top + 4);
}

function soffitDetail(g: SheetGeom) {
  const run = pick(g.values, ["run"], 600);
  const angle = pick(g.values, ["angle"], 30);
  const fascia = pick(g.values, ["fascia"], 190);
  const drop = run * Math.tan(rad(angle));
  const scale = Math.min(g.w * 0.52 / safe(run), g.h * 0.44 / safe(Math.max(drop, fascia)));
  const wallX = g.left + g.w * 0.62;
  const plateY = g.top + g.h * 0.34;
  const tipX = wallX - run * scale;
  const tipY = plateY + drop * scale;
  plate(g.ctx, wallX, plateY - 20, Math.max(30, g.w * 0.14), g.bottom - plateY + 10, PALE, SILVER);
  plate(g.ctx, wallX - 24, plateY - 12, 48, 14);
  member(g.ctx, tipX, tipY, wallX + 40, plateY - drop * scale * 0.2, 14, wood(g.ctx, "horiz"));
  plate(g.ctx, tipX - 8, tipY - 4, 14, Math.max(20, fascia * scale), FILL);
  note(g.ctx, "Fascia", tipX - 14, tipY + 18, BLACK, "right", 11);
  const soffitY = tipY + Math.max(20, fascia * scale);
  plate(g.ctx, tipX - 8, soffitY, wallX - tipX + 8, 9, PALE);
  note(g.ctx, "Soffit lining", (tipX + wallX) / 2, soffitY + 26, GREY, "center", 11);
  hairline(g.ctx, tipX, plateY, tipX, tipY);
  hairline(g.ctx, tipX, plateY, wallX, plateY);
  dimension(g.ctx, tipX, plateY, wallX, plateY, num(run), BLACK, -26);
  dimension(g.ctx, tipX, plateY, tipX, tipY, num(drop), RED, Math.min(40, tipX - g.left + 20));
  angleArc(g.ctx, tipX, tipY, 44, -rad(angle), 0, `${num(angle)}°`);
  infoLines(g.ctx, [`Eave section at ${num(angle)}°`,
    [`Soffit width ${num(run)} - roof line drops ${num(drop)}`, RED]], g.width / 2, g.top + 4);
}

function bullnoseProfile(g: SheetGeom) {
  const radius = pick(g.values, ["radius"], 900);
  const sweep = pick(g.values, ["angle"], 70);
  const straight = Math.max(0, g.values.straight ?? 2400);
  const arc = radius * rad(sweep);
  const scale = Math.min(g.w * 0.86 / safe(straight * 0.55 + radius * 1.35), g.h * 0.62 / safe(radius * 1.25));
  const r = radius * scale;
  const cx = Math.min(g.right - r - 24, g.left + straight * scale * 0.55 + r * 0.2);
  const cy = g.top + 78 + r;
  const startX = cx - straight * scale * 0.55;
  member(g.ctx, startX, cy - r, cx, cy - r, 11, wood(g.ctx, "horiz"));
  const band: { x: number; y: number }[] = [], inner: { x: number; y: number }[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = -Math.PI / 2 + rad(sweep) * i / 48;
    band.push({ x: cx + Math.cos(a) * (r + 5), y: cy + Math.sin(a) * (r + 5) });
    inner.push({ x: cx + Math.cos(a) * (r - 5), y: cy + Math.sin(a) * (r - 5) });
  }
  shape(g.ctx, [...band, ...inner.reverse()], FILL, BLACK, 1);
  centerMark(g.ctx, cx, cy);
  hairline(g.ctx, cx, cy, cx, cy - r);
  const endA = -Math.PI / 2 + rad(sweep);
  hairline(g.ctx, cx, cy, cx + Math.cos(endA) * r, cy + Math.sin(endA) * r);
  note(g.ctx, `R ${num(radius)}`, cx - 8, cy - r / 2, RED, "right", 11);
  angleArc(g.ctx, cx, cy, r * 0.34, -Math.PI / 2, endA, `${num(sweep)}°`);
  dimension(g.ctx, startX, cy - r, cx, cy - r, num(straight), BLACK, -30);
  dimension(g.ctx, cx, cy - r - 22, cx + Math.cos(endA) * r, cy + Math.sin(endA) * r - 22, num(arc), RED, -20);
  infoLines(g.ctx, ["Bullnose - straight run into the curve",
    [`Developed sheet ${num(straight + arc)} ${g.unit}`, RED],
    `Curve drops ${num(radius * (1 - Math.cos(rad(sweep))))}`], g.width / 2, g.top + 4);
}

// MARK: - Metal joints

function tubeEnds(g: SheetGeom) {
  const parent = pick(g.values, ["parentDiameter"], 90);
  const branch = pick(g.values, ["diameter", "tubeDiameter"], 60);
  const angle = pick(g.values, ["angle"], 30);
  const band = g.h - 96;
  const sc = Math.min(g.w * 0.44 / safe(parent), band * 0.42 / safe(parent));
  return { parent, branch, angle, cx: g.width / 2, cy: g.top + 86 + band * 0.5, sc };
}

function tubeEnd(g: SheetGeom) {
  const t = tubeEnds(g);
  const pr = t.parent / 2 * t.sc, br = t.branch / 2 * t.sc;
  ring(g, t.cx, t.cy, pr, PALE);
  ring(g, t.cx, t.cy, pr - Math.max(3, pr * 0.12), WHITE, SILVER);
  ring(g, t.cx, t.cy - pr, br, FILL);
  const saddle: { x: number; y: number }[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = -Math.PI + i * Math.PI / 40;
    const x = Math.cos(a) * br;
    const drop = pr - Math.sqrt(Math.max(0, pr * pr - x * x));
    saddle.push({ x: t.cx + x, y: t.cy - pr + drop });
  }
  for (let i = 0; i < saddle.length - 1; i++) {
    strokeLine(g.ctx, saddle[i].x, saddle[i].y, saddle[i + 1].x, saddle[i + 1].y, RED, 1.5);
  }
  centerMark(g.ctx, t.cx, t.cy);
  dimension(g.ctx, t.cx - pr, t.cy, t.cx + pr, t.cy, `Parent Ø ${num(t.parent)}`, BLACK, pr + 26);
  dimension(g.ctx, t.cx - br, t.cy - pr - br - 6, t.cx + br, t.cy - pr - br - 6, `Branch Ø ${num(t.branch)}`, RED, -18);
  const saddleDepth = t.parent / 2 - Math.sqrt(Math.max(0, (t.parent * t.parent - t.branch * t.branch) / 4));
  infoLines(g.ctx, ["End view - notch saddles onto the parent",
    [`Saddle depth ${num(saddleDepth)} at the sides`, RED]], g.width / 2, g.top + 4);
}

function miterEnd(g: SheetGeom) {
  const t = tubeEnds(g);
  const br = t.branch / 2 * t.sc;
  const half = rad(t.angle) / 2;
  const len = Math.min(g.w * 0.34, (g.h - 150) * 0.5, 190);
  for (const dir of [-half, half]) {
    const a = -Math.PI / 2 + dir;
    steelMember(g, t.cx, t.cy, t.cx + Math.cos(a) * len, t.cy + Math.sin(a) * len, br * 2);
  }
  strokeLine(g.ctx, t.cx - br * 1.6, t.cy, t.cx + br * 1.6, t.cy, RED, 1.6);
  ring(g, t.cx + Math.cos(-Math.PI / 2 + half) * len, t.cy + Math.sin(-Math.PI / 2 + half) * len, br, PALE);
  angleArc(g.ctx, t.cx, t.cy, len * 0.5, -Math.PI / 2 - half, -Math.PI / 2 + half, `${num(t.angle)}°`);
  note(g.ctx, `Cut each end at ${num(t.angle / 2)}°`, t.cx, t.cy + 30, RED, "center", 11);
  dimension(g.ctx, t.cx - br * 1.6, t.cy + 46, t.cx + br * 1.6, t.cy + 46, `Ø ${num(t.branch)}`, BLACK, 20);
  infoLines(g.ctx, ["Miter joint - both ends cut to the half angle",
    [`Included ${num(t.angle)}° - saw ${num(t.angle / 2)}° each side`, RED]], g.width / 2, g.top + 4);
}

function sheetPierce(g: SheetGeom) {
  const t = tubeEnds(g);
  const br = t.branch / 2 * t.sc;
  const plateX = g.left + g.w * 0.08, plateY = t.cy - g.h * 0.26;
  plate(g.ctx, plateX, plateY, g.w * 0.84, g.h * 0.52, PALE, BLACK);
  // a raking tube pierces as an ellipse stretched along the rake
  const major = br / Math.max(0.2, Math.cos(rad(t.angle)));
  g.ctx.save();
  g.ctx.beginPath();
  g.ctx.ellipse(t.cx, t.cy, major, br, 0, 0, Math.PI * 2);
  g.ctx.fillStyle = WHITE;
  g.ctx.fill();
  g.ctx.strokeStyle = RED;
  g.ctx.lineWidth = 1.5;
  g.ctx.stroke();
  g.ctx.restore();
  centerMark(g.ctx, t.cx, t.cy);
  dimension(g.ctx, t.cx - major, t.cy, t.cx + major, t.cy,
    `Major ${num(t.branch / Math.max(0.2, Math.cos(rad(t.angle))))}`, RED, -24);
  dimension(g.ctx, t.cx, t.cy - br, t.cx, t.cy + br, `Minor ${num(t.branch)}`, BLACK, major + 26);
  dimension(g.ctx, plateX, plateY + g.h * 0.52, plateX + g.w * 0.84, plateY + g.h * 0.52, num(t.parent * 4), BLACK, 30);
  infoLines(g.ctx, [`Hole through the sheet at ${num(t.angle)}°`,
    ["A raking tube cuts an ellipse, not a circle", RED]], g.width / 2, g.top + 4);
}

function squareTubeMiter(g: SheetGeom) {
  const side = pick(g.values, ["diameter", "tubeDiameter"], 50);
  const angle = pick(g.values, ["angle"], 90);
  const sc = Math.min(g.w * 0.16 / safe(side), g.h * 0.3 / safe(side));
  const s = Math.max(40, side * sc);
  const cy = g.top + g.h * 0.46;
  const x0 = g.left + g.w * 0.06;
  const faceW = Math.min(g.w * 0.2, 150);
  const names = ["Top", "Side", "Bottom", "Side"];
  for (let i = 0; i < 4; i++) {
    const fx = x0 + i * (faceW + 8);
    const minY = cy - s / 2, maxY = cy + s / 2;
    plate(g.ctx, fx, minY, faceW, s, i % 2 === 0 ? FILL : PALE);
    const cutX = fx + faceW - faceW * 0.3;
    if (i % 2 === 0) strokeLine(g.ctx, cutX, minY, cutX, maxY, RED, 1.6);
    else strokeLine(g.ctx, cutX, minY, fx + faceW - faceW * 0.55, maxY, RED, 1.6);
    note(g.ctx, names[i], fx + faceW / 2, maxY + 20, GREY, "center", 11);
  }
  dimension(g.ctx, x0, cy - s / 2, x0, cy + s / 2, num(side), BLACK, Math.min(30, x0 - g.left + 16));
  infoLines(g.ctx, ["Square tube miter - four faces unrolled",
    [`Corner ${num(angle)}° - each end cut ${num(angle / 2)}°`, RED]], g.width / 2, g.top + 4);
}

function threeWayJoint(g: SheetGeom) {
  const branch = pick(g.values, ["diameter", "tubeDiameter"], 50);
  const angle = pick(g.values, ["angle"], 90);
  const cx = g.width / 2, cy = g.top + g.h * 0.54;
  const len = Math.min(g.w * 0.3, g.h * 0.36);
  const d = Math.max(16, Math.min(40, branch * Math.min(g.w, g.h) / 900));
  const dirs = [-Math.PI / 2, Math.PI - rad(angle) / 2, rad(angle) / 2];
  for (const a of dirs) steelMember(g, cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, d);
  for (const a of dirs) ring(g, cx + Math.cos(a) * len, cy + Math.sin(a) * len, d / 2, PALE);
  ring(g, cx, cy, d * 0.42, FACE_DARK);
  angleArc(g.ctx, cx, cy, len * 0.46, dirs[2], Math.PI - rad(angle) / 2, `${num(180 - angle)}°`);
  angleArc(g.ctx, cx, cy, len * 0.30, -Math.PI / 2, dirs[2], `${num(angle)}°`);
  dimension(g.ctx, cx, cy - len, cx, cy, num(branch * 4), BLACK, -Math.min(38, g.w * 0.2));
  infoLines(g.ctx, ["Three-way hub - each arm notched to the others",
    [`Arms at ${num(angle)}° and ${num(180 - angle)}°`, RED]], g.width / 2, g.top + 4);
}

function bendArc(g: SheetGeom) {
  const radius = pick(g.values, ["radius", "bendRadius"], 300);
  const angle = pick(g.values, ["angle"], 90);
  const diameter = pick(g.values, ["diameter", "tubeDiameter"], 50);
  const sc = Math.min(g.w * 0.42 / safe(radius), g.h * 0.44 / safe(radius));
  const r = Math.max(50, radius * sc);
  const d = Math.max(12, Math.min(34, diameter * sc));
  const cx = g.left + g.w * 0.32, cy = g.top + g.h * 0.28;
  const sweep = rad(Math.min(170, angle));
  const tanIn = { x: cx, y: cy + r };
  const band: { x: number; y: number }[] = [], innerBand: { x: number; y: number }[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI / 2 - sweep * i / 40;
    band.push({ x: cx + Math.cos(a) * (r + d / 2), y: cy + Math.sin(a) * (r + d / 2) });
    innerBand.push({ x: cx + Math.cos(a) * (r - d / 2), y: cy + Math.sin(a) * (r - d / 2) });
  }
  shape(g.ctx, [...band, ...innerBand.reverse()], FILL, BLACK, 1);
  const endA = Math.PI / 2 - sweep;
  const tanOut = { x: cx + Math.cos(endA) * r, y: cy + Math.sin(endA) * r };
  const lead = Math.min(g.w * 0.26, 150);
  member(g.ctx, tanIn.x - lead, tanIn.y, tanIn.x, tanIn.y, d, FILL);
  member(g.ctx, tanOut.x, tanOut.y, tanOut.x + Math.cos(endA - Math.PI / 2) * lead,
    tanOut.y + Math.sin(endA - Math.PI / 2) * lead, d, FILL);
  centerMark(g.ctx, cx, cy);
  hairline(g.ctx, cx, cy, tanIn.x, tanIn.y);
  hairline(g.ctx, cx, cy, tanOut.x, tanOut.y);
  note(g.ctx, `R ${num(radius)}`, cx + 8, cy + r / 2, RED, "left", 11);
  centerMark(g.ctx, tanIn.x, tanIn.y, undefined, RED);
  centerMark(g.ctx, tanOut.x, tanOut.y, undefined, RED);
  note(g.ctx, "Tangent", tanIn.x - 10, tanIn.y + 20, RED, "right", 11);
  angleArc(g.ctx, cx, cy, r * 0.42, endA, Math.PI / 2, `${num(angle)}°`);
  infoLines(g.ctx, [`Bend set-out - centreline radius ${num(radius)}`,
    [`Arc ${num(radius * rad(angle))} ${g.unit} between tangents`, RED]], g.width / 2, g.top + 4);
}

function pieCutWedges(g: SheetGeom) {
  const cuts = Math.max(1, Math.min(20, Math.round(pick(g.values, ["count", "segments"], 5))));
  const angle = pick(g.values, ["angle"], 90);
  const diameter = pick(g.values, ["diameter", "tubeDiameter"], 50);
  const per = angle / Math.max(cuts, 1);
  const boxW = Math.min(g.w / (cuts + 1), 120);
  const cy = g.top + g.h * 0.5;
  const tubeH = Math.max(40, Math.min(g.h * 0.34, diameter * 1.4));
  const startX = g.left + (g.w - boxW * cuts) / 2;
  for (let i = 0; i < cuts; i++) {
    const x = startX + i * boxW;
    const notch = Math.min(boxW * 0.5, tubeH * Math.tan(rad(per / 2)) * 2);
    shape(g.ctx, [{ x: x + 4, y: cy - tubeH / 2 }, { x: x + boxW - 4, y: cy - tubeH / 2 },
      { x: x + boxW / 2 + notch / 2, y: cy + tubeH / 2 },
      { x: x + boxW / 2 - notch / 2, y: cy + tubeH / 2 }], FILL, BLACK, 1);
    strokeLine(g.ctx, x + boxW / 2 - notch / 2, cy + tubeH / 2, x + boxW / 2, cy - tubeH / 2, RED, HAIR);
    strokeLine(g.ctx, x + boxW / 2 + notch / 2, cy + tubeH / 2, x + boxW / 2, cy - tubeH / 2, RED, HAIR);
  }
  dimension(g.ctx, startX, cy + tubeH / 2, startX + boxW * cuts, cy + tubeH / 2,
    `Wrap πD ${num(Math.PI * diameter)}`, BLACK, 34);
  infoLines(g.ctx, [`${cuts} pie cuts - ${num(per)}° taken out of each`,
    [`Close the wedges and weld to turn ${num(angle)}°`, RED]], g.width / 2, g.top + 4);
}

function reducerElevation(g: SheetGeom) {
  const bottomDia = pick(g.values, ["bottomDiameter", "diameter"], 900);
  const topSide = pick(g.values, ["topDiameter", "square", "side"], 300);
  const hgt = pick(g.values, ["height"], 600);
  const sc = Math.min(g.w * 0.5 / safe(bottomDia), g.h * 0.48 / safe(hgt));
  const bw = bottomDia * sc, tw = topSide * sc, hh = hgt * sc;
  const cx = g.width / 2;
  const baseY = g.top + g.h * 0.72;
  const topY = baseY - hh;
  shape(g.ctx, [{ x: cx - bw / 2, y: baseY }, { x: cx + bw / 2, y: baseY },
    { x: cx + tw / 2, y: topY }, { x: cx - tw / 2, y: topY }], FILL, BLACK, 1);
  plate(g.ctx, cx - tw / 2, topY - 8, tw, 16, FACE_LIT);
  g.ctx.beginPath();
  g.ctx.ellipse(cx, baseY, bw / 2, 10, 0, 0, Math.PI * 2);
  g.ctx.fillStyle = PALE;
  g.ctx.fill();
  g.ctx.strokeStyle = BLACK;
  g.ctx.lineWidth = 1;
  g.ctx.stroke();
  strokeLine(g.ctx, cx - bw / 2, baseY, cx - tw / 2, topY, RED, 1.6);
  note(g.ctx, "Corner true length", cx - bw / 2 - 6, (baseY + topY) / 2, RED, "right", 11);
  dimension(g.ctx, cx - bw / 2, baseY, cx + bw / 2, baseY, `Ø ${num(bottomDia)}`, BLACK, 40);
  dimension(g.ctx, cx - tw / 2, topY, cx + tw / 2, topY, `□ ${num(topSide)}`, BLACK, -26);
  dimension(g.ctx, cx + bw / 2, baseY, cx + bw / 2, topY, num(hgt), BLACK, -Math.min(40, g.width - 16 - cx - bw / 2));
  infoLines(g.ctx, ["Round base to square top",
    [`True length ${num(Math.hypot(hgt, (bottomDia - topSide) / 2))} at each corner`, RED]], g.width / 2, g.top + 4);
}

// MARK: - Template construction

function angleLegs(g: SheetGeom) {
  const angle = pick(g.values, ["angle", "value"], 45);
  const cx = g.left + g.w * 0.16, cy = g.bottom - g.h * 0.2;
  const len = Math.min(g.w * 0.72, g.h * 0.72);
  const a = -rad(Math.min(angle, 178));
  member(g.ctx, cx, cy, cx + len, cy, 14, wood(g.ctx, "horiz"));
  member(g.ctx, cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, 14, wood(g.ctx, "horiz"));
  angleArc(g.ctx, cx, cy, len * 0.34, a, 0, `${num(angle)}°`);
  const chordA = { x: cx + len * 0.72, y: cy };
  const chordB = { x: cx + Math.cos(a) * len * 0.72, y: cy + Math.sin(a) * len * 0.72 };
  g.ctx.save();
  g.ctx.setLineDash([5, 4]);
  strokeLine(g.ctx, chordA.x, chordA.y, chordB.x, chordB.y, RED, 1);
  g.ctx.restore();
  dimension(g.ctx, chordA.x, chordA.y, chordB.x, chordB.y,
    num(2 * 1000 * Math.sin(rad(angle) / 2)), RED, 0);
  note(g.ctx, "Check with a tape across the legs", g.width / 2, g.bottom - 12, GREY, "center", 11);
  infoLines(g.ctx, [`Angle set-out ${num(angle)}°`,
    [`Half angle ${num(angle / 2)}° - complement ${num(90 - angle)}°`, RED]], g.width / 2, g.top + 4);
}

function dividerStep(g: SheetGeom) {
  const segments = Math.max(3, Math.min(48, Math.round(pick(g.values, ["segments", "count"], 12))));
  const diameter = pick(g.values, ["diameter"], 1200);
  const r = Math.min(g.w, g.h) * 0.36;
  const cx = g.width / 2, cy = g.top + g.h * 0.52;
  g.ctx.beginPath();
  g.ctx.arc(cx, cy, r, 0, Math.PI * 2);
  g.ctx.strokeStyle = BLACK;
  g.ctx.lineWidth = 1;
  g.ctx.stroke();
  for (let i = 0; i < segments; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / segments;
    centerMark(g.ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, undefined, RED);
  }
  const a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 / segments;
  const p0 = { x: cx + Math.cos(a0) * r, y: cy + Math.sin(a0) * r };
  const p1 = { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
  const apex = {
    x: (p0.x + p1.x) / 2 + (cx - (p0.x + p1.x) / 2) * 0.45,
    y: (p0.y + p1.y) / 2 + (cy - (p0.y + p1.y) / 2) * 0.45,
  };
  strokeLine(g.ctx, p0.x, p0.y, apex.x, apex.y, BLACK, 2);
  strokeLine(g.ctx, p1.x, p1.y, apex.x, apex.y, BLACK, 2);
  strokeLine(g.ctx, p0.x, p0.y, p1.x, p1.y, RED, 1.5);
  centerMark(g.ctx, cx, cy);
  dimension(g.ctx, cx - r, cy, cx + r, cy, `Ø ${num(diameter)}`, BLACK, r + 28);
  infoLines(g.ctx, ["Set dividers to the chord and step round",
    [`${segments} steps @ ${num(diameter * Math.sin(Math.PI / segments))} chord`, RED],
    `Step ${num(360 / segments)}° each`], g.width / 2, g.top + 4);
}

function circleQuadrant(g: SheetGeom) {
  const diameter = pick(g.values, ["diameter"], 1200);
  const stations = Math.max(3, Math.min(12, Math.round(pick(g.values, ["segments", "count"], 8))));
  const r = Math.min(g.w * 0.62, g.h - 130);
  const ox = g.left + (g.w - r) / 2, oy = g.top + 82 + r;
  hairline(g.ctx, ox, oy, ox + r + 20, oy);
  hairline(g.ctx, ox, oy, ox, oy - r - 20);
  // plotted, not swept: an arc call would turn the wrong way here
  const quadrant: { x: number; y: number }[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = Math.PI / 2 * i / 48;
    quadrant.push({ x: ox + Math.cos(a) * r, y: oy - Math.sin(a) * r });
  }
  for (let i = 0; i < quadrant.length - 1; i++) {
    strokeLine(g.ctx, quadrant[i].x, quadrant[i].y, quadrant[i + 1].x, quadrant[i + 1].y, BLACK, 1.4);
  }
  for (let i = 0; i <= stations; i++) {
    const x = r * i / stations;
    const y = Math.sqrt(Math.max(0, r * r - x * x));
    strokeLine(g.ctx, ox + x, oy, ox + x, oy - y, SILVER, HAIR);
    centerMark(g.ctx, ox + x, oy - y, undefined, RED);
    if (i % 2 === 0 || stations <= 8) setOutMark(g.ctx, num(y / r * diameter / 2), ox + x - 3, oy - y - 8);
  }
  dimension(g.ctx, ox, oy, ox + r, oy, num(diameter / 2), BLACK, 34);
  infoLines(g.ctx, ["Quadrant ordinates - offset at each station",
    [`${stations} stations across R ${num(diameter / 2)}`, RED],
    "Mirror the quadrant for the full circle"], g.width / 2, g.top + 4);
}

function tapeWrap(g: SheetGeom) {
  const diameter = pick(g.values, ["value", "diameter"], 400);
  const r = Math.min(g.w * 0.2, g.h * 0.34);
  const cx = g.left + g.w * 0.28, cy = g.top + g.h * 0.5;
  ring(g, cx, cy, r, PALE);
  ring(g, cx, cy, r * 0.82, WHITE, SILVER);
  g.ctx.save();
  g.ctx.strokeStyle = RED;
  g.ctx.lineWidth = 6;
  g.ctx.beginPath();
  g.ctx.arc(cx, cy, r + 5, Math.PI * 0.5, Math.PI * 2.2);
  g.ctx.stroke();
  g.ctx.restore();
  const tapeY = cy + r + 5;
  plate(g.ctx, cx, tapeY - 5, g.right - cx - 10, 11, "#ffee99", GREY);
  for (let i = 0; i <= 12; i++) {
    const x = cx + i * (g.right - cx - 10) / 12;
    strokeLine(g.ctx, x, tapeY - 5, x, tapeY + (i % 2 === 0 ? 6 : 2), BLACK, HAIR);
  }
  centerMark(g.ctx, cx, cy);
  dimension(g.ctx, cx - r, cy, cx + r, cy, `Ø ${num(diameter)}`, BLACK, -r - 24);
  note(g.ctx, `Circumference ${num(Math.PI * diameter)}`, g.right - 10, tapeY + 26, RED, "right", 11);
  infoLines(g.ctx, ["Diameter tape - wrap and read",
    ["Every πD on the tape is 1 unit of diameter", RED]], g.width / 2, g.top + 4);
}

// MARK: - Fencing

function fenceBay(g: SheetGeom) {
  const s = setOut(g);
  const sc = g.w / safe(s.span);
  const hgt = pick(g.values, ["height"], 1800);
  const postTop = g.top + 66, groundY = g.bottom - 58;
  const posts: number[] = [];
  for (let i = 0; i <= s.count; i++) {
    const px = g.left + i * s.centres * sc;
    if (px > g.right) continue;
    posts.push(px);
  }
  for (const f of [0.24, 0.74]) {
    timberPlate(g, g.left, postTop + (groundY - postTop) * f, g.w, 12);
  }
  for (let px = g.left + 4; px < g.right - 6; px += 18) {
    timberPlate(g, px, postTop, 12, groundY - postTop - 10, true);
  }
  for (const p of posts) timberPlate(g, p - 8, postTop - 14, 16, groundY - postTop + 14, true);
  hairline(g.ctx, g.left - 10, groundY, g.right + 10, groundY);
  if (posts.length > 1) {
    dimension(g.ctx, posts[0], groundY, posts[1], groundY, num(s.centres), RED, 22);
  }
  dimension(g.ctx, g.left, groundY, g.right, groundY, num(s.span), BLACK, 46);
  dimension(g.ctx, g.right, postTop, g.right, groundY, num(hgt), BLACK, -Math.min(36, g.width - g.right - 14));
  infoLines(g.ctx, [`${Math.max(posts.length, 2)} posts - ${Math.max(posts.length - 1, 1)} bays`,
    [`Post centres ${num(s.centres)} ${g.unit}`, RED]], g.width / 2, g.top + 4);
}

function fencePlan(g: SheetGeom) {
  const s = setOut(g);
  const sc = g.w / safe(s.span);
  const y = g.top + g.h * 0.46;
  const postW = Math.max(12, s.stock * sc);
  const posts: number[] = [];
  for (let i = 0; i <= s.count; i++) {
    const px = g.left + i * s.centres * sc;
    if (px > g.right) continue;
    posts.push(px);
    ring(g, px, y, postW * 1.5, PALE, SILVER);
    plate(g.ctx, px - postW / 2, y - postW / 2, postW, postW, FILL);
  }
  g.ctx.save();
  g.ctx.setLineDash([5, 4]);
  strokeLine(g.ctx, g.left, y, g.right, y, RED, 1);
  g.ctx.restore();
  note(g.ctx, "String line", g.right - 6, y - postW * 1.5 - 12, RED, "right", 11);
  if (posts.length > 1) {
    dimension(g.ctx, posts[0], y + postW * 1.5, posts[1], y + postW * 1.5, num(s.centres), RED, 26);
  }
  dimension(g.ctx, g.left, y - postW * 1.5, g.right, y - postW * 1.5, num(s.span), BLACK, -32);
  infoLines(g.ctx, ["Fence line on plan",
    `Hole Ø ${num(s.stock * 3)} - post ${num(s.stock)}`], g.width / 2, g.top + 4);
}

function postMortise(g: SheetGeom) {
  const s = setOut(g);
  const hgt = pick(g.values, ["height"], 1800);
  const rails = Math.max(2, Math.min(6, Math.round(pick(g.values, ["rows", "count"], 3))));
  const postX = g.left + g.w * 0.3;
  const postW = Math.max(40, Math.min(90, g.w * 0.11));
  const postTop = g.top + 62, postBottom = g.bottom - 56;
  timberPlate(g, postX, postTop, postW, postBottom - postTop, true);
  for (let i = 0; i < rails; i++) {
    const ry = postTop + (postBottom - postTop) * (i + 0.7) / (rails + 1);
    plate(g.ctx, postX, ry, postW * 0.55, 22, WHITE, RED);
    timberPlate(g, postX + postW * 0.55, ry, g.right - postX - postW * 0.55 - 6, 22);
    if (i === 0) {
      dimension(g.ctx, postX, ry, postX + postW * 0.55, ry, num(s.stock * 0.6), RED, -18);
      dimension(g.ctx, postX + postW * 0.55, ry, postX + postW * 0.55, ry + 22, num(45), BLACK, -22);
    }
  }
  note(g.ctx, "Housing", postX - 8, postTop + 40, RED, "right", 11);
  dimension(g.ctx, postX, postTop, postX + postW, postTop, num(s.stock), BLACK, -26);
  dimension(g.ctx, postX, postTop, postX, postBottom, num(hgt), BLACK, Math.min(38, postX - g.left + 20));
  infoLines(g.ctx, [`${rails} rails housed into the post`,
    [`Post centres ${num(s.centres)} ${g.unit}`, RED]], g.width / 2, g.top + 4);
}

// MARK: - Geometry construction

function segmentDetail(g: SheetGeom) {
  const segments = Math.max(3, Math.min(96, Math.round(pick(g.values, ["segments", "count"], 12))));
  const diameter = pick(g.values, ["diameter"], 1200);
  const r = Math.min(g.w * 0.34, (g.h - 96) / 2);
  const cx = g.width / 2, cy = g.top + 66 + r;
  const half = Math.PI / segments;
  const a0 = Math.PI / 2 - half, a1 = Math.PI / 2 + half;
  const p0 = { x: cx + Math.cos(a0) * r, y: cy + Math.sin(a0) * r };
  const p1 = { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
  g.ctx.save();
  g.ctx.strokeStyle = SILVER;
  g.ctx.lineWidth = HAIR;
  g.ctx.beginPath();
  g.ctx.arc(cx, cy, r, 0, Math.PI * 2);
  g.ctx.stroke();
  g.ctx.restore();
  const arcPts: { x: number; y: number }[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = a0 + (a1 - a0) * i / 24;
    arcPts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  shape(g.ctx, [{ x: cx, y: cy }, ...arcPts], FILL, BLACK, 1);
  strokeLine(g.ctx, p0.x, p0.y, p1.x, p1.y, RED, 1.6);
  const midArc = { x: cx, y: cy + r };
  const midChord = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  strokeLine(g.ctx, midChord.x, midChord.y, midArc.x, midArc.y, GREEN, 1.4);
  centerMark(g.ctx, cx, cy);
  dimension(g.ctx, p0.x, p0.y, p1.x, p1.y, `Chord ${num(2 * diameter / 2 * Math.sin(half))}`, RED, 26);
  dimension(g.ctx, midChord.x, midChord.y, midArc.x, midArc.y,
    `Rise ${num(diameter / 2 * (1 - Math.cos(half)))}`, GREEN, -34);
  angleArc(g.ctx, cx, cy, r * 0.4, a0, a1, `${num(360 / segments)}°`);
  infoLines(g.ctx, [`One segment of ${segments}`,
    [`Half miter ${num(180 / segments)}° each end`, RED]], g.width / 2, g.top + 4);
}

function diagonalCheck(g: SheetGeom) {
  const bw = pick(g.values, ["width", "run"], 4000);
  const bh = pick(g.values, ["height", "rise"], 3000);
  const sc = Math.min(g.w * 0.66 / safe(bw), g.h * 0.6 / safe(bh));
  const x = g.left + g.w * 0.1, y = g.bottom - g.h * 0.16;
  const rw = bw * sc, rh = bh * sc;
  const minX = x, minY = y - rh, maxX = x + rw, maxY = y;
  plate(g.ctx, minX, minY, rw, rh, WHITE, SILVER);
  const unit = Math.min(rw, rh) / 5;
  const a = { x: minX, y: maxY };
  const b = { x: minX + unit * 4, y: maxY };
  const c = { x: minX, y: maxY - unit * 3 };
  shape(g.ctx, [a, b, c], FILL, BLACK, 1);
  strokeLine(g.ctx, b.x, b.y, c.x, c.y, RED, 2);
  strokeLine(g.ctx, a.x + 14, a.y, a.x + 14, a.y - 14, BLACK, HAIR);
  strokeLine(g.ctx, a.x + 14, a.y - 14, a.x, a.y - 14, BLACK, HAIR);
  dimension(g.ctx, a.x, a.y, b.x, b.y, "4 units", BLACK, 26);
  dimension(g.ctx, c.x, c.y, a.x, a.y, "3 units", BLACK, Math.min(30, x - g.left + 16));
  dimension(g.ctx, b.x, b.y, c.x, c.y, "5 units", RED, -20);
  dimension(g.ctx, minX, minY, maxX, minY, num(bw), BLACK, -26);
  dimension(g.ctx, maxX, minY, maxX, maxY, num(bh), BLACK, -Math.min(36, g.width - maxX - 14));
  g.ctx.save();
  g.ctx.setLineDash([5, 4]);
  strokeLine(g.ctx, minX, maxY, maxX, minY, GREEN, 1);
  g.ctx.restore();
  note(g.ctx, `Diagonal ${num(Math.hypot(bw, bh))}`, (minX + maxX) / 2 + 30, (minY + maxY) / 2 - 8, GREEN, "left", 11);
  infoLines(g.ctx, ["Square the corner before the diagonal check",
    ["Both diagonals equal means the frame is square", GREEN]], g.width / 2, g.top + 4);
}

function goldenLine(g: SheetGeom) {
  const length = pick(g.values, ["width", "length"], 1000);
  const phi = (1 + Math.sqrt(5)) / 2;
  const x0 = g.left + 10, x1 = g.right - 10;
  const sq = Math.min((x1 - x0) / 2, g.h * 0.46);
  const y = g.top + 56 + sq;
  const cut = x0 + (x1 - x0) / phi;
  plate(g.ctx, x0, y - sq, sq, sq, PALE, SILVER);
  strokeLine(g.ctx, x0, y, x1, y, BLACK, 3);
  centerMark(g.ctx, cut, y, undefined, RED);
  strokeLine(g.ctx, cut, y - 24, cut, y + 24, RED, 1.6);
  hairline(g.ctx, x0 + sq, y, x0 + sq, y - sq);
  g.ctx.save();
  g.ctx.setLineDash([5, 4]);
  strokeLine(g.ctx, x0, y, x0 + sq, y - sq, GREEN, 1);
  g.ctx.restore();
  dimension(g.ctx, x0, y + 34, cut, y + 34, `Long ${num(length)}`, RED, 0);
  dimension(g.ctx, cut, y + 58, x1, y + 58, `Short ${num(length / phi)}`, BLACK, 0);
  dimension(g.ctx, x0, y - sq + 12, x1, y - sq + 12, `Whole ${num(length * phi)}`, BLACK, 0);
  infoLines(g.ctx, ["Golden section of a line",
    [`Whole : long = long : short = ${num(phi, 6)}`, RED]], g.width / 2, g.top + 4);
}

function braceCut(g: SheetGeom) {
  const run = pick(g.values, ["run", "width"], 4000);
  const rise = pick(g.values, ["rise", "height"], 3000);
  const angle = deg(Math.atan2(rise, safe(run)));
  const cx = g.left + g.w * 0.18, cy = g.bottom - g.h * 0.24;
  const len = Math.min(g.w * 0.68, g.h * 0.66);
  timberPlate(g, cx - 22, cy - len * 0.7, 22, len * 0.7 + 22, true);
  timberPlate(g, cx - 22, cy, len * 0.9, 22);
  const a = rad(angle);
  member(g.ctx, cx, cy, cx + Math.cos(-a) * len * 0.8, cy + Math.sin(-a) * len * 0.8, 20, wood(g.ctx, "horiz"));
  strokeLine(g.ctx, cx, cy - 20, cx + 20 / Math.max(0.2, Math.tan(a)), cy, RED, 1.8);
  angleArc(g.ctx, cx, cy, 56, -a, 0, `${num(angle)}°`);
  note(g.ctx, `Cut ${num(90 - angle)}° from square`, cx + 66, cy - 30, RED, "left", 11);
  dimension(g.ctx, cx, cy + 22, cx + Math.cos(-a) * len * 0.8, cy + 22, num(run), BLACK, 28);
  dimension(g.ctx, cx - 22, cy, cx - 22, cy - len * 0.7, num(rise), BLACK, Math.min(34, cx - g.left - 4));
  infoLines(g.ctx, ["Brace end cut",
    [`Brace ${num(Math.hypot(run, rise))} ${g.unit} at ${num(angle)}°`, RED]], g.width / 2, g.top + 4);
}

function slabSection(g: SheetGeom) {
  const thickness = pick(g.values, ["thickness", "height"], 100);
  const secTop = g.top + g.h * 0.38;
  const slabD = Math.max(34, Math.min(70, g.h * 0.2));
  shape(g.ctx, [{ x: g.left, y: secTop }, { x: g.right, y: secTop },
    { x: g.right, y: secTop + slabD }, { x: g.left, y: secTop + slabD }], concrete(g.ctx), BLACK, 1);
  strokeLine(g.ctx, g.left, secTop + slabD, g.right, secTop + slabD, RED, 2);
  note(g.ctx, "Polythene", g.right - 6, secTop + slabD + 16, RED, "right", 11);
  const fillH = Math.max(20, g.h * 0.14);
  plate(g.ctx, g.left, secTop + slabD + 2, g.w, fillH, PALE, SILVER);
  hatch(g.ctx, g.left, secTop + slabD + 2, g.w, fillH, 7);
  note(g.ctx, "Compacted hardfill", g.left + 8, secTop + slabD + 2 + fillH + 18, GREY, "left", 11);
  const meshY = secTop + slabD * 0.42;
  strokeLine(g.ctx, g.left + 6, meshY, g.right - 6, meshY, BLACK, 2.5);
  for (let mx = g.left + 20; mx < g.right - 10; mx += Math.max(24, g.w / 14)) {
    g.ctx.beginPath();
    g.ctx.arc(mx, meshY, 3.5, 0, Math.PI * 2);
    g.ctx.fillStyle = BLACK;
    g.ctx.fill();
  }
  dimension(g.ctx, g.left, secTop, g.left, secTop + slabD, num(thickness), RED, Math.min(30, g.left - 22));
  dimension(g.ctx, g.right, meshY, g.right, secTop + slabD, num(slabD - slabD * 0.42), GREEN,
    -Math.min(28, g.width - g.right - 22));
  note(g.ctx, "Cover", g.right - 6, secTop + slabD - 6, GREEN, "right", 11);
  dimension(g.ctx, g.left, secTop, g.right, secTop, num(pick(g.values, ["length", "span"], 6000)), BLACK, -30);
  infoLines(g.ctx, ["Slab section - mesh on chairs over polythene",
    [`Slab ${num(thickness)} ${g.unit} thick`, RED]], g.width / 2, g.top + 4);
}

// MARK: - Conversion sheets

const UNIT_SCALE: Record<string, number> = {
  Millimetres: 1, Centimetres: 10, Metres: 1000, Inches: 25.4, Feet: 304.8, Yards: 914.4,
};

function conversionTable(g: SheetGeom) {
  const mm = pick(g.values, ["value"], 2400);
  const rows: [string, string][] = [
    ["Millimetres", num(mm, 3)], ["Centimetres", num(mm / 10, 4)], ["Metres", num(mm / 1000, 5)],
    ["Inches", num(mm / 25.4, 5)], ["Feet", num(mm / 304.8, 5)], ["Yards", num(mm / 914.4, 5)],
  ];
  const rowH = Math.min(34, (g.h - 60) / rows.length);
  const x0 = g.left + g.w * 0.08, x1 = g.right - g.w * 0.08;
  const y0 = g.top + 56;
  const longest = Math.max(...rows.map(([name]) => Math.abs(mm / UNIT_SCALE[name])));
  rows.forEach(([name, value], i) => {
    const y = y0 + i * rowH;
    plate(g.ctx, x0, y, x1 - x0, rowH - 4, i % 2 === 0 ? PALE : WHITE, SILVER);
    note(g.ctx, name, x0 + 10, y + rowH / 2 - 2, BLACK, "left", 12);
    note(g.ctx, value, x1 - 10, y + rowH / 2 - 2, RED, "right", 12, "bold");
    // a bar whose length shows how coarse each unit is against the rest
    const share = Math.abs(mm / UNIT_SCALE[name]) / Math.max(longest, 1e-9);
    plate(g.ctx, x0 + (x1 - x0) * 0.42, y + rowH / 2 - 6, Math.max(2, (x1 - x0) * 0.34 * share), 9, FILL, SILVER);
  });
  infoLines(g.ctx, ["One length, every unit it is called on site"], g.width / 2, g.top + 4);
}

function rulerPair(g: SheetGeom) {
  const mm = pick(g.values, ["value"], 1);
  const span = Math.max(25.4, mm * 1.6);
  const x0 = g.left + 8, x1 = g.right - 8;
  const topY = g.top + g.h * 0.34, botY = g.top + g.h * 0.62;
  plate(g.ctx, x0, topY, x1 - x0, 34, "#fff2b8", GREY);
  plate(g.ctx, x0, botY, x1 - x0, 34, "#ebf5ff", GREY);
  const stepMM = Math.max(1, Math.round(span / 24));
  for (let v = 0; v <= span; v += stepMM) {
    const px = x0 + v / span * (x1 - x0);
    const major = v % (stepMM * 5) < 0.01;
    strokeLine(g.ctx, px, topY, px, topY + (major ? 20 : 11), BLACK, major ? 1 : HAIR);
    if (major) note(g.ctx, num(v, 0), px, topY + 30, BLACK, "center", 10);
  }
  const inches = span / 25.4;
  const inchStep = Math.max(0.25, Math.ceil(inches / 48 * 4) / 4);
  for (let tick = 0; tick <= Math.floor(inches / inchStep); tick++) {
    const i = tick * inchStep;
    const px = x0 + i * 25.4 / span * (x1 - x0);
    const major = Math.abs(i - Math.round(i)) < 0.01;
    strokeLine(g.ctx, px, botY + 34 - (major ? 20 : 11), px, botY + 34, BLACK, major ? 1 : HAIR);
    if (major && i > 0) note(g.ctx, num(i, 0), px, botY + 12, BLACK, "center", 10);
  }
  const markX = x0 + Math.min(span, mm) / span * (x1 - x0);
  strokeLine(g.ctx, markX, topY - 12, markX, botY + 46, RED, 1.6);
  note(g.ctx, `${num(mm, 3)} mm`, markX, topY - 18, RED, "center", 11);
  note(g.ctx, `${num(mm / 25.4, 4)} in`, markX, botY + 60, RED, "center", 11);
  infoLines(g.ctx, ["Same length read on both rules"], g.width / 2, g.top + 4);
}

function areaSquares(g: SheetGeom) {
  const side = Math.min(g.w * 0.42, g.h * 0.62);
  const cy = g.top + g.h * 0.5;
  const mX = g.left + g.w * 0.1, mY = cy - side / 2;
  plate(g.ctx, mX, mY, side, side, PALE, BLACK);
  const f = side * 0.3048;
  let placed = 0;
  for (let fy = mY; fy + f <= mY + side + 0.5; fy += f) {
    for (let fx = mX; fx + f <= mX + side + 0.5; fx += f) {
      plate(g.ctx, fx + 1, fy + 1, f - 2, f - 2, WHITE, SILVER);
      placed++;
    }
  }
  dimension(g.ctx, mX, mY + side, mX + side, mY + side, "1 m", BLACK, 30);
  dimension(g.ctx, mX, mY, mX + f, mY, "1 ft", RED, -22);
  const value = pick(g.values, ["value"], 1);
  infoLines(g.ctx, ["1 m² = 10.7639104167 ft²",
    [`${placed} whole feet fit - the rest is the remainder`, GREY],
    [`${num(value, 4)} m² = ${num(value * 10.7639104167, 6)} ft²`, RED]], g.right, g.top + 4, "right");
}

function volumeCubes(g: SheetGeom) {
  const side = Math.min(g.w * 0.34, g.h * 0.5);
  const cx = g.left + g.w * 0.36, cy = g.top + g.h * 0.62;
  const dx = side * 0.5, dy = -side * 0.29;
  const p = (a: number, b: number, c: number) => ({ x: cx + a * side + b * dx, y: cy - c * side + b * dy });
  shape(g.ctx, [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)], FACE_LIT, BLACK, 1);
  shape(g.ctx, [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)], FACE_DARK, BLACK, 1);
  shape(g.ctx, [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)], FILL, BLACK, 1);
  const f = 0.3048;
  shape(g.ctx, [p(0, 0, 0), p(f, 0, 0), p(f, 0, f), p(0, 0, f)], WHITE, BLACK, 1);
  shape(g.ctx, [p(f, 0, 0), p(f, f, 0), p(f, f, f), p(f, 0, f)], PALE, BLACK, 1);
  shape(g.ctx, [p(0, 0, f), p(f, 0, f), p(f, f, f), p(0, f, f)], FILL, BLACK, 1);
  const a0 = p(0, 0, 0), a1 = p(1, 0, 0), a2 = p(0, 0, 1);
  dimension(g.ctx, a0.x, a0.y, a1.x, a1.y, "1 m", BLACK, 28);
  dimension(g.ctx, a0.x, a0.y, a2.x, a2.y, "1 m", BLACK, -26);
  const label = p(f / 2, 0, f + 0.04);
  note(g.ctx, "1 ft³", label.x, label.y, RED, "center", 11);
  const value = pick(g.values, ["value"], 1);
  infoLines(g.ctx, ["1 m³ = 35.3146667215 ft³",
    [`${num(value, 4)} m³ = ${num(value * 35.3146667215, 6)} ft³`, RED]], g.right, g.top + 4, "right");
}

function scalePan(g: SheetGeom) {
  const value = pick(g.values, ["value"], 1);
  const cx = g.width / 2;
  const beamY = g.top + g.h * 0.38;
  const armX = Math.min(g.w * 0.3, 190);
  strokeLine(g.ctx, cx - armX, beamY, cx + armX, beamY, BLACK, 3);
  shape(g.ctx, [{ x: cx, y: beamY }, { x: cx - 16, y: beamY + 52 }, { x: cx + 16, y: beamY + 52 }], FILL, BLACK, 1);
  const pans: [number, string, number][] = [
    [-1, `${num(value, 4)} kg`, value],
    [1, `${num(value * 2.20462262185, 5)} lb`, value * 2.20462262185],
  ];
  for (const [side, label, mass] of pans) {
    const px = cx + side * armX;
    strokeLine(g.ctx, px, beamY, px, beamY + 34, BLACK, HAIR);
    shape(g.ctx, [{ x: px - 44, y: beamY + 34 }, { x: px + 44, y: beamY + 34 },
      { x: px + 32, y: beamY + 52 }, { x: px - 32, y: beamY + 52 }], PALE, BLACK, 1);
    const blockW = Math.max(18, Math.min(70, 18 + Math.min(mass, 20) * 3));
    plate(g.ctx, px - blockW / 2, beamY + 34 - blockW * 0.5, blockW, blockW * 0.5, FACE_DARK);
    note(g.ctx, label, px, beamY + 76, RED, "center", 12, "bold");
  }
  note(g.ctx, "Same weight, two units", cx, beamY - 22, GREY, "center", 11);
  infoLines(g.ctx, ["1 kg = 2.20462262185 lb", "1 lb = 0.45359237 kg"], g.width / 2, g.top + 4);
}

function scaleDrawing(g: SheetGeom) {
  const known = pick(g.values, ["known", "value"], 2400);
  const knownPx = pick(g.values, ["knownPixels"], 820);
  const measuredPx = pick(g.values, ["measuredPixels"], 475);
  const x0 = g.left + 16, x1 = g.right - 16;
  const refY = g.top + g.h * 0.34, tgtY = g.top + g.h * 0.58;
  const refW = x1 - x0;
  const tgtW = refW * Math.min(1, measuredPx / safe(knownPx));
  plate(g.ctx, x0, refY, refW, 22, PALE, SILVER);
  plate(g.ctx, x0, tgtY, tgtW, 22, FILL);
  dimension(g.ctx, x0, refY, x1, refY, `Known ${num(known)}`, BLACK, -22);
  note(g.ctx, `${num(knownPx, 0)} on the image`, x1, refY + 38, GREY, "right", 11);
  dimension(g.ctx, x0, tgtY + 22, x0 + tgtW, tgtY + 22, num(measuredPx * known / safe(knownPx)), RED, 26);
  note(g.ctx, `${num(measuredPx, 0)} on the image`, x0 + tgtW + 8, tgtY + 14, GREY, "left", 11);
  infoLines(g.ctx, ["Measure a known feature, then anything else",
    [`Scale 1 : ${num(safe(knownPx) / safe(known) * 1000, 4)} per image unit`, RED]], g.width / 2, g.top + 4);
}

function sixteenths(g: SheetGeom) {
  const value = pick(g.values, ["value"], 0.6875);
  const x0 = g.left + 16, x1 = g.right - 16;
  const rows = [2, 4, 8, 16];
  const rowH = Math.min(30, (g.h - 90) / (rows.length + 1));
  const y0 = g.top + 60;
  plate(g.ctx, x0, y0, x1 - x0, rowH - 5, PALE, BLACK);
  note(g.ctx, "1 inch", (x0 + x1) / 2, y0 + rowH / 2 - 3, BLACK, "center", 12);
  rows.forEach((d, r) => {
    const y = y0 + (r + 1) * rowH;
    for (let i = 0; i < d; i++) {
      const a = x0 + i * (x1 - x0) / d;
      const b = x0 + (i + 1) * (x1 - x0) / d;
      plate(g.ctx, a + 1, y, b - a - 2, rowH - 5, i % 2 === 0 ? WHITE : PALE, SILVER);
    }
    note(g.ctx, `1/${d}`, x0 - 8, y + rowH / 2 - 3, BLACK, "right", 11);
  });
  const markX = x0 + Math.min(1, Math.max(0, value)) * (x1 - x0);
  strokeLine(g.ctx, markX, y0 - 14, markX, y0 + (rows.length + 1) * rowH, RED, 1.8);
  note(g.ctx, `${num(value, 5)} in`, markX, y0 - 20, RED, "center", 11);
  infoLines(g.ctx, ["Halving down to sixteenths"], g.width / 2, g.top + 4);
}

function fallSection(g: SheetGeom) {
  const rise = pick(g.values, ["rise"], 20);
  const run = pick(g.values, ["run"], 1000);
  const sc = Math.min(g.w * 0.78 / safe(run), g.h * 0.4 / safe(Math.max(rise, run / 40)));
  const x0 = g.left + g.w * 0.1, y0 = g.top + g.h * 0.42;
  const x1 = x0 + run * sc, y1 = y0 + Math.max(6, rise * sc);
  hairline(g.ctx, x0, y0, x1 + 20, y0);
  member(g.ctx, x0, y0, x1, y1, 12, wood(g.ctx, "horiz"));
  strokeLine(g.ctx, x1, y0, x1, y1, RED, 1.4);
  dimension(g.ctx, x0, y0, x1, y0, `Run ${num(run)}`, BLACK, -26);
  dimension(g.ctx, x1, y0, x1, y1, `Fall ${num(rise)}`, RED, -Math.min(40, g.width - x1 - 14));
  angleArc(g.ctx, x0, y0, Math.min(90, run * sc * 0.4), 0, Math.atan2(y1 - y0, x1 - x0),
    `${num(deg(Math.atan2(rise, safe(run))), 4)}°`);
  note(g.ctx, "Level line", x0 + 6, y0 - 12, GREY, "left", 11);
  infoLines(g.ctx, ["Fall over the run",
    [`1 in ${num(safe(run) / safe(rise), 2)} - ${num(rise / safe(run) * 100, 3)}% grade`, RED]], g.width / 2, g.top + 4);
}

function costSplit(g: SheetGeom) {
  const cost = pick(g.values, ["cost"], 1000);
  const markupPct = Math.max(0, g.values.markup ?? 30);
  const gstPct = Math.max(0, g.values.gst ?? 15);
  const markup = cost * markupPct / 100;
  const sub = cost + markup;
  const gst = sub * gstPct / 100;
  const total = sub + gst;
  const parts: [string, number, string][] = [
    ["Cost", cost, FILL], ["Markup", markup, FACE_DARK], ["GST", gst, PALE],
  ];
  const x0 = g.left + g.w * 0.1, barW = g.w * 0.22;
  const y0 = g.top + 66, colH = g.h - 132;
  let y = y0;
  for (const [label, amount, fill] of parts) {
    const seg = colH * (amount / Math.max(total, 1e-9));
    plate(g.ctx, x0, y, barW, Math.max(2, seg), fill);
    if (seg > 16) note(g.ctx, `${label} $${num(amount, 2)}`, x0 + barW + 12, y + seg / 2 - 3, BLACK, "left", 11);
    y += seg;
  }
  dimension(g.ctx, x0, y0, x0, y0 + colH, `Quote $${num(total, 2)}`, RED, Math.min(40, x0 - g.left + 20));
  infoLines(g.ctx, ["What the customer pays, split three ways",
    [`Markup ${num(markupPct, 2)}% on cost - margin ${num(sub > 0 ? markup / sub * 100 : 0, 2)}% on sell`, RED],
    `GST ${num(gstPct, 2)}% on the subtotal`], g.right, g.top + 4, "right");
}

// MARK: - Dispatch

const SHEETS: Partial<Record<DiagramKind, (g: SheetGeom) => void>> = {
  railsection: railSection, platemark: plateMark, markplate: markPlate,
  battensection: battenSection, glasspanel: glassPanel, glassplan: glassPlan,
  wainscotelev: wainscotElevation, wainscotsection: wainscotSection,
  shelfsection: shelfSection, openingdetail: openingDetail, kerfbent: kerfBent,
  barsection: barSection, barbend: barBend, fastenrow: fastenerRow, fastendetail: fastenerDetail,
  stringermark: stringerMark, spinedetail: spineDetail, rampplan: rampPlan,
  panelelev: panelElevation, spiralplan: spiralPlan,
  roofplan: roofPlan, raftercut: rafterCut, cuttemplate: cutTemplate,
  soffitdetail: soffitDetail, bullnoseprofile: bullnoseProfile,
  tubeend: tubeEnd, miterend: miterEnd, sheetpierce: sheetPierce,
  sqtubemiter: squareTubeMiter, threewayjoint: threeWayJoint,
  bendarc: bendArc, piecutwedges: pieCutWedges, reducerelev: reducerElevation,
  anglelegs: angleLegs, dividerstep: dividerStep, circlequad: circleQuadrant, tapewrap: tapeWrap,
  fencebay: fenceBay, fenceplan: fencePlan, postmortise: postMortise,
  segmentdetail: segmentDetail, diagcheck: diagonalCheck, goldenline: goldenLine,
  bracecut: braceCut, slabsection: slabSection,
  convtable: conversionTable, rulerpair: rulerPair, areasquares: areaSquares,
  volumecubes: volumeCubes, scalepan: scalePan, scaledraw: scaleDrawing,
  sixteenthrule: sixteenths, fallsection: fallSection, costsplit: costSplit,
};

/** Gambrel and saltbox draw their own profile rather than a plain gable. */
export const ROOF_PROFILES: Partial<Record<number, (g: SheetGeom) => void>> = {
  3: gambrelProfile,
  4: saltboxProfile,
};

/** Draws one of the per-calculator sheets. Returns false if this kind is not ours. */
export function drawTradeSheet(g: SheetGeom, kind: DiagramKind) {
  const draw = SHEETS[kind];
  if (!draw) return false;
  draw(g);
  return true;
}
