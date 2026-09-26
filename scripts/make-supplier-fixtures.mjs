#!/usr/bin/env node
/**
 * Synthetic supplier documents for the supplier-quote golden eval
 * (src/eval/supplier-quote-eval.test.ts). Made-up merchants only — no real
 * company names, logos or branding. The expected answer for each file lives
 * in src/eval/supplier-quote-cases.ts; change both together.
 *
 *   a  list / disc % / nett columns (PNG + a text PDF of the same quote)
 *   b  freight and an account discount in the totals block
 *   c  a GST-inclusive retail receipt
 *   d  a quote over two pages, the same product on both
 *   e  a slightly rotated, photo-like shot of a simple quote
 *
 * Run: node scripts/make-supplier-fixtures.mjs   (writes the files in
 * src/eval/fixtures/supplier-quotes/, which are kept in the repo so the eval
 * reads exactly the same pixels on every machine).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/eval/fixtures/supplier-quotes");
mkdirSync(OUT, { recursive: true });

const FONT = "Helvetica, Arial, sans-serif";
const INK = "#1a1a1a";
const GREY = "#555555";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One text run. */
function t(x, y, s, { size = 24, weight = 400, anchor = "start", fill = INK } = {}) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${esc(s)}</text>`;
}

function line(x1, y1, x2, y2, { width = 2, stroke = INK } = {}) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`;
}

function svgPage(width, height, parts) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/>${parts.join("")}</svg>`;
}

/**
 * A table: columns { label, x, anchor }, rows of cell strings. Returns the
 * SVG parts and the y below the table.
 */
function table(columns, rows, top, { rowHeight = 46, size = 23 } = {}) {
  const parts = [];
  for (const c of columns) parts.push(t(c.x, top, c.label, { size, weight: 700, anchor: c.anchor ?? "start" }));
  parts.push(line(50, top + 14, 1190, top + 14));
  let y = top + 14 + rowHeight;
  for (const row of rows) {
    row.forEach((cell, i) => {
      const c = columns[i];
      parts.push(t(c.x, y, cell, { size, anchor: c.anchor ?? "start" }));
    });
    y += rowHeight;
  }
  parts.push(line(50, y - rowHeight + 18, 1190, y - rowHeight + 18, { width: 1, stroke: "#999999" }));
  return { parts, bottom: y };
}

/** Right-aligned totals block: [label, amount, bold?]. */
function totals(entries, top, { labelX = 980, amountX = 1180, size = 24, gap = 42 } = {}) {
  const parts = [];
  let y = top;
  for (const [label, amount, bold] of entries) {
    parts.push(t(labelX, y, label, { size, weight: bold ? 700 : 400, anchor: "end" }));
    parts.push(t(amountX, y, amount, { size, weight: bold ? 700 : 400, anchor: "end" }));
    y += gap;
  }
  return { parts, bottom: y };
}

function letterhead(name, lines, docTitle, docLines) {
  const parts = [t(60, 110, name, { size: 42, weight: 700 })];
  lines.forEach((l, i) => parts.push(t(60, 150 + i * 32, l, { size: 21, fill: GREY })));
  parts.push(t(1180, 110, docTitle, { size: 36, weight: 700, anchor: "end" }));
  docLines.forEach((l, i) => parts.push(t(1180, 150 + i * 32, l, { size: 21, anchor: "end" })));
  parts.push(line(50, 270, 1190, 270, { width: 3 }));
  return parts;
}

async function png(svg, file) {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(join(OUT, file), buf);
  return buf;
}

// ── a: List / Disc % / Nett ─────────────────────────────────────────────
const A = {
  columns: [
    { label: "Code", x: 60 },
    { label: "Description", x: 175 },
    { label: "Qty", x: 640, anchor: "end" },
    { label: "Unit", x: 665 },
    { label: "List", x: 870, anchor: "end" },
    { label: "Disc %", x: 975, anchor: "end" },
    { label: "Nett", x: 1075, anchor: "end" },
    { label: "Total", x: 1180, anchor: "end" },
  ],
  rows: [
    ["KT9045", "90x45 H1.2 SG8 Radiata 4.8m", "20", "length", "21.50", "15", "18.28", "365.60"],
    ["KT1012", "Plasterboard 10mm 2400x1200", "12", "sheet", "32.00", "20", "25.60", "307.20"],
    ["KT3190", "Joist hanger 190mm galv", "30", "each", "4.40", "10", "3.96", "118.80"],
    ["KT0905", "Framing nails 90mm 5kg", "2", "box", "72.00", "12.5", "63.00", "126.00"],
  ],
  totals: [
    ["Subtotal (excl GST)", "917.60"],
    ["GST 15%", "137.64"],
    ["Total (incl GST)", "1,055.24", true],
  ],
};

async function fixtureA() {
  const parts = letterhead(
    "Kauri Timber Supplies Ltd",
    ["14 Harbour Road, Tauranga 3110", "Phone 07 555 0142  |  GST no. 111-222-333"],
    "TRADE QUOTE",
    ["Quote no. KT-24811", "Date 12/09/2026", "Account 10442"],
  );
  parts.push(t(60, 320, "Customer: Test Builders Ltd  |  Job: 12 Example Street", { size: 22 }));
  parts.push(t(60, 356, "All prices exclude GST. Nett = list less your trade discount.", { size: 20, fill: GREY }));
  const tbl = table(A.columns, A.rows, 430);
  parts.push(...tbl.parts);
  parts.push(...totals(A.totals, tbl.bottom + 40).parts);
  parts.push(t(60, 1650, "Prices valid 30 days. E&OE. Thank you for your business.", { size: 20, fill: GREY }));
  await png(svgPage(1240, 1754, parts), "a-list-disc-nett.png");

  // The same quote as a real text PDF (A4, standard font).
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  const s = 595 / 1240; // the SVG layout, scaled to points
  const draw = (x, y, text, { size = 11, isBold = false, anchor = "start" } = {}) => {
    const f = isBold ? bold : font;
    const w = f.widthOfTextAtSize(text, size);
    const px = anchor === "end" ? x * s - w : x * s;
    page.drawText(text, { x: px, y: 842 - y * s, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  };
  draw(60, 110, "Kauri Timber Supplies Ltd", { size: 20, isBold: true });
  draw(60, 150, "14 Harbour Road, Tauranga 3110", { size: 10 });
  draw(60, 182, "Phone 07 555 0142  |  GST no. 111-222-333", { size: 10 });
  draw(1180, 110, "TRADE QUOTE", { size: 17, isBold: true, anchor: "end" });
  draw(1180, 150, "Quote no. KT-24811", { size: 10, anchor: "end" });
  draw(1180, 182, "Date 12/09/2026", { size: 10, anchor: "end" });
  draw(1180, 214, "Account 10442", { size: 10, anchor: "end" });
  draw(60, 320, "Customer: Test Builders Ltd  |  Job: 12 Example Street", { size: 10.5 });
  draw(60, 356, "All prices exclude GST. Nett = list less your trade discount.", { size: 9.5 });
  A.columns.forEach((c) => draw(c.x, 430, c.label, { size: 11, isBold: true, anchor: c.anchor }));
  A.rows.forEach((row, r) =>
    row.forEach((cell, i) => draw(A.columns[i].x, 490 + r * 46, cell, { size: 11, anchor: A.columns[i].anchor })),
  );
  A.totals.forEach(([label, amount, isBold], i) => {
    const y = 490 + A.rows.length * 46 + 40 + i * 42;
    draw(980, y, label, { size: 11.5, isBold, anchor: "end" });
    draw(1180, y, amount, { size: 11.5, isBold, anchor: "end" });
  });
  draw(60, 1650, "Prices valid 30 days. E&OE. Thank you for your business.", { size: 9.5 });
  pdf.setTitle("Kauri Timber Supplies — quote KT-24811");
  writeFileSync(join(OUT, "a-list-disc-nett.pdf"), await pdf.save());
}

// ── b: freight + account discount in the totals block ────────────────────
async function fixtureB() {
  const parts = letterhead(
    "Totara Building Supplies",
    ["88 Mill Street, Rotorua 3010", "Phone 07 555 0199  |  GST no. 222-333-444"],
    "TAX INVOICE",
    ["Invoice INV-30917", "Date 03/09/2026", "Account TBS-7781"],
  );
  parts.push(t(60, 320, "Deliver to: 5 Sample Lane, Rotorua", { size: 22 }));
  const tbl = table(
    [
      { label: "Qty", x: 110, anchor: "end" },
      { label: "Description", x: 150 },
      { label: "Unit", x: 760 },
      { label: "Unit price", x: 1010, anchor: "end" },
      { label: "Amount", x: 1180, anchor: "end" },
    ],
    [
      ["6", "Treated pine post 100x100 H4 2.4m", "each", "28.90", "173.40"],
      ["10", "Decking 140x32 H3.2 5.4m", "length", "36.50", "365.00"],
      ["3", "Concrete mix 20kg", "bag", "11.20", "33.60"],
    ],
    400,
  );
  parts.push(...tbl.parts);
  parts.push(
    ...totals(
      [
        ["Subtotal", "572.00"],
        ["Less account discount 5%", "-28.60"],
        ["Freight - delivery to site", "45.00"],
        ["Total excl GST", "588.40"],
        ["GST 15%", "88.26"],
        ["TOTAL NZD", "676.66", true],
      ],
      tbl.bottom + 40,
    ).parts,
  );
  parts.push(t(60, 1650, "Payment due 20th of the month following invoice.", { size: 20, fill: GREY }));
  await png(svgPage(1240, 1754, parts), "b-freight-discount.png");
}

// ── c: GST-inclusive retail receipt ──────────────────────────────────────
async function fixtureC() {
  const W = 760;
  const parts = [
    t(W / 2, 90, "RIMU HARDWARE", { size: 40, weight: 700, anchor: "middle" }),
    t(W / 2, 130, "221 Cameron Road, Tauranga", { size: 20, anchor: "middle", fill: GREY }),
    t(W / 2, 160, "GST no. 333-444-555", { size: 20, anchor: "middle", fill: GREY }),
    t(W / 2, 215, "TAX INVOICE / RECEIPT", { size: 26, weight: 700, anchor: "middle" }),
    t(60, 262, "Receipt 000481  18/09/2026 10:42", { size: 20 }),
    t(60, 294, "All prices include GST", { size: 20, fill: GREY }),
    line(50, 318, W - 50, 318),
  ];
  const items = [
    ["Wood screws 8g x 40mm 200pk", "2 @ 19.99", "39.98"],
    ["Exterior wood filler 500g", "1 @ 24.50", "24.50"],
    ["Sandpaper 120 grit 5pk", "4 @ 6.49", "25.96"],
  ];
  let y = 370;
  for (const [name, qty, amount] of items) {
    parts.push(t(60, y, name, { size: 24 }));
    parts.push(t(90, y + 36, qty, { size: 22, fill: GREY }));
    parts.push(t(W - 60, y + 36, amount, { size: 24, anchor: "end" }));
    y += 96;
  }
  parts.push(line(50, y - 20, W - 50, y - 20));
  const tot = [
    ["Subtotal", "90.44"],
    ["TOTAL (incl GST)", "90.44", true],
    ["GST included", "11.80"],
    ["EFTPOS", "90.44"],
  ];
  y += 30;
  for (const [label, amount, bold] of tot) {
    parts.push(t(60, y, label, { size: 24, weight: bold ? 700 : 400 }));
    parts.push(t(W - 60, y, amount, { size: 24, weight: bold ? 700 : 400, anchor: "end" }));
    y += 44;
  }
  parts.push(t(W / 2, y + 40, "Thank you! Keep this receipt for returns.", { size: 19, anchor: "middle", fill: GREY }));
  await png(svgPage(W, y + 100, parts), "c-gst-inclusive-receipt.png");
}

// ── d: two pages, the same product on both ───────────────────────────────
async function fixtureD() {
  const columns = [
    { label: "Description", x: 60 },
    { label: "Qty", x: 700, anchor: "end" },
    { label: "Unit", x: 730 },
    { label: "Price", x: 1010, anchor: "end" },
    { label: "Total", x: 1180, anchor: "end" },
  ];
  const head = (pageNo) =>
    letterhead(
      "Matai Trade Depot",
      ["2 Depot Road, Hamilton 3204", "Phone 07 555 0177  |  GST no. 444-555-666"],
      "QUOTATION",
      ["Quote Q-5521", "Date 21/09/2026", `Page ${pageNo} of 2`],
    );

  const p1 = head(1);
  p1.push(t(60, 320, "Prices exclude GST.", { size: 20, fill: GREY }));
  const t1 = table(
    columns,
    [
      ["90x45 H3.2 SG8 Radiata", "30", "m", "9.80", "294.00"],
      ["Plasterboard 13mm 2400x1200", "6", "sheet", "38.50", "231.00"],
    ],
    400,
  );
  p1.push(...t1.parts);
  p1.push(t(1180, t1.bottom + 40, "Continued on page 2", { size: 21, anchor: "end", fill: GREY }));
  await png(svgPage(1240, 1754, p1), "d-two-pages-1.png");

  const p2 = head(2);
  p2.push(t(60, 320, "Quote Q-5521 (continued)", { size: 20, fill: GREY }));
  const t2 = table(
    columns,
    [
      ["90x45 H3.2 SG8 Radiata", "12", "m", "9.80", "117.60"],
      ["Building paper 1.4m x 40m", "1", "roll", "96.00", "96.00"],
    ],
    400,
  );
  p2.push(...t2.parts);
  p2.push(
    ...totals(
      [
        ["Subtotal", "738.60"],
        ["GST 15%", "110.79"],
        ["Total", "849.39", true],
      ],
      t2.bottom + 40,
    ).parts,
  );
  await png(svgPage(1240, 1754, p2), "d-two-pages-2.png");
}

// ── e: a slightly rotated, photo-like simple quote ───────────────────────
async function fixtureE() {
  const parts = letterhead(
    "Pohutukawa Timber & Hardware",
    ["40 Beach Road, Whakatane 3120", "Phone 07 555 0120"],
    "QUOTE",
    ["No. PTH-0932", "Date 24/09/2026"],
  );
  parts.push(t(60, 320, "Prices exclude GST", { size: 20, fill: GREY }));
  const tbl = table(
    [
      { label: "Qty", x: 110, anchor: "end" },
      { label: "Item", x: 150 },
      { label: "Unit", x: 760 },
      { label: "Each", x: 1010, anchor: "end" },
      { label: "Total", x: 1180, anchor: "end" },
    ],
    [
      ["5", "Timber batten 45x19 H3.1", "length", "6.40", "32.00"],
      ["1", "Wood glue 750ml", "each", "18.90", "18.90"],
      ["2", "Hinge 100mm zinc", "pair", "9.50", "19.00"],
    ],
    400,
  );
  parts.push(...tbl.parts);
  parts.push(
    ...totals(
      [
        ["Subtotal", "69.90"],
        ["GST", "10.49"],
        ["Total", "80.39", true],
      ],
      tbl.bottom + 40,
    ).parts,
  );
  const paper = await sharp(Buffer.from(svgPage(1240, 1300, parts)))
    .png()
    .toBuffer();
  // Tilt it, sit it on a bench, soften it and light it unevenly like a phone shot.
  const tilted = await sharp(paper).rotate(3.5, { background: { r: 92, g: 76, b: 60, alpha: 1 } }).toBuffer();
  const meta = await sharp(tilted).metadata();
  const shade = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  const photo = await sharp(tilted)
    .composite([{ input: shade, blend: "over" }])
    .blur(0.7)
    .modulate({ brightness: 0.96, saturation: 0.9 })
    .jpeg({ quality: 78 })
    .toBuffer();
  writeFileSync(join(OUT, "e-rotated-photo.jpg"), photo);
}

await fixtureA();
await fixtureB();
await fixtureC();
await fixtureD();
await fixtureE();
console.log(`Supplier-quote fixtures written to ${OUT}`);
