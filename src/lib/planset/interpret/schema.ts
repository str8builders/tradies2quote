// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — what the AI may say about a sheet (types + JSON schema).
//
// The AI READS: it never measures or calculates. Every item it returns must
// cite the ids of the text runs it read it from (the numbered list we send
// with the page); verify.ts drops anything whose value isn't in those runs.
// ─────────────────────────────────────────────────────────────────────────

export const SPEC_TOPICS = [
  "framing_timber",
  "stud_spacing",
  "nogs",
  "top_plates",
  "bottom_plate_fixing",
  "lintels",
  "wall_underlay",
  "cavity",
  "cladding",
  "cladding_fixings",
  "roofing",
  "roof_underlay",
  "roof_framing",
  "ceiling_framing",
  "insulation_walls",
  "insulation_ceiling",
  "insulation_floor",
  "lining_walls",
  "lining_ceilings",
  "lining_wet_areas",
  "floor_system",
  "slab_thickness",
  "slab_reinforcing",
  "slab_insulation",
  "subfloor",
  "decking",
  "joinery",
  "glazing",
  "flashings",
  "fixings",
  "bracing",
  "finishes",
  "other",
] as const;
export type SpecTopic = (typeof SPEC_TOPICS)[number];

export const HEIGHT_KINDS = ["stud_height", "ceiling_height", "floor_level", "ridge_height", "top_plate_height", "other"] as const;
export const ZONE_KINDS = ["wind", "earthquake", "exposure", "snow", "climate", "rainfall", "other"] as const;
export const ROOF_KINDS = ["pitch_deg", "material", "profile", "gutter", "fascia", "downpipes", "other"] as const;
export const CONSENT_KINDS = ["inspection", "document", "condition"] as const;

export type Cited = { text_ids: number[] };
export type SheetReading = {
  specs: Array<Cited & { topic: SpecTopic; value: string }>;
  heights: Array<Cited & { kind: (typeof HEIGHT_KINDS)[number]; mm: number; where: string }>;
  roof: Array<Cited & { kind: (typeof ROOF_KINDS)[number]; value: string }>;
  zones: Array<Cited & { kind: (typeof ZONE_KINDS)[number]; value: string }>;
  rooms: Array<Cited & { name: string; finishes: string; wet: boolean }>;
  legend: Array<Cited & { meaning: "existing_to_remain" | "to_be_removed" | "new_work" | "other"; label: string }>;
  consent: Array<Cited & { kind: (typeof CONSENT_KINDS)[number]; text: string }>;
  by_others: Array<Cited & { item: string }>;
  conflicts: Array<Cited & { issue: string }>;
};

const ids = { type: "array", items: { type: "integer" } } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const list = (item: Record<string, unknown>) => ({ type: "array", items: obj(item) });

/** JSON schema for structured outputs (`output_config.format`). */
export const SHEET_READING_SCHEMA = obj({
  specs: list({ topic: { type: "string", enum: [...SPEC_TOPICS] }, value: { type: "string" }, text_ids: ids }),
  heights: list({ kind: { type: "string", enum: [...HEIGHT_KINDS] }, mm: { type: "number" }, where: { type: "string" }, text_ids: ids }),
  roof: list({ kind: { type: "string", enum: [...ROOF_KINDS] }, value: { type: "string" }, text_ids: ids }),
  zones: list({ kind: { type: "string", enum: [...ZONE_KINDS] }, value: { type: "string" }, text_ids: ids }),
  rooms: list({ name: { type: "string" }, finishes: { type: "string" }, wet: { type: "boolean" }, text_ids: ids }),
  legend: list({ meaning: { type: "string", enum: ["existing_to_remain", "to_be_removed", "new_work", "other"] }, label: { type: "string" }, text_ids: ids }),
  consent: list({ kind: { type: "string", enum: [...CONSENT_KINDS] }, text: { type: "string" }, text_ids: ids }),
  by_others: list({ item: { type: "string" }, text_ids: ids }),
  conflicts: list({ issue: { type: "string" }, text_ids: ids }),
});

export const EMPTY_READING: SheetReading = { specs: [], heights: [], roof: [], zones: [], rooms: [], legend: [], consent: [], by_others: [], conflicts: [] };
