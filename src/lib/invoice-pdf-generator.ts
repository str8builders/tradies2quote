import "server-only";
import { formatQuantity, formatUnitPrice } from "./quantity-display";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from "pdf-lib";
import { formatCurrency, formatIssueDate } from "./quote-defaults";
import type { QuoteData, QuoteLineItem, QuoteProfile } from "./quote-types";
import { drawPdfLogo, type PdfLogo } from "./pdf-logo";

/**
 * Invoice PDF generator. Sibling to `pdf-generator.ts` (quotes) — same
 * pdf-lib setup and visual style so the two documents read as members
 * of the same family. Lives in a separate file rather than a `mode`
 * flag on generateQuotePdf because the two diverge on:
 *   - Header label (INVOICE vs QUOTE) + colour
 *   - Top-right meta block (invoice number + issued + DUE date) vs (quote number + issued + valid-until)
 *   - Footer (payment instructions instead of accept link)
 * Forcing both through one function would make every change one-of-two
 * branches, which costs more than 100 lines of duplication.
 */

type GenerateArgs = {
  invoiceNumber: string;
  createdAt: string;
  /** null = due on receipt (tradie never set a date). */
  dueDate: string | null;
  snapshot: QuoteData;
  profile: Partial<QuoteProfile> & {
    business_name: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    gst_number?: string | null;
  };
  /** Optional one-liner with bank/payment instructions to render in the
   *  footer (e.g. "Pay to: KIWIBANK 38-9023-... Ref: INV-0042"). When
   *  unset the footer just shows the due date again. */
  paymentInstructions?: string | null;
  /** Optional business logo drawn top-left of the letterhead. */
  logo?: PdfLogo | null;
};

const ORANGE = rgb(1.0, 0.373, 0.082); // #FF5F15
const INK = rgb(0.043, 0.043, 0.043); // #0B0B0B
const MUTED = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.85, 0.85, 0.85);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 48;
const TOP = PAGE_H - 48;
const BOTTOM_MIN = 80;

const ASCII_REPLACEMENTS: Array<[RegExp, string]> = [
  [/—/g, "-"],
  [/–/g, "-"],
  [/[“”]/g, '"'],
  [/[‘’]/g, "'"],
  [/→/g, "->"],
  [/m²/g, "m2"],
  [/m³/g, "m3"],
  [/·/g, "-"],
];

function sanitise(s: string | null | undefined): string {
  if (!s) return "";
  let out = s;
  for (const [re, rep] of ASCII_REPLACEMENTS) out = out.replace(re, rep);
  return out.replace(/[^\x20-\x7E]/g, "?");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).flatMap(word => {
    const parts: string[] = [];
    let part = "";
    for (const character of word) {
      if (part && font.widthOfTextAtSize(part + character, size) > maxWidth) {
        parts.push(part);
        part = "";
      }
      part += character;
    }
    if (part) parts.push(part);
    return parts;
  });
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generateInvoicePdf(args: GenerateArgs): Promise<Uint8Array> {
  const {
    invoiceNumber,
    createdAt,
    dueDate,
    snapshot,
    profile,
    paymentInstructions,
    logo,
  } = args;

  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = TOP;

  function ensureSpace(needed: number) {
    if (y - needed < BOTTOM_MIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = TOP;
    }
  }

  function drawText(
    text: string,
    x: number,
    yPos: number,
    opts: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
      lineHeight?: number;
    } = {},
  ): number {
    const font = opts.font ?? helv;
    const size = opts.size ?? 10;
    const color = opts.color ?? INK;
    const maxWidth = opts.maxWidth ?? PAGE_W - 2 * MARGIN_X;
    const lineHeight = opts.lineHeight ?? size * 1.3;
    const lines = wrapText(sanitise(text), font, size, maxWidth);
    let cursor = yPos;
    for (const line of lines) {
      page.drawText(line, { x, y: cursor, size, font, color });
      cursor -= lineHeight;
    }
    return cursor;
  }

  function drawRule(yPos: number, x1 = MARGIN_X, x2 = PAGE_W - MARGIN_X) {
    page.drawLine({
      start: { x: x1, y: yPos },
      end: { x: x2, y: yPos },
      thickness: 0.6,
      color: RULE,
    });
  }

  // ===== Header =====
  // Optional logo top-left; pushes the business name down by whatever it used.
  y -= await drawPdfLogo(pdf, page, logo, MARGIN_X, y);
  const businessName = profile.business_name || "Your business";
  drawText(businessName.toUpperCase(), MARGIN_X, y, { font: bold, size: 18 });
  y -= 24;

  const headerLines: string[] = [];
  if (profile.email) headerLines.push(profile.email);
  if (profile.phone) headerLines.push(profile.phone);
  if (profile.address) headerLines.push(profile.address);
  if (profile.gst_number) headerLines.push(`GST: ${profile.gst_number}`);
  for (const line of headerLines) {
    drawText(line, MARGIN_X, y, { color: MUTED, size: 9 });
    y -= 12;
  }

  // INVOICE label top right
  page.drawText("INVOICE", {
    x: PAGE_W - MARGIN_X - bold.widthOfTextAtSize("INVOICE", 24),
    y: TOP - 4,
    font: bold,
    size: 24,
    color: ORANGE,
  });
  page.drawText(invoiceNumber, {
    x: PAGE_W - MARGIN_X - helv.widthOfTextAtSize(invoiceNumber, 11),
    y: TOP - 28,
    font: helv,
    size: 11,
    color: INK,
  });
  const issuedLabel = `Issued ${formatIssueDate(createdAt)}`;
  page.drawText(issuedLabel, {
    x: PAGE_W - MARGIN_X - helv.widthOfTextAtSize(issuedLabel, 9),
    y: TOP - 44,
    font: helv,
    size: 9,
    color: MUTED,
  });
  // Due date is the headline for an invoice — emphasised in bold INK.
  const dueLabel = dueDate ? `Due ${formatIssueDate(dueDate)}` : "Due on receipt";
  page.drawText(dueLabel, {
    x: PAGE_W - MARGIN_X - bold.widthOfTextAtSize(dueLabel, 10),
    y: TOP - 60,
    font: bold,
    size: 10,
    color: INK,
  });

  y = Math.min(y, TOP - 84);

  drawRule(y);
  y -= 16;

  // ===== Client block =====
  drawText("BILL TO", MARGIN_X, y, { font: bold, size: 9, color: MUTED });
  y -= 14;
  drawText(snapshot.client.name || "(Client name)", MARGIN_X, y, {
    font: bold,
    size: 12,
  });
  y -= 16;
  if (snapshot.client.address) {
    y = drawText(snapshot.client.address, MARGIN_X, y, {
      maxWidth: 280,
      size: 9,
      color: MUTED,
    });
    y -= 4;
  }
  if (snapshot.client.email) {
    drawText(snapshot.client.email, MARGIN_X, y, { size: 9, color: MUTED });
    y -= 12;
  }
  if (snapshot.client.phone) {
    drawText(snapshot.client.phone, MARGIN_X, y, { size: 9, color: MUTED });
    y -= 12;
  }

  if (snapshot.job_summary) {
    y -= 4;
    y = drawText(snapshot.job_summary, MARGIN_X, y, {
      size: 10,
      color: INK,
      maxWidth: PAGE_W - 2 * MARGIN_X,
    });
  }
  y -= 12;

  drawRule(y);
  y -= 18;

  // ===== Line items =====
  const COL_DESC_X = MARGIN_X;
  const COL_QTY_X = 282;
  const COL_PRICE_X = 386;
  const COL_TOTAL_X = PAGE_W - MARGIN_X;

  function drawHeaderRow(yPos: number) {
    page.drawText("DESCRIPTION", {
      x: COL_DESC_X,
      y: yPos,
      font: bold,
      size: 9,
      color: MUTED,
    });
    page.drawText("QTY", {
      x: COL_QTY_X,
      y: yPos,
      font: bold,
      size: 9,
      color: MUTED,
    });
    page.drawText("UNIT PRICE", {
      x: COL_PRICE_X,
      y: yPos,
      font: bold,
      size: 9,
      color: MUTED,
    });
    const totalLabel = "TOTAL";
    page.drawText(totalLabel, {
      x: COL_TOTAL_X - bold.widthOfTextAtSize(totalLabel, 9),
      y: yPos,
      font: bold,
      size: 9,
      color: MUTED,
    });
  }

  function drawSection(label: string, items: QuoteLineItem[]) {
    if (items.length === 0) return;
    ensureSpace(40);
    drawText(label.toUpperCase(), MARGIN_X, y, {
      font: bold,
      size: 11,
      color: ORANGE,
    });
    y -= 14;
    drawHeaderRow(y);
    y -= 4;
    drawRule(y);
    y -= 12;

    for (const it of items) {
      const columns = [
        { text: sanitise(it.description || ""), x: COL_DESC_X, width: 222, right: false },
        { text: sanitise(`${formatQuantity(it.quantity, it.unit_price)} ${it.unit ?? ""}`.trim()), x: COL_QTY_X, width: 94, right: false },
        { text: sanitise(formatUnitPrice(Number(it.unit_price) || 0, snapshot.currency)), x: COL_PRICE_X, width: 76, right: false },
        { text: sanitise(formatCurrency(Number(it.line_total) || 0, snapshot.currency)), x: COL_TOTAL_X, width: 75, right: true },
      ].map((column, i) => {
        // Keep each numeric token intact. Long rates wrap the unit/currency,
        // and scale down to seven points before moving to a full-width detail.
        const longest = Math.max(1, ...column.text.split(/\s+/).map(w => helv.widthOfTextAtSize(w, 10)));
        const size = i === 0 ? 10 : Math.min(10, 10 * column.width / longest);
        return { ...column, size, lines: wrapText(column.text, helv, size, column.width) };
      });
      const details = columns.slice(1).flatMap((column, i) => column.size < 7
        ? wrapText(`${["Quantity", "Unit price", "Line total"][i]}: ${column.text}`, helv, 9, PAGE_W - 2 * MARGIN_X)
        : []);
      const visible = columns.map(column => column.size < 7
        ? { ...column, size: 9, lines: ["See below"] } : column);
      const bodyLines = Math.max(1, ...visible.map(column => column.lines.length));
      const rowHeight = bodyLines * 13 + details.length * 12 + 6;
      const continueTable = () => {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = TOP;
        drawHeaderRow(y);
        y -= 4;
        drawRule(y);
        y -= 12;
      };
      // Keep normal rows together; very long descriptions continue onto as
      // many pages as needed without losing the quantity on the first part.
      if (rowHeight <= TOP - BOTTOM_MIN - 16 && y - rowHeight < BOTTOM_MIN) continueTable();
      let offset = 0;
      while (offset < bodyLines) {
        if (y - 13 < BOTTOM_MIN) continueTable();
        const count = Math.min(bodyLines - offset, Math.floor((y - BOTTOM_MIN) / 13));
        for (const column of visible) {
          column.lines.slice(offset, offset + count).forEach((text, index) => page.drawText(text, {
            x: column.right ? column.x - helv.widthOfTextAtSize(text, column.size) : column.x,
            y: y - index * 13, font: helv, size: column.size, color: INK,
          }));
        }
        y -= count * 13;
        offset += count;
      }
      for (const text of details) {
        if (y - 12 < BOTTOM_MIN) continueTable();
        page.drawText(text, { x: COL_DESC_X, y, font: helv, size: 9, color: MUTED });
        y -= 12;
      }
      y -= 6;
    }
    y -= 6;
  }

  const materials = snapshot.line_items.filter((it) => it.type === "material");
  const labour = snapshot.line_items.filter((it) => it.type === "labour");
  const other = snapshot.line_items.filter((it) => it.type === "other");
  drawSection("Materials", materials);
  drawSection("Labour", labour);
  drawSection("Other", other);

  // ===== Totals =====
  ensureSpace(110);
  drawRule(y);
  y -= 14;

  function drawTotalRow(label: string, value: number, emphasis = false) {
    const labelText = label.toUpperCase();
    const valueText = formatCurrency(value, snapshot.currency);
    const font = emphasis ? bold : helv;
    const size = emphasis ? 13 : 10;
    const color = emphasis ? ORANGE : INK;

    page.drawText(labelText, {
      x: COL_PRICE_X - 60,
      y,
      font,
      size,
      color: emphasis ? INK : MUTED,
    });
    page.drawText(sanitise(valueText), {
      x: COL_TOTAL_X - font.widthOfTextAtSize(sanitise(valueText), size),
      y,
      font,
      size,
      color,
    });
    y -= emphasis ? 22 : 14;
  }

  drawTotalRow("Subtotal", snapshot.subtotal_before_tax);
  drawTotalRow(`${snapshot.tax_label} (${snapshot.tax_rate}%)`, snapshot.tax_amount);
  y -= 4;
  drawRule(y);
  y -= 18;
  drawTotalRow("Amount due", snapshot.total, true);

  // ===== Payment instructions footer =====
  ensureSpace(60);
  y -= 18;
  drawRule(y);
  y -= 14;
  drawText("PAYMENT", MARGIN_X, y, { font: bold, size: 9, color: MUTED });
  y -= 14;
  if (paymentInstructions) {
    y = drawText(paymentInstructions, MARGIN_X, y, {
      size: 10,
      color: INK,
      maxWidth: PAGE_W - 2 * MARGIN_X,
      lineHeight: 13,
    });
  } else {
    drawText(
      dueDate
        ? `Please pay by ${formatIssueDate(dueDate)}. Use ${invoiceNumber} as the reference.`
        : `Payment is due on receipt. Use ${invoiceNumber} as the reference.`,
      MARGIN_X,
      y,
      {
        size: 10,
        color: INK,
        maxWidth: PAGE_W - 2 * MARGIN_X,
      },
    );
  }

  // Invoice number footer on each page
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const footer = sanitise(
      `${invoiceNumber}  ·  Page ${i + 1} of ${pages.length}`,
    );
    p.drawText(footer, {
      x: MARGIN_X,
      y: 32,
      font: helv,
      size: 8,
      color: MUTED,
    });
  }

  return await pdf.save();
}
