import "server-only";
import { PDFDocument } from "pdf-lib";
import {
  addUsage,
  callAnthropic,
  pdfDocumentBlock,
  ZERO_USAGE,
  type AiUsage,
  type AnthropicDocumentBlock,
  type AnthropicImageBlock,
  type AnthropicTextBlock,
} from "@/lib/ai/anthropic";
import { describeAiError, isAiError } from "@/lib/ai/errors";
import { aiModel } from "@/lib/ai/models";
import { TIMEOUTS } from "@/lib/fetchTimeout";
import { prepareImageForAi, UnreadableImageError } from "@/lib/aiImage";
import {
  MAX_PDF_PAGES,
  detectImageMime,
  isPdfFile,
  isPreparedScanMime,
  sniffPdf,
  sniffPreparedImageMime,
} from "@/lib/imageUpload";
import { parseModelJsonObject } from "@/lib/modelJson";
import {
  assessExtraction,
  chooseBestExtraction,
  parseSupplierQuoteExtraction,
  type ExtractionStatus,
  type RowFailure,
  type SupplierQuoteExtraction,
} from "./quoteExtraction";

// ─────────────────────────────────────────────────────────────────────────
// The supplier-document reader: ONE function behind /api/materials/extract-
// quote and the golden eval (src/eval/supplier-quote-eval.test.ts), so the
// eval proves the code path production runs.
//
//   quote       a supplier quote / invoice (photo or PDF): every line, the
//               NET unit price, the printed line totals and the totals block
//               (subtotal, account discount, freight, adjustments, GST,
//               total) for the reconciliation checks.
//   price_list  a printed or PDF price list: name, unit, net price, code. No
//               totals. A long PDF is read a few pages at a time, in
//               parallel, so it fits the time limit.
//
// Time: the route's platform limit is 90 s, so every read finishes by the
// caller's deadline (85 s after the request arrived). A second, corrective
// pass only starts when enough time is left for it to finish.
// ─────────────────────────────────────────────────────────────────────────

export type SupplierDocMode = "quote" | "price_list";

export type SupplierDoc =
  | { kind: "image"; mediaType: "image/jpeg" | "image/png"; data: Uint8Array }
  | { kind: "pdf"; data: Uint8Array; pages: number };

/** Everything must be answered this long after the request arrived (maxDuration is 90 s). */
export const READ_DEADLINE_MS = 85_000;
/** A corrective second pass only starts with at least this long left. */
export const MIN_RETRY_MS = 30_000;
/** Not worth starting a first read with less than this. */
const MIN_FIRST_READ_MS = 10_000;
/** Kept back from every call so the route can still answer in time. */
const SAFETY_MS = 2_000;
/** A long PDF price list is read this many pages per call. */
export const PRICE_LIST_PAGES_PER_READ = 4;

// A quote can list 30-40 lines; each JSON row is ~40 tokens. 8192 keeps
// headroom so a long quote doesn't truncate mid-array.
const MAX_TOKENS = 8192;
// Sonnet 5 thinks adaptively INSIDE max_tokens and inside the time budget.
// Reading printed numbers is transcription, not reasoning — low effort
// keeps the thinking from eating the cap or the timeout.
const EFFORT = "low";

export const TOO_SLOW_MESSAGE =
  "Reading that took too long. Try a clearer photo, or fewer pages at a time.";

export const QUOTE_SYSTEM_PROMPT = `You read a NEW ZEALAND building-supplier quote, invoice or order (a photo or a PDF — read every page of a PDF). Extract each product line so the prices can go into a tradie's price library.

Return STRICT JSON only — no prose, no markdown, no code fences:
{
  "supplier": string | null,
  "quote_number": string | null,
  "currency": string | null,
  "gst_inclusive": boolean | null,
  "items": [
    {
      "name": string,
      "unit": string,
      "quantity": number | null,
      "pieces": number | null,
      "price": number | null,
      "line_total": number | null,
      "sku": string | null,
      "raw_text": string | null,
      "confidence": number
    }
  ],
  "subtotal": number | null,
  "discount": number | null,
  "freight": number | null,
  "adjustments": number | null,
  "gst": number | null,
  "total": number | null,
  "notes": string[]
}

Field rules:
- "supplier": the merchant's name if shown, else null.
- "quote_number": the quote / order / reference number as printed, else null.
- "currency": e.g. "NZD" if shown, else null.
- "gst_inclusive": true if the UNIT prices shown INCLUDE GST, false if they EXCLUDE GST, null if you can't tell. NZ trade quotes are usually GST-exclusive.
- "name": the product description as printed.
- "unit": each, m, m², m³, sheet, length, bag, box, kg, pair, roll … default "each".
- "quantity": the line quantity in the SAME unit as the unit price, so that quantity × price = the line total printed on the quote. null if not shown.
- "pieces": when the line shows an "N/length" breakdown (e.g. "19/4.8m" = 19 lengths), the piece count (19), else null.
- "price": the NET unit price — what the tradie pays for ONE unit AFTER any line discount. Trade quotes often show a list (or retail) price, a discount % and a nett price on each row: use the NETT unit price as printed, never the list price. If the row shows no net unit price but shows a quantity and a (net) line total, divide the line total by the quantity to get the unit price and LOWER the confidence. No "$" or commas. null if there is no usable price.
- "line_total": the line total EXACTLY as printed on that row (no "$"/commas). Capture what is printed — do NOT compute or correct it. null if no per-line total is shown. (This is the source value the app reconciles against; the app recomputes its own total separately.)
- "sku": the product/SKU/order code if printed, else null.
- "raw_text": the row's text as you read it (e.g. "19/4.8m H3.2 140x45 @ 12.40 = 235.60"), for review provenance. null if unsure.
- "confidence": 0..1 — your confidence in this row. Lower it when the text is unclear or you derived the unit price.
- "subtotal": the printed sub-total of the product lines, BEFORE any totals-block discount, freight or adjustment and before GST, EXACTLY as printed. null if the quote doesn't print one.
- "discount": an account / trade / cash discount printed in the TOTALS block (below the lines), as a POSITIVE amount taken off (e.g. "Less account discount -45.00" → 45). null if none.
- "freight": a freight / delivery / cartage charge printed in the TOTALS block, exactly as printed. null if none.
- "adjustments": any other amount printed in the totals block that changes the total (a surcharge, rounding); negative if it reduces the total. null if none.
- "gst" / "total": the printed GST amount and the grand total EXACTLY as printed (no "$"/commas), else null.
- "notes": short strings for anything the tradie should double-check (smudged numbers, ambiguous units, lines you skipped).

Hard rules:
- Extract BOTH the unit price ("price") AND the printed line total ("line_total") for each row — capture printed numbers exactly, never compute or "fix" a printed number.
- Capture the printed summary amounts. Do NOT include subtotal / discount / freight / GST / total / rounding rows from the totals block as product items.
- A freight or delivery charge printed as its own product row (with a quantity and price among the lines) IS an item; one printed in the totals block goes in "freight".
- A discount or credit printed as its own row among the lines IS an item: give it a NEGATIVE "price" and "line_total" exactly as printed (e.g. -25.00). Never drop it or make it positive.
- Do NOT invent products or numbers. If you cannot read a value, use null and add a note — never guess.
- If the same product is printed on two rows, return BOTH rows — never merge or de-duplicate lines.
- Use NZ trade vocabulary.`;

export const PRICE_LIST_SYSTEM_PROMPT = `You read a NEW ZEALAND building supplier's PRICE LIST (a PDF, a printout, or a photo of one) so the prices can go into a tradie's price library.

Return STRICT JSON only — no prose, no markdown, no code fences:
{
  "supplier": string | null,
  "currency": string | null,
  "gst_inclusive": boolean | null,
  "items": [
    { "name": string, "unit": string | null, "price": number | null, "sku": string | null, "confidence": number }
  ],
  "notes": string[]
}

Field rules:
- "supplier": the merchant's name if shown, else null.
- "gst_inclusive": true if the prices shown INCLUDE GST (the page says "incl GST", or they are retail shelf prices), false if they EXCLUDE GST ("excl GST", "+ GST", trade or nett prices), null if you can't tell.
- "name": the product description as printed, with its size and spec words (e.g. "90x45 H3.2 SG8 Radiata", "GIB Standard 10mm 2400x1200").
- "unit": what the price is per — each, m, m², m³, sheet, length, bag, box, kg, L, roll, pack … as printed. null if not shown.
- "price": the NET price for ONE unit, exactly as printed (no "$" or commas). When a row shows a list or retail price, a discount and a nett / net / trade price, use the NETT price. When a row shows several quantity-break prices, use the price for a single unit and add a note. null when there is no price ("POA", blank).
- "sku": the product / stock code if printed, else null.
- "confidence": 0..1 — lower it when the text is hard to read.
- "notes": short strings for anything the tradie should double-check.

Hard rules:
- One item per product row, in the order printed. Leave out headings, page numbers, totals and blank rows.
- Do NOT invent products or prices. If you can't read a value, use null and add a note — never guess.
- Never compute or "fix" a printed price.
- If the same product is printed twice, return both rows.
- Use NZ trade vocabulary.`;

export type ReadSuccess = {
  ok: true;
  value: SupplierQuoteExtraction;
  status: ExtractionStatus;
  reasons: string[];
  rowFailures: RowFailure[];
  warnings: string[];
  /** Model calls made (a retry or a split PDF makes more than one). */
  attempts: number;
  usage: AiUsage;
};

export type ReadFailure = {
  ok: false;
  /** HTTP status for the route to answer with. */
  status: number;
  body: { error: string; upstream_status?: number };
  /** Server-side cause, for the monitor / error sink. Never sent to the client. */
  cause: unknown;
  label?: string;
  attempts: number;
  usage: AiUsage;
};

export type ReadOptions = {
  apiKey: string;
  doc: SupplierDoc;
  mode: SupplierDocMode;
  /** Epoch ms by which the answer must be back. */
  deadlineAt: number;
  model?: string;
  now?: () => number;
  /** Tests inject the transport; production uses fetch. */
  fetchImpl?: typeof fetch;
};

type Attempt = { value: SupplierQuoteExtraction; rowFailures: RowFailure[]; warnings: string[] };
type AttemptResult =
  | { kind: "attempt"; attempt: Attempt }
  | { kind: "error"; status: number; body: ReadFailure["body"]; cause: unknown; label?: string; timeout?: boolean };

// ── PDFs ──────────────────────────────────────────────────────────────────

export type PdfCheck = { ok: true; pages: number } | { ok: false; status: number; error: string };

/** Open a PDF to check it before anything is sent: readable, not locked, at most 20 pages. */
export async function inspectSupplierPdf(bytes: Uint8Array): Promise<PdfCheck> {
  if (!sniffPdf(bytes)) {
    return { ok: false, status: 415, error: "That file isn't a PDF we can open." };
  }
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  } catch {
    return {
      ok: false,
      status: 415,
      error: "We couldn't open that PDF. Save it again (Print, then Save as PDF) and try again.",
    };
  }
  if (doc.isEncrypted) {
    return { ok: false, status: 422, error: "That PDF has a password. Save a copy without one and try again." };
  }
  const pages = doc.getPageCount();
  if (pages === 0) return { ok: false, status: 422, error: "That PDF has no pages." };
  if (pages > MAX_PDF_PAGES) {
    return {
      ok: false,
      status: 413,
      error: `That PDF has ${pages} pages. Send up to ${MAX_PDF_PAGES} pages at a time: split it and scan each part.`,
    };
  }
  return { ok: true, pages };
}

export type PreparedUpload =
  | { ok: true; doc: SupplierDoc }
  | { ok: false; status: number; error: string; cause?: unknown };

/**
 * An uploaded file as the reader takes it — the one path the route and the
 * eval share. A PDF (by its name, type or bytes) is checked and sent whole;
 * anything else must be a JPEG / PNG / WebP / GIF, and is re-encoded so no
 * camera metadata (EXIF / GPS) ever reaches the AI provider.
 */
export async function prepareSupplierUpload(
  bytes: Uint8Array,
  file: { name: string; type: string },
): Promise<PreparedUpload> {
  if (isPdfFile(file) || sniffPdf(bytes)) {
    const check = await inspectSupplierPdf(bytes);
    if (!check.ok) return check;
    return { ok: true, doc: { kind: "pdf", data: bytes, pages: check.pages } };
  }
  const mime = detectImageMime(file);
  if (mime && !isPreparedScanMime(mime)) {
    return {
      ok: false,
      status: 415,
      error: `Unsupported file type: ${file.type || file.name || "unknown"}. Use a photo (JPEG, PNG, WebP) or a PDF.`,
    };
  }
  if (!sniffPreparedImageMime(bytes)) {
    return { ok: false, status: 415, error: "Unsupported or unreadable image file." };
  }
  try {
    const prepared = await prepareImageForAi(bytes);
    return { ok: true, doc: { kind: "image", mediaType: prepared.mediaType, data: prepared.data } };
  } catch (e) {
    return {
      ok: false,
      status: 415,
      error: "Unsupported or unreadable image file.",
      cause: e instanceof UnreadableImageError ? undefined : e,
    };
  }
}

/** Pages [from, to] (1-based) of a loaded PDF as their own small PDF. */
async function pdfPages(src: PDFDocument, from: number, to: number): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const indices = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
  for (const page of await out.copyPages(src, indices)) out.addPage(page);
  return out.save();
}

// ── One model call ────────────────────────────────────────────────────────

function mediaBlock(doc: SupplierDoc): AnthropicImageBlock | AnthropicDocumentBlock {
  if (doc.kind === "pdf") return pdfDocumentBlock(doc.data);
  return {
    type: "image",
    source: { type: "base64", media_type: doc.mediaType, data: Buffer.from(doc.data).toString("base64") },
  };
}

function instruction(mode: SupplierDocMode, doc: SupplierDoc, pages: string | null, priorReasons: string[]): string {
  const what =
    mode === "price_list"
      ? `Read every product and price on this price list${pages ? ` (${pages} of a longer PDF)` : ""}`
      : doc.kind === "pdf"
        ? "Read every product line on every page of this supplier quote"
        : "Read every product line on this supplier quote";
  const retry =
    priorReasons.length > 0
      ? `\n\nYour previous read had problems: ${priorReasons.join("; ")}. Re-read EVERY row carefully and capture the EXACT printed numbers (never guess or skip a line), including the totals block if this page prints one.`
      : "";
  return `${what} and return the JSON described in the system prompt.${retry}`;
}

function noun(mode: SupplierDocMode, doc: SupplierDoc): string {
  if (mode === "price_list") return "price list";
  return doc.kind === "pdf" ? "PDF" : "quote";
}

async function extractOnce(
  opts: ReadOptions & { model: string; now: () => number },
  doc: SupplierDoc,
  pages: string | null,
  priorReasons: string[],
  addToUsage: (u: AiUsage) => void,
): Promise<AttemptResult> {
  const left = opts.deadlineAt - opts.now() - SAFETY_MS;
  if (left < MIN_FIRST_READ_MS) {
    return { kind: "error", status: 504, body: { error: TOO_SLOW_MESSAGE }, cause: new Error("no time left"), label: "Timed out", timeout: true };
  }
  const content: Array<AnthropicImageBlock | AnthropicDocumentBlock | AnthropicTextBlock> = [
    mediaBlock(doc),
    { type: "text", text: instruction(opts.mode, doc, pages, priorReasons) },
  ];
  let reply: Awaited<ReturnType<typeof callAnthropic>>;
  try {
    reply = await callAnthropic({
      apiKey: opts.apiKey,
      // Sonnet 5 rejects non-default `temperature` with a 400 — omit it.
      body: {
        model: opts.model,
        max_tokens: MAX_TOKENS,
        output_config: { effort: EFFORT },
        system: opts.mode === "price_list" ? PRICE_LIST_SYSTEM_PROMPT : QUOTE_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      },
      // Never past the deadline: the per-attempt ceiling and the whole retry
      // budget both end with the time that is left.
      timeoutMs: Math.min(TIMEOUTS.extraction, left),
      budgetMs: left,
      onTruncated: "return",
      fetchImpl: opts.fetchImpl,
      now: opts.now,
    });
  } catch (err) {
    console.error(`supplier reader ${opts.model} failed: ${describeAiError(err)}`);
    if (isAiError(err) && err.kind === "timeout") {
      return { kind: "error", status: 504, body: { error: TOO_SLOW_MESSAGE }, cause: err, label: "Timed out", timeout: true };
    }
    if (isAiError(err) && err.status !== null) {
      return {
        kind: "error",
        status: 502,
        body: { error: "Quote scan failed. Please try again.", upstream_status: err.status },
        cause: err,
      };
    }
    return {
      kind: "error",
      status: 502,
      body: { error: "Network error contacting the scan model. Please try again." },
      cause: err,
    };
  }
  addToUsage(reply.usage);
  if (reply.truncated) {
    return {
      kind: "error",
      status: 502,
      body: {
        error:
          doc.kind === "pdf"
            ? `That ${noun(opts.mode, doc)} had too many lines to read in one go. Split it into smaller PDFs and scan each part.`
            : `That ${noun(opts.mode, doc)} had too many lines to read in one go. Try photographing it in two halves.`,
      },
      cause: new Error("reply hit max_tokens"),
      label: "Truncated",
    };
  }
  const unreadable =
    doc.kind === "pdf"
      ? `Couldn't read that ${noun(opts.mode, doc)}. Check it opens, then try again — or photograph the pages instead.`
      : `Couldn't read that ${noun(opts.mode, doc)}. Try a sharper, flatter photo.`;
  let raw: unknown;
  try {
    raw = parseModelJsonObject<unknown>(reply.text);
  } catch (e) {
    console.error("supplier reader could not parse JSON", e, "raw (first 400):", reply.text.slice(0, 400));
    return { kind: "error", status: 502, body: { error: unreadable }, cause: e, label: "Unparseable reply" };
  }
  const parsed = parseSupplierQuoteExtraction(raw);
  if (!parsed.ok) {
    return {
      kind: "error",
      status: 502,
      body: { error: unreadable },
      cause: new Error("extraction failed validation"),
      label: "Invalid reply",
    };
  }
  return { kind: "attempt", attempt: { value: parsed.value, rowFailures: parsed.rowFailures, warnings: parsed.warnings } };
}

// ── Reading a document ────────────────────────────────────────────────────

/**
 * Read a supplier document. Retries once (with the reasons fed back) when
 * the first read is incomplete AND at least MIN_RETRY_MS is left; a long PDF
 * price list is read in parallel chunks of pages.
 */
export async function readSupplierDocument(options: ReadOptions): Promise<ReadSuccess | ReadFailure> {
  const opts = {
    ...options,
    model: options.model ?? aiModel("supplierQuote"),
    now: options.now ?? Date.now,
  };
  let usage: AiUsage = { ...ZERO_USAGE };
  const addToUsage = (u: AiUsage) => {
    usage = addUsage(usage, u);
  };
  const expectTotals = opts.mode === "quote";

  if (opts.mode === "price_list" && opts.doc.kind === "pdf" && opts.doc.pages > PRICE_LIST_PAGES_PER_READ) {
    return readPdfInParts(opts, opts.doc, addToUsage, () => usage);
  }

  const attempts: Attempt[] = [];
  let priorReasons: string[] = [];
  let calls = 0;
  for (let i = 0; i < 2; i++) {
    if (i > 0 && opts.deadlineAt - opts.now() < MIN_RETRY_MS) break;
    calls++;
    const r = await extractOnce(opts, opts.doc, null, priorReasons, addToUsage);
    if (r.kind === "error") {
      // A failed first read is the answer; a failed retry keeps the first read.
      if (attempts.length === 0) {
        return { ok: false, status: r.status, body: r.body, cause: r.cause, label: r.label, attempts: calls, usage };
      }
      break;
    }
    attempts.push(r.attempt);
    const assessment = assessExtraction(r.attempt.value, r.attempt.rowFailures, { expectTotals });
    if (assessment.status === "ok") break;
    // A missing totals block is no reason to read again: one page of a longer
    // quote often has none, and a second read can't make them appear (asking
    // for them only invites invented totals). Re-read for rows it couldn't
    // read, lines with no price, or low confidence.
    const fixable = assessExtraction(r.attempt.value, r.attempt.rowFailures, { expectTotals: false });
    if (fixable.status === "ok") break;
    // A price list is only re-read when nothing usable came back.
    if (!expectTotals && fixable.status !== "blocked") break;
    priorReasons = fixable.reasons;
  }

  const best = chooseBestExtraction(attempts, { expectTotals });
  const warnings = attempts.find((a) => a.value === best.value)?.warnings ?? [];
  return {
    ok: true,
    value: best.value,
    status: best.status,
    reasons: best.reasons,
    rowFailures: best.rowFailures,
    warnings,
    attempts: calls,
    usage,
  };
}

/** A long PDF price list: a few pages per call, all at once, merged in page order. */
async function readPdfInParts(
  opts: ReadOptions & { model: string; now: () => number },
  doc: Extract<SupplierDoc, { kind: "pdf" }>,
  addToUsage: (u: AiUsage) => void,
  usage: () => AiUsage,
): Promise<ReadSuccess | ReadFailure> {
  const parts: Array<{ from: number; to: number }> = [];
  for (let from = 1; from <= doc.pages; from += PRICE_LIST_PAGES_PER_READ) {
    parts.push({ from, to: Math.min(doc.pages, from + PRICE_LIST_PAGES_PER_READ - 1) });
  }
  let src: PDFDocument | null = null;
  try {
    src = await PDFDocument.load(doc.data, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  } catch (e) {
    return {
      ok: false,
      status: 415,
      body: { error: "We couldn't open that PDF. Save it again (Print, then Save as PDF) and try again." },
      cause: e,
      attempts: 0,
      usage: usage(),
    };
  }
  const source = src;
  const results = await Promise.all(
    parts.map(async (part) => {
      const label = part.from === part.to ? `page ${part.from}` : `pages ${part.from}–${part.to}`;
      try {
        const data = await pdfPages(source, part.from, part.to);
        const r = await extractOnce(opts, { kind: "pdf", data, pages: part.to - part.from + 1 }, label, [], addToUsage);
        return { label, r };
      } catch (e) {
        const r: AttemptResult = {
          kind: "error",
          status: 415,
          body: { error: "We couldn't split that PDF into pages. Save it again and try again." },
          cause: e,
        };
        return { label, r };
      }
    }),
  );

  const read = results.filter((x) => x.r.kind === "attempt");
  if (read.length === 0) {
    const first = results[0].r as Extract<AttemptResult, { kind: "error" }>;
    return { ok: false, status: first.status, body: first.body, cause: first.cause, label: first.label, attempts: parts.length, usage: usage() };
  }

  const items: SupplierQuoteExtraction["items"] = [];
  const rowFailures: RowFailure[] = [];
  const notes: string[] = [];
  const warnings: string[] = [];
  let supplier: string | null = null;
  let currency: string | null = null;
  const gstVotes: Array<boolean | null> = [];
  for (const { label, r } of results) {
    if (r.kind === "error") {
      warnings.push(`${label[0].toUpperCase()}${label.slice(1)} couldn't be read (${r.body.error}) — add those prices another way.`);
      continue;
    }
    const { value } = r.attempt;
    for (const f of r.attempt.rowFailures) rowFailures.push({ ...f, index: f.index + items.length });
    items.push(...value.items);
    supplier ??= value.supplier;
    currency ??= value.currency;
    gstVotes.push(value.gst_inclusive);
    for (const n of value.notes) notes.push(`${label[0].toUpperCase()}${label.slice(1)}: ${n}`);
    warnings.push(...r.attempt.warnings);
  }
  const value: SupplierQuoteExtraction = {
    supplier,
    quote_number: null,
    currency,
    gst_inclusive: gstVotes.includes(true) ? true : gstVotes.includes(false) ? false : null,
    items,
    subtotal: null,
    gst: null,
    total: null,
    notes,
  };
  const assessment = assessExtraction(value, rowFailures, { expectTotals: false });
  const failed = results.length - read.length;
  return {
    ok: true,
    value,
    status: failed > 0 && assessment.status === "ok" ? "needs_review" : assessment.status,
    reasons: failed > 0 ? [...assessment.reasons, `${failed} part(s) of the PDF couldn't be read.`] : assessment.reasons,
    rowFailures,
    warnings,
    attempts: parts.length,
    usage: usage(),
  };
}
