// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — what kind of sheet is this? (pure).
//
// A consented set holds 20–60 pages: a cover, a drawing index, site plan,
// floor plans, elevations, sections, schedules, details, an engineer's
// notes, and the council's paperwork. Every later stage needs to know which
// pages to read (the dimensioned floor plans) and which to leave alone.
//
// The sheet's own title decides, because the drawer wrote it and the
// council approved it: title first, then the name the drawing index gives
// it, and only when both are missing the page's own words. Precedence is
// spelled out in the rules below — a "Dimension Plan" is not a "Floor
// Plan", "Foundation Details" is not a "Foundation Plan", a "Bracing
// Plan" is not "Details". Nothing here guesses a building name that isn't
// printed: the building is the word(s) written in front of the plan type
// ("COTTAGE GROUND FLOOR PLAN"), and only for plan-type sheets.
// ─────────────────────────────────────────────────────────────────────────

import type { SheetRaw } from "../types";

export type SheetKind =
  | "cover"
  | "index"
  | "notes"
  | "site_plan"
  | "floor_plan"
  | "dimension_plan"
  | "foundation_plan"
  | "bracing_plan"
  | "framing_plan"
  | "lintel_plan"
  | "roof_plan"
  | "roof_framing_plan"
  | "ceiling_plan"
  | "elevations"
  | "sections"
  | "details"
  | "window_schedule"
  | "door_schedule"
  | "schedule"
  | "wet_areas"
  | "kitchen_bathroom"
  | "electrical_plan"
  | "plumbing_drainage"
  | "landscape"
  | "structural_notes"
  | "structural_plan"
  | "structural_details"
  | "consent_document"
  | "specification"
  | "calculations"
  | "other";

export type Classification = {
  kind: SheetKind;
  /** Building / unit name printed in front of the plan type, or null. */
  building: string | null;
  /** "ground", "first", "second", "upper", "basement", "level 3" … when stated. */
  level: string | null;
  /** 0–1. Title match ≈ 0.9, index-name only ≈ 0.85, page words ≈ 0.5, unknown 0. */
  confidence: number;
  /** Why, in words, for the evidence trail. */
  basis: string[];
};

/** Plan-type kinds — the ones a building name in front of the title belongs to. */
const PLAN_KINDS: ReadonlySet<SheetKind> = new Set<SheetKind>([
  "floor_plan",
  "dimension_plan",
  "foundation_plan",
  "bracing_plan",
  "framing_plan",
  "lintel_plan",
  "roof_plan",
  "roof_framing_plan",
  "ceiling_plan",
  "elevations",
  "sections",
  "structural_plan",
  "electrical_plan",
  "plumbing_drainage",
]);

/** Lowercase, "&"→"and", separators to spaces, en dashes to hyphens. */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[–—]/g, "-")
    .replace(/[_/\\|,;:()[\]]+/g, " ")
    .replace(/[^a-z0-9\-.' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── kind from words ─────────────────────────────────────────────────────

type Hit = { kind: SheetKind; why: string; /** A weak reading (a bare "plan"): lower confidence. */ soft?: boolean };

/**
 * Classify one line of words (a sheet title or an index name).
 * `structural` says the page itself reads as an engineer's sheet, which
 * only decides "notes" / "details" / bare "plan" — never the plan types.
 */
function kindFromWords(s: string, structural: boolean): Hit | null {
  if (!s) return null;
  const has = (re: RegExp) => re.test(s);
  const hit = (kind: SheetKind, why: string, soft = false): Hit => (soft ? { kind, why, soft } : { kind, why });

  // ── whole-sheet types
  if (
    has(/\b(?:drawing|sheet|structural drawing|architectural drawing|drawings) (?:list|index|register)\b/) ||
    has(/\b(?:index|list|schedule) of drawings\b|\bdrawing index\b/)
  ) {
    return hit("index", "a list of the drawings");
  }
  if (has(/\b(?:cover|title|front) (?:sheet|page)\b/) || /^cover$/.test(s)) return hit("cover", "cover sheet");
  if (has(/\bcalcs?\b|\bcalculations?\b/)) return hit("calculations", "calculations");
  if (
    has(/\b(?:form 5|producer statement|code compliance|compliance schedule|consent conditions|building consent|inspections?)\b/) ||
    has(/\bps ?[1-4]\b/)
  ) {
    return hit("consent_document", "consent paperwork");
  }

  // ── topics that own the sheet whatever the form word (plan / details / layout)
  if (has(/\bwet ?areas?\b/)) return hit("wet_areas", "wet areas");
  if (has(/\b(?:electrical|lighting|switchboard|power and lighting)\b/)) return hit("electrical_plan", "electrical");
  if (has(/\b(?:plumbing|drainage|drainlaying|stormwater|storm water|sewer|sanitary|hydraulic)\b/)) {
    return hit("plumbing_drainage", "plumbing / drainage");
  }
  if (has(/\blandscap(?:e|ing)\b|\bplanting\b/)) return hit("landscape", "landscape");
  if (
    has(/\b(?:kitchens?|bathrooms?|laundry|ensuite|vanit(?:y|ies)|joinery layout)\b/) &&
    !has(/\b(?:floor|roof|foundation|elevations?|sections?|schedule)\b/)
  ) {
    return hit("kitchen_bathroom", "kitchen / bathroom layout");
  }

  // ── schedules
  if (has(/\bschedules?\b/)) {
    const win = has(/\bwindows?\b|\bglazing\b/);
    const door = has(/\bdoors?\b/);
    if (win && !door) return hit("window_schedule", "window schedule");
    if (door && !win) return hit("door_schedule", "door schedule");
    return hit("schedule", "schedule");
  }

  // ── views
  if (has(/\belevations?\b/)) return hit("elevations", "elevations");
  if (has(/\b(?:sections?|x-?section|cross-?section)\b/)) return hit("sections", "sections");

  // ── details (foundation DETAILS is not a foundation PLAN)
  if (has(/\bdetails?\b|\bdetailing\b/)) {
    return structural || has(/\bstructural\b/)
      ? hit("structural_details", "structural details")
      : hit("details", "details");
  }

  // ── plan family, most specific first
  if (has(/\bdimension(?:ed|s)?\b/) && has(/\bplans?\b|\blayout\b/)) return hit("dimension_plan", "dimension plan");
  if (has(/\b(?:foundations?|piles?|slab|sub-?floor|footings?)\b/)) return hit("foundation_plan", "foundation / piles");
  if (has(/\bbrac(?:e|es|ing)\b/)) {
    return has(/\bplans?\b|\blayout\b/) || /^(?:wall |roof |sub-?floor )?bracing$/.test(s)
      ? hit("bracing_plan", "bracing plan")
      : hit("details", "brace details");
  }
  if (has(/\blintels?\b/)) {
    return has(/\bplans?\b|\bfixings\b|\blayout\b/) ? hit("lintel_plan", "lintel plan") : hit("details", "lintel details");
  }
  if (has(/\broof\b.*\b(?:framing|truss|trusses|rafters?)\b|\b(?:truss|trusses)\b.*\b(?:layout|plan)\b/)) {
    return hit("roof_framing_plan", "roof framing");
  }
  if (has(/\bdiaphragm\b/)) return hit("framing_plan", "roof diaphragm plan");
  if (has(/\bceiling\b/)) return hit("ceiling_plan", "ceiling plan");
  if (has(/\broof(?:ing)?\b/) && has(/\bplans?\b|\blayout\b/)) return hit("roof_plan", "roof plan");
  if (has(/\bframing\b/) && has(/\bplans?\b|\blayout\b/)) return hit("framing_plan", "framing plan");
  if (has(/\bfloor(?:s| plans?)?\b/) && has(/\bplans?\b|\blayout\b/)) return hit("floor_plan", "floor plan");
  if (has(/\b(?:master plan|location plan|site|boundary|boundaries|retaining|erosion|sediment)\b/)) {
    return hit("site_plan", "site plan");
  }
  if (has(/\b(?:structural|beam|steel)\b/) && has(/\bplans?\b|\blayout\b/)) return hit("structural_plan", "structural plan");
  // Nouns that only ever title a details sheet.
  if (has(/\b(?:penetrations?|flashings?|junctions?|cladding|tiles?|tiling|joinery|glazing|connections?|fixings?)\b/)) {
    return hit("details", "details of an element");
  }
  if (has(/\bnotes?\b/)) return hit(structural || has(/\bstructural\b/) ? "structural_notes" : "notes", "notes");
  if (has(/\bspecifications?\b/)) return hit("specification", "specification");
  if (has(/\bplans?\b/)) return hit("floor_plan", "a bare 'plan'", true);
  return null;
}

// ── level and building ──────────────────────────────────────────────────

const LEVEL_WORDS: Array<[RegExp, string]> = [
  [/\bbasement\b/, "basement"],
  [/\b(?:ground|gnd)\s*(?:floor|level|fl)\b/, "ground"],
  [/\b(?:first|1st)\s*(?:floor|level|fl)\b/, "first"],
  [/\b(?:second|2nd)\s*(?:floor|level|fl)\b/, "second"],
  [/\b(?:third|3rd)\s*(?:floor|level|fl)\b/, "third"],
  [/\b(?:fourth|4th)\s*(?:floor|level|fl)\b/, "fourth"],
  [/\bmezzanine\b/, "mezzanine"],
  [/\bupper\s*(?:floor|level|storey|story)?\b/, "upper"],
  [/\blower\s*(?:floor|level|storey|story)?\b/, "lower"],
];

function levelOf(s: string): string | null {
  for (const [re, name] of LEVEL_WORDS) if (re.test(s)) return name;
  const m = s.match(/\blevel\s*(\d{1,2})\b/);
  return m ? `level ${Number(m[1])}` : null;
}

/** Words that name a plan type — the building name is what stands in front of them. */
const PLAN_WORDS = new Set([
  "floor", "floors", "roof", "roofing", "foundation", "foundations", "bracing", "brace", "framing", "ceiling", "elevation",
  "elevations", "section", "sections", "plan", "plans", "layout", "diaphragm", "lintel", "lintels", "site", "dimension",
  "dimensions", "dimensioned", "pile", "piles", "electrical", "plumbing", "drainage", "structural", "beam", "steel", "slab",
  "details", "detail", "schedule",
]);

/** The words that state a level. */
const LEVEL_TOKENS = new Set(["ground", "gnd", "first", "second", "third", "fourth", "1st", "2nd", "3rd", "4th", "upper", "lower", "basement", "mezzanine", "level", "floor", "storey", "story"]);

/** Words that are never a building's name. */
const GENERIC = new Set([
  "ground", "gnd", "first", "second", "third", "fourth", "1st", "2nd", "3rd", "4th", "upper", "lower", "basement", "mezzanine",
  "level", "levels", "floor", "storey", "story", "proposed", "existing", "new", "old", "demolition", "demo", "alteration",
  "alterations", "addition", "additions", "final", "typical", "standard", "general", "overall", "main", "whole", "total",
  "building", "buildings", "house", "dwelling", "home", "residence", "and", "the", "of", "for", "to", "a", "an", "at", "in",
  "exterior", "interior", "external", "internal", "wall", "walls", "door", "doors", "window", "windows", "kitchen",
  "bathroom", "laundry", "wet", "area", "areas", "lintel", "lintels", "fixings", "fixing", "roof", "site", "levels",
  "retaining", "foundation", "foundations", "bracing", "framing", "ceiling", "structural", "architectural", "engineering",
  "eng", "arch", "sheet", "sheets", "drawing", "drawings", "part", "detail", "details", "portico", "cladding", "plumbing",
  "drainage", "electrical", "lighting", "power", "underfloor", "subfloor", "sub-floor", "concept", "preliminary", "draft",
  "reflected", "internal", "insulation", "stage", "revised",
]);

/**
 * The building / unit written in front of the plan type, or null. Only the
 * original spelling is returned (the caller passes the un-normalised text
 * so the printed case survives).
 */
function buildingOf(raw: string): string | null {
  const printed = raw.replace(/[–—]/g, "-").replace(/&/g, " & ").replace(/\s+/g, " ").trim();
  const words = printed.split(" ");
  let stop = words.findIndex((w) =>
    w
      .toLowerCase()
      .replace(/[^a-z-]/g, "")
      .split("-")
      .some((part) => PLAN_WORDS.has(part)),
  );
  if (stop < 0) stop = words.length;
  const front = words
    .slice(0, stop)
    .map((w) => w.replace(/^[-:,.]+|[-:,.]+$/g, ""))
    .filter((w) => w !== "" && w !== "-" && w !== "&");
  // Level words ("ground", "first", "level 2", "1st") are the level, not the building.
  const named: string[] = [];
  for (let i = 0; i < front.length; i++) {
    const w = front[i].toLowerCase();
    if (LEVEL_TOKENS.has(w)) continue;
    if (/^\d+$/.test(w) && i > 0 && front[i - 1].toLowerCase() === "level") continue;
    named.push(front[i]);
  }
  // "UNIT 2", "Block B", "Lot 12" name a building outright.
  const unit = named.join(" ").match(/(?:^|\s)((?:unit|block|lot|villa|cabin|flat|building|bldg)\s+[A-Za-z0-9]{1,3})$/i);
  if (unit) return unit[1];
  const kept = named.filter((w) => !GENERIC.has(w.toLowerCase()));
  if (kept.length === 0 || kept.length > 3) return null;
  const name = kept.join(" ");
  // A lone number or a lone letter is a sheet part, not a building.
  if (/^[\d\W]+$/.test(name) || kept.join("").length < 3) return null;
  if (kept.every((w) => /^[A-Za-z][A-Za-z'’-]{2,}$/.test(w)) && !/^(?:unit|block|lot|villa|cabin|flat)$/i.test(name)) return name;
  return null;
}

// ── the page's own words ────────────────────────────────────────────────

/** Markers that only an engineer's sheet is full of. */
const STRUCTURAL_MARKERS =
  /\b(?:structural engineer|engineer'?s?|nzs ?(?:3404|3101|3603|3109|1170|4671)|reinforc\w*|concrete|rebar|weld(?:ed|ing|s)?|dowels?|sg8|lvl|glulam|gl ?\d{1,2}|shs|rhs|pfc|\d{2,3}ub\d{2}|hold.?downs?|diaphragm|portals?|base ?plates?|grout|footings?|bearers?)\b/g;

/** How many engineering words the page carries, and how many words it carries. */
function structuralScore(sheet: SheetRaw): { hits: number; words: number } {
  let hits = 0;
  let words = 0;
  for (const t of sheet.text) {
    const s = t.s.toLowerCase();
    words += 1;
    const m = s.match(STRUCTURAL_MARKERS);
    if (m) hits += m.length;
  }
  return { hits, words };
}

/**
 * True when the page reads as an engineer's sheet: dense with engineering
 * words (an architect's notes page mentions the engineer too, but at half
 * the density). The sheet number's discipline letter (S…) is a better hint
 * and is passed in by the register when it knows it.
 */
function isStructuralPage(sheet: SheetRaw): boolean {
  const { hits, words } = structuralScore(sheet);
  return hits >= 20 && hits / Math.max(1, words) >= 0.1;
}

type ContentRule = { kind: SheetKind; re: RegExp };
const CONTENT_RULES: ContentRule[] = [
  { kind: "dimension_plan", re: /\bdimension(?:ed)? plan\b/ },
  { kind: "floor_plan", re: /\b(?:ground |first |second |proposed |existing |new )?floor plan\b/ },
  { kind: "roof_framing_plan", re: /\broof framing plan\b|\btruss layout\b/ },
  { kind: "roof_plan", re: /\broof plan\b/ },
  { kind: "foundation_plan", re: /\bfoundation plan\b|\bpile plan\b|\bslab plan\b|\bsub-?floor plan\b/ },
  { kind: "bracing_plan", re: /\bbracing plan\b|\bbracing layout\b/ },
  { kind: "lintel_plan", re: /\blintel(?:s)? (?:and fixings )?plan\b/ },
  { kind: "ceiling_plan", re: /\bceiling (?:plan|framing plan)\b/ },
  { kind: "site_plan", re: /\bsite plan\b|\bmaster plan\b|\bsite levels\b|\bsite setout\b/ },
  { kind: "elevations", re: /\belevations?\b/ },
  { kind: "sections", re: /\bsection [a-z]{1,2}(?:-| )?[a-z]{0,2}\b|\bsections\b/ },
  { kind: "window_schedule", re: /\bwindow schedule\b/ },
  { kind: "door_schedule", re: /\bdoor schedule\b/ },
  { kind: "schedule", re: /\bschedule of\b|\bfinishes schedule\b/ },
  { kind: "electrical_plan", re: /\belectrical plan\b|\blighting plan\b/ },
  { kind: "plumbing_drainage", re: /\bdrainage plan\b|\bplumbing plan\b/ },
  { kind: "index", re: /\bdrawing (?:index|list)\b|\bdrawing register\b/ },
  { kind: "details", re: /\bdetails?\b/ },
  { kind: "notes", re: /\bgeneral notes\b|\bnotes and specifications?\b/ },
];

/** A cross-reference or a sentence, not a drawing's own label: "REFER TO S350 FOR DETAILS", "roof framing weather exposed". */
const MENTION = /\b(?:refer|see|as per|per|shown|shall|must|should|to be|are|is|in the|on the|of the|for the)\b|[.,;:]$/;

/** Classify from what the page says when nothing titles it. */
function kindFromContent(sheet: SheetRaw, structural: boolean): { kind: SheetKind; score: number; why: string } | null {
  // A page headed "Drawing Index" is the index, whatever the names it lists say (those are other sheets').
  const heading = sheet.text.find((t) => /^(?:drawing|sheet|structural drawing) (?:index|list|register)$/.test(norm(t.s)));
  if (heading) return { kind: "index", score: 6, why: `page text says "${heading.s.slice(0, 40)}"` };
  const sizes = sheet.text.map((t) => t.h).sort((a, b) => a - b);
  // The body text size (a low percentile, so a page of a few big labels still has a "body" to compare with).
  const median = sizes[Math.floor(sizes.length * 0.4)] ?? 0;
  const score = new Map<SheetKind, number>();
  const seen = new Map<SheetKind, string>();
  for (const t of sheet.text) {
    const s = norm(t.s);
    if (!s) continue;
    const words = s.split(" ").length;
    for (const rule of CONTENT_RULES) {
      if (!rule.re.test(s)) continue;
      // A drawing's own label is short and set bigger than the notes around it; a mention in a note is worth almost nothing.
      let weight = 0.3;
      if (words <= 8 && !MENTION.test(s)) weight = median > 0 && t.h >= 1.3 * median ? 3 : 1;
      score.set(rule.kind, (score.get(rule.kind) ?? 0) + weight);
      if (!seen.has(rule.kind)) seen.set(rule.kind, t.s.slice(0, 40));
      // The first matching rule wins for this line: the list runs most specific → least.
      break;
    }
  }
  const ranked = [...score].sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0] ?? [null, 0];
  const second = ranked[1]?.[1] ?? 0;
  // Unsure when nothing stands out, or when two kinds are nearly tied (a sheet that draws a plan and its elevations).
  if (best === null || bestScore < 3 || bestScore < 1.5 * second) return null;
  let kind: SheetKind = best;
  if (structural && kind === "details") kind = "structural_details";
  if (structural && kind === "notes") kind = "structural_notes";
  return { kind, score: bestScore, why: `page text says "${seen.get(best)}"` };
}

// ── public ──────────────────────────────────────────────────────────────

export function classifySheet(input: {
  title: string | null;
  indexName: string | null;
  sheet: SheetRaw;
  document: boolean;
  /** Optional: the caller knows the sheet is (true) or is not (false) an engineer's, e.g. from an "S101" sheet number. */
  structural?: boolean;
}): Classification {
  const { title, indexName, sheet, document } = input;
  const nTitle = norm(title);
  const nIndex = norm(indexName);
  const basis: string[] = [];

  if (document) {
    const words = `${nTitle} ${nIndex}`;
    if (/\bspecifications?\b/.test(words)) {
      basis.push("consent paperwork: specification");
      return { kind: "specification", building: null, level: null, confidence: 0.7, basis };
    }
    if (/\bcalcs?\b|\bcalculations?\b/.test(words)) {
      basis.push("consent paperwork: calculations");
      return { kind: "calculations", building: null, level: null, confidence: 0.7, basis };
    }
    basis.push("a document page (consent paperwork, not a drawing)");
    return { kind: "consent_document", building: null, level: null, confidence: 0.8, basis };
  }

  // "Structural" only refines notes / details; it is read from the page only when a title exists to refine.
  const structural = input.structural ?? (nTitle || nIndex ? isStructuralPage(sheet) : false);
  const fromTitle = kindFromWords(nTitle, structural);
  const fromIndex = kindFromWords(nIndex, structural);

  let kind: SheetKind = "other";
  let confidence = 0;
  let source: string | null = null;
  if (fromTitle) {
    kind = fromTitle.kind;
    confidence = fromTitle.soft ? 0.6 : 0.9;
    source = title;
    basis.push(`title "${title}" → ${fromTitle.why}`);
    if (fromIndex && fromIndex.kind === fromTitle.kind) {
      confidence = fromTitle.soft ? 0.7 : 0.95;
      basis.push(`the drawing index agrees: "${indexName}"`);
    } else if (fromIndex) {
      basis.push(`the drawing index names it "${indexName}" (${fromIndex.kind}); the title decides`);
    }
  } else if (fromIndex) {
    kind = fromIndex.kind;
    confidence = fromIndex.soft ? 0.55 : 0.85;
    source = indexName;
    basis.push(`drawing index name "${indexName}" → ${fromIndex.why}`);
  } else {
    const content = kindFromContent(sheet, isStructuralPage(sheet));
    if (content) {
      kind = content.kind;
      confidence = content.score >= 6 ? 0.55 : 0.4;
      basis.push(content.why);
    } else {
      basis.push(nTitle || nIndex ? `no rule for "${title ?? indexName}"` : "no title and nothing on the page names its type");
    }
  }

  // Level from whichever name said something; building only from plan-type sheets.
  const level = levelOf(nTitle) ?? levelOf(nIndex);
  let building: string | null = null;
  if (PLAN_KINDS.has(kind) && source) building = buildingOf(source);
  else if (PLAN_KINDS.has(kind) && indexName) building = buildingOf(indexName);
  if (building) basis.push(`building "${building}" is written in front of the plan type`);
  if (level) basis.push(`level: ${level}`);

  return { kind, building, level, confidence, basis };
}

/** Whole-word check the register uses to give a building name to details sheets that mention it. */
export function mentionsBuilding(text: string | null | undefined, building: string): boolean {
  if (!text) return false;
  const escaped = building.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i").test(text);
}
