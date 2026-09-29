// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — pages with no text to check against: scans, photos of
// paper plans, text saved as shapes.
//
// On a vector sheet every AI answer must appear in the sheet's own text.
// A scan has no text, so the check is a second, INDEPENDENT read instead: the
// page goes to two different models and only what both read the same way is
// kept (numbers exactly, words mostly). Everything kept is marked "check"
// for the tradie; nothing on a scan is measured (no proven scale).
// ─────────────────────────────────────────────────────────────────────────

import { CONSENT_KINDS, EMPTY_READING, HEIGHT_KINDS, ROOF_KINDS, SPEC_TOPICS, ZONE_KINDS, type SheetReading } from "./schema";
import { numbersIn } from "./verify";

export type ScanOpening = { mark: string; kind: "window" | "door"; width_mm: number; height_mm: number; count: number };
export type ScanSheet = { id: string; title: string; scale: string };
export type ScanReading = { reading: SheetReading; sheet: ScanSheet | null; openings: ScanOpening[] };

const req = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const list = (item: Record<string, unknown>) => ({ type: "array", items: req(item) });
const str = { type: "string" } as const;
const num = { type: "number" } as const;

/**
 * Its own, smaller shape: no text ids (a scan has no text runs), no enums
 * (values are checked in parseScan), and only what a photographed sheet can
 * usefully give. The full drawing-sheet shape plus these fields made the
 * structured-output grammar too large for the API.
 */
export const SCAN_READING_SCHEMA = req({
  sheet: req({ id: str, title: str, scale: str }),
  specs: list({ topic: str, value: str }),
  heights: list({ kind: str, mm: num, where: str }),
  roof: list({ kind: str, value: str }),
  zones: list({ kind: str, value: str }),
  consent: list({ kind: str, text: str }),
  by_others: { type: "array", items: str },
  openings: list({ mark: str, kind: str, width_mm: num, height_mm: num, count: num }),
});

export const SCAN_SYSTEM_PROMPT = `You read New Zealand building-consent drawings for a builder who is pricing the job.

This page is a SCAN or a PHOTO of a drawing: there is no text layer, only the picture. Report what the page STATES, copied exactly as printed:
- sheet: its sheet number, title and printed scale (empty strings when not printed).
- specs (topic: one of ${SPEC_TOPICS.join(", ")}), heights in mm (kind: stud_height, ceiling_height, floor_level, ridge_height, top_plate_height or other), roof (kind: pitch_deg, material, profile, gutter, fascia, downpipes or other), zones (kind: wind, earthquake, exposure, snow, climate, rainfall or other), consent (kind: inspection, document or condition), by_others (items designed or supplied by others).
- openings: every row of a window or door schedule on this page (mark, width and height in mm, count). Only from a schedule table, never from the drawing.

Rules — these matter more than completeness:
1. Only report what you can actually read on the page. If a value is blurred, cut off or unclear, leave it out. Never infer, estimate or fill a gap from general knowledge.
2. Copy words and numbers verbatim. Convert to millimetres only when the page prints metres.
3. Standard tables copied onto a sheet (NZS 3604 and the like), title blocks, council stamps and revision tables are not specs.`;

export function scanPrompt(input: { page: number; name: string }): string {
  return `Page ${input.page} of the set (${input.name}). It has no readable text layer — read it from the picture.`;
}

const oneOf = <T extends string>(allowed: readonly T[], v: unknown, fallback: T | null): T | null => (allowed.includes(v as T) ? (v as T) : fallback);

/** Keep only values the schema would have allowed (the scan schema has no enums). */
export function cleanReading(r: SheetReading): SheetReading {
  return {
    specs: r.specs.map((x) => ({ ...x, topic: oneOf(SPEC_TOPICS, x.topic, "other")! })),
    heights: r.heights.flatMap((x) => {
      const kind = oneOf(HEIGHT_KINDS, x.kind, null);
      return kind && Number.isFinite(Number(x.mm)) ? [{ ...x, kind, mm: Number(x.mm) }] : [];
    }),
    roof: r.roof.map((x) => ({ ...x, kind: oneOf(ROOF_KINDS, x.kind, "other")! })),
    zones: r.zones.map((x) => ({ ...x, kind: oneOf(ZONE_KINDS, x.kind, "other")! })),
    rooms: r.rooms.map((x) => ({ ...x, wet: x.wet === true })),
    legend: r.legend.map((x) => ({ ...x, meaning: oneOf(["existing_to_remain", "to_be_removed", "new_work", "other"] as const, x.meaning, "other")! })),
    consent: r.consent.flatMap((x) => {
      const kind = oneOf(CONSENT_KINDS, x.kind, null);
      return kind ? [{ ...x, kind }] : [];
    }),
    by_others: r.by_others,
    conflicts: r.conflicts,
  };
}

type ScanJson = {
  sheet?: Partial<ScanSheet>;
  specs?: Array<{ topic?: string; value?: string }>;
  heights?: Array<{ kind?: string; mm?: number; where?: string }>;
  roof?: Array<{ kind?: string; value?: string }>;
  zones?: Array<{ kind?: string; value?: string }>;
  consent?: Array<{ kind?: string; text?: string }>;
  by_others?: unknown[];
  openings?: Array<Partial<ScanOpening>>;
};

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseScan(json: unknown): ScanReading {
  const j = (json ?? {}) as ScanJson;
  const none: number[] = [];
  const reading: SheetReading = cleanReading({
    ...EMPTY_READING,
    specs: (j.specs ?? []).filter((x) => txt(x.value)).map((x) => ({ topic: txt(x.topic) as SheetReading["specs"][number]["topic"], value: txt(x.value), text_ids: none })),
    heights: (j.heights ?? []).filter((x) => Number(x.mm) > 0).map((x) => ({ kind: txt(x.kind) as SheetReading["heights"][number]["kind"], mm: Number(x.mm), where: txt(x.where), text_ids: none })),
    roof: (j.roof ?? []).filter((x) => txt(x.value)).map((x) => ({ kind: txt(x.kind) as SheetReading["roof"][number]["kind"], value: txt(x.value), text_ids: none })),
    zones: (j.zones ?? []).filter((x) => txt(x.value)).map((x) => ({ kind: txt(x.kind) as SheetReading["zones"][number]["kind"], value: txt(x.value), text_ids: none })),
    consent: (j.consent ?? []).filter((x) => txt(x.text)).map((x) => ({ kind: txt(x.kind) as SheetReading["consent"][number]["kind"], text: txt(x.text), text_ids: none })),
    by_others: (j.by_others ?? []).map(txt).filter(Boolean).map((item) => ({ item, text_ids: none })),
  });
  const sheet = j.sheet && (txt(j.sheet.id) || txt(j.sheet.title)) ? { id: txt(j.sheet.id), title: txt(j.sheet.title), scale: txt(j.sheet.scale) } : null;
  const openings = (j.openings ?? [])
    .filter((o) => txt(o.mark) && (o.kind === "window" || o.kind === "door") && Number(o.width_mm) > 0 && Number(o.height_mm) > 0)
    .map((o) => ({ mark: txt(o.mark).toUpperCase(), kind: o.kind as "window" | "door", width_mm: Math.round(Number(o.width_mm)), height_mm: Math.round(Number(o.height_mm)), count: Number(o.count) > 0 ? Math.round(Number(o.count)) : 1 }));
  return { reading, sheet, openings };
}

// ── agreement ────────────────────────────────────────────────────────────

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9.]+/g) ?? []);

/** Two readings of the same words: every number the same, and mostly the same words. */
export function sameText(a: string, b: string): boolean {
  const na = numbersIn(a).sort((x, y) => x - y), nb = numbersIn(b).sort((x, y) => x - y);
  if (na.length !== nb.length || na.some((n, i) => n !== nb[i])) return false;
  const wa = words(a), wb = words(b);
  if (!wa.size && !wb.size) return true;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / Math.max(wa.size, wb.size) >= 0.6;
}

function agreeList<T>(a: T[], b: T[], same: (x: T, y: T) => boolean): T[] {
  const used = new Set<number>();
  const out: T[] = [];
  for (const x of a) {
    const i = b.findIndex((y, k) => !used.has(k) && same(x, y));
    if (i >= 0) {
      used.add(i);
      out.push(x);
    }
  }
  return out;
}

/** Keep only what two independent reads of the same page agree on. */
export function agreeScans(a: ScanReading, b: ScanReading): { agreed: ScanReading; kept: number; dropped: number } {
  const ra = a.reading, rb = b.reading;
  const reading: SheetReading = {
    specs: agreeList(ra.specs, rb.specs, (x, y) => x.topic === y.topic && sameText(x.value, y.value)),
    heights: agreeList(ra.heights, rb.heights, (x, y) => x.kind === y.kind && Math.round(x.mm) === Math.round(y.mm)),
    roof: agreeList(ra.roof, rb.roof, (x, y) => x.kind === y.kind && sameText(x.value, y.value)),
    zones: agreeList(ra.zones, rb.zones, (x, y) => x.kind === y.kind && sameText(x.value, y.value)),
    rooms: agreeList(ra.rooms, rb.rooms, (x, y) => sameText(x.name, y.name) && sameText(x.finishes, y.finishes)),
    legend: agreeList(ra.legend, rb.legend, (x, y) => x.meaning === y.meaning && sameText(x.label, y.label)),
    consent: agreeList(ra.consent, rb.consent, (x, y) => x.kind === y.kind && sameText(x.text, y.text)),
    by_others: agreeList(ra.by_others, rb.by_others, (x, y) => sameText(x.item, y.item)),
    conflicts: [],
  };
  const openings = agreeList(a.openings, b.openings, (x, y) => x.mark === y.mark && x.kind === y.kind && x.width_mm === y.width_mm && x.height_mm === y.height_mm && x.count === y.count);
  const sheet = a.sheet && b.sheet && sameText(`${a.sheet.id} ${a.sheet.title}`, `${b.sheet.id} ${b.sheet.title}`) ? a.sheet : null;
  const count = (r: SheetReading) => r.specs.length + r.heights.length + r.roof.length + r.zones.length + r.rooms.length + r.legend.length + r.consent.length + r.by_others.length;
  const kept = count(reading) + openings.length;
  const offered = Math.max(count(ra) + a.openings.length, count(rb) + b.openings.length);
  return { agreed: { reading, sheet, openings }, kept, dropped: Math.max(0, offered - kept) };
}
