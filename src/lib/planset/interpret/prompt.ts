// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — the instructions for the AI reading of one sheet (pure).
// ─────────────────────────────────────────────────────────────────────────

import type { TextItem } from "../types";
import type { SheetKind } from "../sheet/classify";

export const SYSTEM_PROMPT = `You read New Zealand building-consent drawings for a builder who is pricing the job.

You get one sheet as a PDF page, plus the sheet's text as numbered runs ("id | text | x,y" with x,y in page millimetres from the top-left). Report what the sheet STATES about the building, and nothing else:
- specs: products, sizes, grades, treatments and spacings the sheet specifies (framing timber and grade, stud spacing, cladding, underlay, roofing, insulation R-values, linings, slab, fixings, bracing systems, finishes).
- heights: stud heights, ceiling heights, floor levels and similar vertical dimensions printed on sections or elevations (mm; say where, e.g. "Section AA").
- roof: pitch in degrees, roofing material and profile, gutters, fascia, downpipes.
- zones: wind zone, earthquake zone, exposure/corrosion zone, snow, climate zone.
- rooms: a room's finishes when the sheet schedules them, and whether it's a wet area.
- legend: what line styles or hatches mean when the legend says existing to remain, to be removed, or new work.
- consent: inspections required, documents or certificates required, and consent conditions (building-consent paperwork).
- by_others: items the drawings say are designed or supplied by others (trusses by supplier, engineer to design, kitchen by others).
- conflicts: places where this sheet contradicts itself.

Rules — these matter more than completeness:
1. Only report what is printed. Never infer, assume, calculate or use general knowledge to fill a gap. Leave a list empty rather than guess.
2. Every item cites the ids of the runs it came from (text_ids). Copy values VERBATIM from those runs — you may join runs and leave words out, but never reword, translate abbreviations or add words.
3. Numbers exactly as printed. heights.mm is the printed number converted to millimetres only when the sheet says metres.
4. Standard tables copied onto a sheet (e.g. NZS 3604 tables, manufacturer span tables) are reference material, not this job's spec — ignore them.
5. Title blocks, council stamps, drawing lists and revision tables are not specs.`;

const KIND_HINT: Partial<Record<SheetKind, string>> = {
  notes: "This is a notes/specification sheet: specs, zones and by_others are the main things to read.",
  specification: "This is a specification: specs, zones and by_others are the main things to read.",
  structural_notes: "These are the engineer's general notes: specs (timber grades, concrete, reinforcing, fixings), zones and by_others.",
  sections: "These are building sections: read heights (stud, ceiling, floor levels, ridge) with the section name, roof pitch, and the build-up specs labelled on the section.",
  elevations: "These are elevations: cladding, roofing, roof pitch, heights and levels as labelled.",
  floor_plan: "This is a floor plan: the legend (existing / remove / new), room finishes schedules, and any notes with specs. Don't list room names without finishes.",
  roof_plan: "This is a roof plan: pitch, roofing material and profile, gutters, fascia, downpipes, underlay.",
  site_plan: "This is a site plan: wind, earthquake and exposure zones and any spec notes.",
  consent_document: "These are building-consent papers: list every required inspection, every required document/certificate/producer statement, and every condition, verbatim.",
  wet_areas: "This sheet covers wet areas: wet-area linings, waterproofing and finishes by room.",
  cover: "This is the cover: zones and any project-wide specs.",
};

/** Words-only reads (no page attached) keep the prompt well inside the model's context. */
export const TEXT_ONLY_MAX_CHARS = 300_000;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** A text run as one safe line: one space between words; no control characters or broken surrogate pairs (invalid JSON for the API). */
export function cleanRunText(s: string): string {
  return s.replace(LONE_SURROGATE, "\uFFFD").replace(CONTROL, "").replace(/\s+/g, " ");
}

/** The sheet's text as numbered runs, reading order, compact. Past `maxChars` the rest is left out. */
export function formatRuns(text: readonly TextItem[], maxChars = Number.POSITIVE_INFINITY): string {
  const lines: string[] = [];
  let used = 0;
  for (const t of text) {
    const line = `${t.id} | ${cleanRunText(t.s)} | ${Math.round(t.x)},${Math.round(t.y)}`;
    if (used + line.length + 1 > maxChars) {
      lines.push("(the rest of the text runs were left out: too long)");
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

/**
 * The instructions plus the numbered text runs. `textOnly`: the page itself
 * isn't attached (the service couldn't open it), so the model reads the words
 * alone and the prompt says so.
 */
export function sheetPrompt(input: { sheetId: string | null; title: string | null; kind: SheetKind; text: readonly TextItem[]; textOnly?: boolean }): string {
  const head = `Sheet ${input.sheetId ?? "(no number)"}${input.title ? ` — ${input.title}` : ""}.`;
  const hint = KIND_HINT[input.kind] ?? "Read everything the rules allow.";
  const note = input.textOnly ? "\nThe page itself is not attached this time: work from the text runs below alone, and report only what they state.\n" : "";
  return `${head}\n${hint}\n${note}\nText runs:\n${formatRuns(input.text, input.textOnly ? TEXT_ONLY_MAX_CHARS : undefined)}`;
}
