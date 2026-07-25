// ─────────────────────────────────────────────────────────────────────────
// Plan-reader — sheet extraction (Phase 2: OCR + title block + scale + dims).
//
// Produces the TEXT-derived parts of an ExtractedSheet from a page image via
// the vision model: title-block text, scale, units, OCR blocks and LABELLED
// dimensions. Geometry + symbol detection are Phase 3 and stay empty here.
//
// Hard rules honoured:
//   - We never invent a dimension. The model is told to emit only values it
//     can actually read, and to omit anything uncertain.
//   - Scale is parsed deterministically in code (scale.ts), not trusted from a
//     free-form model field — and an unparseable scale yields confidence 0,
//     which the SCALE gate turns into "pixel measurement forbidden".
//   - The six gates decide review_required via enforceExtractionGates (OR of
//     independent signals, never an average).
// ─────────────────────────────────────────────────────────────────────────

import { enforceExtractionGates, type GateEnforcement } from "./gates";
import { parseTitleBlock } from "./titleBlock";
import { parseScale } from "./scale";
import type {
  ExtractedSheet,
  LabelledDimension,
  LengthUnit,
  OcrBlock,
  SheetType,
} from "./schema";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const EXTRACT_MODEL = "claude-opus-4-8";
const MAX_TOKENS = 2048;

const EXTRACT_SYSTEM = `You are a construction-drawing OCR + dimension reader. You are shown ONE plan sheet. Read ONLY what is actually printed — never guess, never infer a measurement that is not written.

Return ONLY a JSON object with this exact shape:
{
  "title_block_text": "<verbatim text of the title block panel, newline-separated, or empty>",
  "scale_text": "<the scale label exactly as printed, e.g. 1:100, or null>",
  "units": "mm" | "m" | "ft" | "in" | null,
  "ocr_blocks": [ { "text": "<a readable text label>", "confidence": <0..1> } ],
  "dimensions": [ { "value": <number>, "unit": "mm"|"m"|"ft"|"in", "raw_text": "<as printed>" } ],
  "ocr_confidence": <0..1 overall legibility>
}

Rules:
- dimensions: include a row ONLY when a numeric dimension is clearly printed with or near a clear unit. If you are unsure of a number, OMIT it.
- Do NOT compute areas or totals. Do NOT convert units. Report values as printed.
- If the sheet has no title block, return an empty title_block_text.
- ocr_confidence reflects how legible the sheet is overall.`;

const UNIT_TO_M: Record<LengthUnit, number> = {
  mm: 0.001,
  m: 1,
  ft: 0.3048,
  in: 0.0254,
};

function toMetres(value: number, unit: LengthUnit): number {
  return value * UNIT_TO_M[unit];
}

function isUnit(v: unknown): v is LengthUnit {
  return v === "mm" || v === "m" || v === "ft" || v === "in";
}

export type ExtractDeps = {
  apiKey: string;
  imageBase64: string;
  mediaType?: string;
  sheetType: SheetType;
  filename?: string | null;
  fetchImpl?: typeof fetch;
};

export type ExtractOutcome = {
  extracted: ExtractedSheet;
  enforcement: GateEnforcement;
};

function emptyExtraction(warnings: string[]): ExtractedSheet {
  return {
    units: null,
    scale_text: null,
    scale_confidence: 0,
    ocr_confidence: 0,
    title_block: {},
    ocr_blocks: [],
    dimensions: [],
    detected_symbols: [],
    geometry: { polylines: [], closed_areas: [], openings: [] },
    takeoff: null,
    warnings,
    review_required: true,
  };
}

/**
 * Run text extraction for one sheet. On any model/transport error we return a
 * minimal extraction flagged review_required (explicit failure, not a guess).
 */
export async function extractSheet(deps: ExtractDeps): Promise<ExtractOutcome> {
  const doFetch = deps.fetchImpl ?? fetch;

  let raw: Record<string, unknown> | null = null;
  try {
    const res = await doFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": deps.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        max_tokens: MAX_TOKENS,
        system: EXTRACT_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: deps.mediaType ?? "image/png",
                  data: deps.imageBase64,
                },
              },
              { type: "text", text: "Extract this sheet." },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const ex = emptyExtraction([`extraction http ${res.status}`]);
      return { extracted: ex, enforcement: enforceExtractionGates(ex, deps.sheetType) };
    }
    const json: unknown = await res.json();
    raw = safeJsonObject(extractText(json));
  } catch (e) {
    const ex = emptyExtraction([`extraction error: ${(e as Error).message}`]);
    return { extracted: ex, enforcement: enforceExtractionGates(ex, deps.sheetType) };
  }

  if (!raw) {
    const ex = emptyExtraction(["extraction returned unparseable output"]);
    return { extracted: ex, enforcement: enforceExtractionGates(ex, deps.sheetType) };
  }

  const warnings: string[] = [];

  // Title block + scale (deterministic, in code).
  const titleBlockText =
    typeof raw.title_block_text === "string" ? raw.title_block_text : "";
  const tb = parseTitleBlock(titleBlockText);

  // Prefer an explicit printed scale label; fall back to the title block scan.
  const explicitScale =
    typeof raw.scale_text === "string" ? parseScale(raw.scale_text) : null;
  const scale =
    explicitScale && explicitScale.confidence > tb.scale.confidence
      ? explicitScale
      : tb.scale;
  if (scale.confidence <= 0) warnings.push("scale not determined");

  const units: LengthUnit | null = isUnit(raw.units)
    ? raw.units
    : tb.units;

  // OCR blocks (bbox is null in Phase 2 — coordinates arrive with geometry).
  const ocr_blocks: OcrBlock[] = Array.isArray(raw.ocr_blocks)
    ? raw.ocr_blocks
        .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null)
        .map((b) => ({
          text: typeof b.text === "string" ? b.text : "",
          bbox: null,
          confidence: clampNum(b.confidence),
        }))
        .filter((b) => b.text.length > 0)
    : [];

  // Labelled dimensions → metres (we convert; the model must not).
  const dimensions: LabelledDimension[] = Array.isArray(raw.dimensions)
    ? raw.dimensions
        .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
        .map((d): LabelledDimension | null => {
          const value = typeof d.value === "number" ? d.value : Number(d.value);
          if (!Number.isFinite(value) || value <= 0) return null;
          if (!isUnit(d.unit)) return null;
          return {
            value_m: Math.round(toMetres(value, d.unit) * 1000) / 1000,
            raw_text: typeof d.raw_text === "string" ? d.raw_text : `${value}${d.unit}`,
            bbox: null,
            source: "text",
          };
        })
        .filter((x): x is LabelledDimension => x !== null)
    : [];

  const ocr_confidence = clampNum(raw.ocr_confidence);

  const title_block: Record<string, string> = { ...tb.fields };
  if (tb.sheet_label) title_block.sheet_label = tb.sheet_label;

  const extracted: ExtractedSheet = {
    units,
    scale_text: scale.scale_text,
    scale_confidence: scale.confidence,
    ocr_confidence,
    title_block,
    ocr_blocks,
    dimensions,
    detected_symbols: [],
    geometry: { polylines: [], closed_areas: [], openings: [] },
    takeoff: null,
    warnings: [...warnings, ...scale.notes],
    review_required: false, // set below from gates
  };

  const enforcement = enforceExtractionGates(extracted, deps.sheetType);
  extracted.review_required = enforcement.review_required;

  return { extracted, enforcement };
}

// ── helpers ───────────────────────────────────────────────────────────────

function clampNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function extractText(json: unknown): string {
  if (typeof json !== "object" || json === null) return "";
  const content = (json as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) =>
      typeof b === "object" && b !== null && (b as { type?: string }).type === "text"
        ? String((b as { text?: string }).text ?? "")
        : "",
    )
    .join("");
}

function safeJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
