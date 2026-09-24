// ─────────────────────────────────────────────────────────────────────────
// Plan-reader — title-block parsing (Phase 2, pure + deterministic).
//
// A title block is the boxed metadata panel (usually bottom-right) on a plan
// sheet: project name, sheet number/title, scale, date, drawer. We parse the
// OCR'd text of that block into structured fields. Missing fields stay absent
// — we never fabricate a sheet number or project name.
// ─────────────────────────────────────────────────────────────────────────

import { parseScale, type ParsedScale } from "./scale";
import type { LengthUnit } from "./schema";

export type ParsedTitleBlock = {
  fields: Record<string, string>;
  /** e.g. "A-101", "S2.01" — the drawing's own sheet id, if present. */
  sheet_label: string | null;
  scale: ParsedScale;
  units: LengthUnit | null;
};

/**
 * Label → canonical field-key patterns we look for, line by line. `valid`
 * rejects a capture that only matched because the label is case-insensitive
 * (e.g. "Rev by JS"), so the field stays absent rather than wrong.
 */
const FIELD_PATTERNS: Array<{ key: string; re: RegExp; valid?: (value: string) => boolean }> = [
  { key: "project", re: /\b(project|job)\s*(?:name)?\s*[:#-]\s*(.+)/i },
  { key: "client", re: /\bclient\s*[:#-]\s*(.+)/i },
  { key: "sheet_title", re: /\b(?:drawing|sheet)\s*title\s*[:#-]\s*(.+)/i },
  { key: "sheet_number", re: /\b(?:sheet|drawing|dwg)\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z]{0,3}[-.]?\d{1,3}(?:\.\d+)?)/i },
  { key: "scale", re: /\bscale\s*[:#-]\s*(.+)/i },
  { key: "date", re: /\bdate\s*[:#-]\s*(.+)/i },
  { key: "drawn_by", re: /\b(?:drawn|drafted)\s*(?:by)?\s*[:#-]\s*(.+)/i },
  // The label must end at a word boundary: "Revision: B" once came back as
  // "isio" because the short "rev" matched inside the word. Revision marks are
  // printed as capitals and/or digits (A, C2, P1, 03).
  {
    key: "revision",
    re: /\b(?:revision|rev)\b\.?\s*(?:no\.?\s*)?[:#-]?\s*([A-Z0-9]{1,4})\b/i,
    valid: (value) => /^[A-Z0-9]{1,4}$/.test(value),
  },
];

/** Standalone sheet-id tokens like "A-101", "S2.01", "A101". */
const SHEET_ID_RE = /\b([A-Z]{1,3})[-.]?(\d{1,3}(?:\.\d+)?)\b/;

/** Revision labels with their mark ("Rev 1:", "Revision: B", "REV. C2 -"). */
const REVISION_MARK_RE = /\b(?:revision|rev)\b\.?\s*(?:no\.?\s*)?[:#-]?\s*[A-Z0-9]{1,4}\b\s*[:#-]?/gi;
/** Numeric dates: 20/08/2026, 20.08.26, 2026-08-20, 1:20/08/2026's "20/08/2026". */
const NUMERIC_DATE_RE = /\b(?:\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}|\d{4}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{1,2})\b/g;
/** Clock times: 1:30 pm, 13:05:00. */
const CLOCK_TIME_RE = /\b\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2}|\s*[ap]\.?\s?m\b\.?)/gi;

function stripNonScaleNumbers(text: string): string {
  return text
    .replace(REVISION_MARK_RE, " ")
    .replace(NUMERIC_DATE_RE, " ")
    .replace(CLOCK_TIME_RE, " ");
}

function detectUnits(text: string): LengthUnit | null {
  if (/\bmm\b|millimet/i.test(text)) return "mm";
  if (/\bmetres?\b|\bmeters?\b|\bm\b(?!m)/i.test(text)) return "m";
  if (/['′]|feet|foot|\bft\b/i.test(text)) return "ft";
  if (/["″]|inch|\bin\b/i.test(text)) return "in";
  return null;
}

export function parseTitleBlock(raw: string | null | undefined): ParsedTitleBlock {
  const fields: Record<string, string> = {};
  const text = (raw ?? "").trim();
  if (!text) {
    return { fields, sheet_label: null, scale: parseScale(null), units: null };
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    for (const { key, re, valid } of FIELD_PATTERNS) {
      if (fields[key]) continue;
      const m = line.match(re);
      if (m) {
        const captured = (m[2] ?? m[1] ?? "").trim();
        if (captured && (!valid || valid(captured))) fields[key] = captured.slice(0, 200);
      }
    }
  }

  // sheet_label: prefer an explicit "sheet number" field, else sniff a token.
  let sheet_label: string | null = fields.sheet_number ?? null;
  if (!sheet_label) {
    const m = text.match(SHEET_ID_RE);
    if (m) sheet_label = `${m[1]}-${m[2]}`;
  }

  // Scale: prefer the labelled "scale:" field; else scan the whole block with
  // revision marks, dates and clock times removed, so "Rev 1: 20/08/2026" or
  // "Plotted 1:30 pm" can never pass for a 1:20 or 1:30 drawing.
  const scale = parseScale(fields.scale ?? stripNonScaleNumbers(text));

  return {
    fields,
    sheet_label,
    scale,
    units: detectUnits(text),
  };
}
