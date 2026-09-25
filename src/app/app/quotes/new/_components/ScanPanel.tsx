"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Receipt,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { FloorPlanSvg } from "@/lib/floorPlanSvg";
import { TapeMeasureProgress } from "@/app/app/_components/TapeMeasureProgress";
import { needsPrep, prepareScanImage } from "@/lib/scanImage";
import {
  MAX_SCAN_UPLOAD_BYTES,
  SCAN_IMAGE_ACCEPT,
  detectImageMime,
  isPreparedScanMime,
  isSupportedScanInput,
  scanUploadSizeError,
} from "@/lib/imageUpload";
import type { ScannedPlan } from "@/lib/scan-drawing";
import {
  readDimension,
  readNumberTokens,
  readWallRunLine,
} from "@/lib/aiTakeoffParser";

type ScanState =
  | "idle"
  | "converting"
  | "uploading"
  | "review-dims"
  | "transcript"
  | "wrong-doc"
  | "error";

const JOB_TYPES = ["Deck", "Fence", "Framing", "Concrete", "Roofing", "Other"] as const;
export type JobType = (typeof JOB_TYPES)[number];

/**
 * How long the phone waits for /api/quotes/scan-drawing. The route allows up
 * to 140 s per model attempt plus one retry on 429/529, inside a 300 s
 * maxDuration — the client must never give up before the server does.
 */
export const SCAN_TIMEOUT_MS = 300_000;
/** After this long, say plainly that a big plan takes a while. */
export const SCAN_SLOW_NOTICE_MS = 30_000;
export const SCAN_SLOW_NOTICE =
  "Still reading the drawing — large plans can take a couple of minutes.";

const TIMBER_LENGTH_DEFAULT = 6;
const TIMBER_LENGTH_MIN = 2.4;
const TIMBER_LENGTH_MAX = 7.2;

export interface ScanResult {
  buildType: string;
  summary: string;
  dimensions: string;
  structural: string;
  notes: string;
  plan: ScannedPlan | null;
  documentType: "drawing" | "supplier_quote" | "other";
  // Structure type the AI read off the DRAWING — the source of truth for
  // the calculator marker and the "Job type:" line. The user's selection
  // is only a hint passed to the scan; this is what actually shows.
  detectedType: JobType;
}

/**
 * Map the scan UI's six job-type buttons to the takeoff calculator's
 * canonical types. Anything that doesn't have a calculator (Fence,
 * Concrete, Roofing, Other) gets undefined and we skip the marker —
 * the AI fallback handles those.
 */
function planTypeForJob(
  jobType: JobType,
  buildType: string,
): "deck" | "subfloor" | "cladding" | "wall" | undefined {
  if (jobType === "Deck") return "deck";
  if (jobType === "Framing") {
    const bt = buildType.toLowerCase();
    if (bt.includes("subfloor") || bt.includes("floor framing")) return "subfloor";
    if (bt.includes("cladding") || bt.includes("weatherboard")) return "cladding";
    return "wall";
  }
  return undefined;
}

function buildPlanMarker(
  planType: "deck" | "subfloor" | "cladding" | "wall",
  plan: ScannedPlan,
  editedFields: readonly PlanField[] = [],
): string {
  const parts = [`type=${planType}`];
  // Enforce NZ convention: length ≥ width. The deck calculator runs
  // joists across the width and decking along the length, so swapping
  // them silently produces a slightly different joist count. The
  // extractRectangle helper already enforces this for prose-scanned
  // dims; do the same for the marker.
  if (plan.length_m > 0 && plan.width_m > 0) {
    const lengthM = Math.max(plan.length_m, plan.width_m);
    const widthM = Math.min(plan.length_m, plan.width_m);
    parts.push(`length_m=${lengthM}`);
    parts.push(`width_m=${widthM}`);
  } else {
    if (plan.length_m > 0) parts.push(`length_m=${plan.length_m}`);
    if (plan.width_m > 0) parts.push(`width_m=${plan.width_m}`);
  }
  // Composite/primitive footprints carry a deterministically-computed area
  // (L-shape, triangle, …). Pass it through so area-based calculators use the
  // true figure instead of length×width of the bounding box.
  if (plan.area_m2 && plan.area_m2 > 0 && plan.shape_label) {
    parts.push(`area_m2=${plan.area_m2}`);
  }
  if (plan.height_m && plan.height_m > 0) {
    parts.push(`height_m=${plan.height_m}`);
  }
  if (plan.joist_spacing_mm && plan.joist_spacing_mm > 0) {
    parts.push(`joist_spacing_mm=${plan.joist_spacing_mm}`);
  }
  if (plan.post_count && plan.post_count > 0) {
    parts.push(`post_count=${plan.post_count}`);
  }
  if (plan.post_spacing_m && plan.post_spacing_m > 0) {
    parts.push(`post_spacing_m=${plan.post_spacing_m}`);
  }
  // Wave 44 — whole-drawing wall totals. For a wall/framing job the
  // calculator must run off the TOTAL wall run (every exterior + interior
  // wall summed), not the bounding-box edge in length_m. These fields are
  // only present on multi-room floor plans; older plans omit them and the
  // downstream parser keeps using length_m as before.
  if (plan.wall_run_m && plan.wall_run_m > 0) {
    parts.push(`wall_run_m=${plan.wall_run_m}`);
  }
  // Exterior (perimeter) wall run, when the AI could split it off the drawing.
  // Lets the wall calculator size insulation off exterior walls only. Absent →
  // insulation stays review-required (no exterior/interior guess).
  if (plan.exterior_wall_run_m && plan.exterior_wall_run_m > 0) {
    parts.push(`exterior_wall_run_m=${plan.exterior_wall_run_m}`);
  }
  if (plan.stud_spacing_mm && plan.stud_spacing_mm > 0) {
    parts.push(`stud_spacing_mm=${plan.stud_spacing_mm}`);
  }
  if (plan.door_count && plan.door_count > 0) {
    parts.push(`door_count=${plan.door_count}`);
  }
  if (plan.window_count && plan.window_count > 0) {
    parts.push(`window_count=${plan.window_count}`);
  }
  // Fields the tradie corrected on the review screen: the takeoff treats
  // these as the tradie's own numbers (the loose DIMENSIONS-text
  // cross-check never overrides them) and says so in the quote notes.
  if (editedFields.length > 0) {
    parts.push(`edited=${editedFields.join(",")}`);
  }
  return "[T2Q_PLAN] " + parts.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────
// Tradie corrections → plan marker.
//
// The review screen promises "edit any number we got wrong — the materials
// list will use these". The takeoff reads the [T2Q_PLAN] marker FIRST, so a
// correction only reaches the quantities if it is written into the marker.
// It used to be built from the AI's plan alone: a wall run corrected 40 → 52 m
// still framed 40 m, and a deck width corrected 4.8 → 5.4 m (under the
// parser's 25% cross-check) stayed 4.8 m.
//
// applyDimensionEdits diffs the tradie's text against what the scan showed,
// works out which plan field each changed line describes (its label first —
// "Deck width", "TOTAL WALL RUN", "Studs at … centres", "Doors: 4" — else by
// matching the old number to the plan's length / width) and writes the new
// number in, whatever the size of the change. Lines about something else
// (stairs, posts, rooms…) never touch the plan. A correction that can't be
// right (a 54 m deck side) clears the field instead, so the takeoff flags it
// for review rather than quoting either number.
// ─────────────────────────────────────────────────────────────────────────

type PlanField =
  | "length_m"
  | "width_m"
  | "height_m"
  | "wall_run_m"
  | "exterior_wall_run_m"
  | "interior_wall_run_m"
  | "joist_spacing_mm"
  | "stud_spacing_mm"
  | "post_spacing_m"
  | "post_count"
  | "door_count"
  | "window_count";

export interface DimensionEdit {
  field: PlanField;
  from: number | null;
  /** null = the corrected value can't be right, so the field is cleared. */
  to: number | null;
  line: string;
}

type NumberToken = ReturnType<typeof readNumberTokens>[number];

type LineRole =
  | { role: "run"; field: "wall_run_m" | "exterior_wall_run_m" | "interior_wall_run_m" }
  | { role: "spacing"; field: "joist_spacing_mm" | "stud_spacing_mm" }
  | { role: "postSpacing" }
  | { role: "count"; field: "post_count" | "door_count" | "window_count" }
  | { role: "height" }
  | { role: "side"; field: "length_m" | "width_m" }
  | { role: "footprint"; labelled: boolean }
  | { role: "unlabelled" }
  | { role: "other" };

/** Plan footprint envelope — the same band the takeoff marker accepts. */
const PLAN_EDGE_MIN_M = 1;
const PLAN_EDGE_MAX_M = 30;

const SPACING_WORDS_RE =
  /(?:\b(?:centres?|centers?|crs|ctrs|cc|spacing|spaced|apart|at)\b|c\/c|@)/;
/** Labels for things that aren't the plan footprint / walls themselves. */
const OTHER_THING_RE =
  /\b(?:stairs?|steps?|landings?|treads?|risers?|bearers?|piles?|boards?|decking|rails?|handrails?|balustrades?|bench(?:es)?|ramps?|paths?|beams?|lintels?|rafters?|purlins?|battens?|nogs?|noggins?|dwangs?|plates?|sheets?|thick(?:ness)?|depth|deep|footings?|holes?|pads?|pitch|eaves?|soffits?|fascias?|gutters?|roof|fences?|gates?|openings?|rooms?|bed(?:room)?s?|bath(?:room)?s?|kitchens?|lounges?|living|dining|garages?|laundr(?:y|ies)|wc|toilets?|ensuites?|halls?|hallways?|robes?|wardrobes?|offices?|studys?|stud(?:y|ies)|decks? height|areas?|perimeters?|volumes?)\b/;
/** Words that only describe which edge a number is on. */
const EDGE_WORDS_RE =
  /\b(?:top|bottom|left|right|front|back|rear|sides?|edges?|north|south|east|west|approx(?:imately)?|about|overall|dimension|dims?|restated|in|metres|meters|mm|m|cm)\b/g;
const PRIMARY_LABEL_RE =
  /\b(?:overall|total|deck|floor|building|house|plan|footprint|outside|slab|bounding)\b/;
const PAIR_RE = /\d(?:\.\d+)?\s*(?:mm|cm|m)?\s*(?:x|×|by|\*)\s*\d/i;

function classifyDimensionLine(line: string): LineRole {
  const run = readWallRunLine(line);
  if (run) {
    return {
      role: "run",
      field:
        run.which === "exterior"
          ? "exterior_wall_run_m"
          : run.which === "interior"
            ? "interior_wall_run_m"
            : "wall_run_m",
    };
  }
  // The words left once the numbers are gone.
  let words = line.toLowerCase();
  for (const t of readNumberTokens(line).reverse()) {
    words = `${words.slice(0, t.index)} ${words.slice(t.index).replace(/^[\d.,]+\s*[a-z]*/, " ")}`;
  }
  const spacing = SPACING_WORDS_RE.test(words);
  if (/\bjoists?\b/.test(words)) {
    return spacing ? { role: "spacing", field: "joist_spacing_mm" } : { role: "other" };
  }
  if (/\bstuds?\b/.test(words) && spacing) {
    return { role: "spacing", field: "stud_spacing_mm" };
  }
  if (/\b(?:stud|wall|ceiling)\s+heights?\b/.test(words)) return { role: "height" };
  if (/\bposts?\b/.test(words)) {
    return spacing ? { role: "postSpacing" } : { role: "count", field: "post_count" };
  }
  if (/\bdoors?\b/.test(words)) return { role: "count", field: "door_count" };
  if (/\bwindows?\b/.test(words)) return { role: "count", field: "window_count" };
  if (OTHER_THING_RE.test(words)) return { role: "other" };
  if (/\b(?:height|high)\b/.test(words)) return { role: "height" };
  const primary = PRIMARY_LABEL_RE.test(words);
  if (PAIR_RE.test(line)) return { role: "footprint", labelled: primary };
  if (/\b(?:length|long)\b/.test(words)) return { role: "side", field: "length_m" };
  if (/\b(?:width|wide)\b/.test(words)) return { role: "side", field: "width_m" };
  const leftover = words
    .replace(EDGE_WORDS_RE, " ")
    .replace(/[^a-z]+/g, " ")
    .trim();
  return leftover ? { role: "other" } : { role: "unlabelled" };
}

function tokenMetres(t: NumberToken): number | undefined {
  return readDimension(t.num, t.unit, "length")?.value;
}

function sameToken(a: NumberToken, b: NumberToken): boolean {
  return (
    Number(a.num.replace(/,/g, "")) === Number(b.num.replace(/,/g, "")) &&
    (a.unit ?? "").toLowerCase() === (b.unit ?? "").toLowerCase()
  );
}

/** Index of the last number the tradie changed on this line, if any. */
function changedIndex(orig: NumberToken[] | null, edit: NumberToken[]): number | undefined {
  if (edit.length === 0) return undefined;
  if (!orig || orig.length !== edit.length) return edit.length - 1;
  let last: number | undefined;
  for (let i = 0; i < edit.length; i++) {
    if (!sameToken(orig[i], edit[i])) last = i;
  }
  return last;
}

function nearly(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.01, 0.005 * Math.max(a, b));
}

/** Which footprint side (length_m / width_m) an old number was, by value. */
function sideByValue(
  plan: ScannedPlan | null,
  metres: number | undefined,
  claimed: Set<PlanField>,
): "length_m" | "width_m" | undefined {
  if (!plan || metres === undefined) return undefined;
  const hits = (["length_m", "width_m"] as const).filter(
    (f) => plan[f] > 0 && nearly(plan[f], metres),
  );
  // A square footprint matches both — take the one not already corrected
  // (orientation doesn't matter: the marker orders length ≥ width).
  return hits.find((f) => !claimed.has(f)) ?? hits[0];
}

function edgeOrNull(metres: number | undefined): number | null {
  return metres !== undefined && metres >= PLAN_EDGE_MIN_M && metres <= PLAN_EDGE_MAX_M
    ? metres
    : null;
}

/** The plan edits one changed (or added) line implies. */
function editsForLine(
  plan: ScannedPlan | null,
  orig: string | null,
  edit: string,
  claimed: Set<PlanField>,
): DimensionEdit[] {
  const role = classifyDimensionLine(edit);
  const before = (field: PlanField): number | null =>
    plan ? ((plan[field] as number | null) ?? null) : null;
  const one = (field: PlanField, to: number | null): DimensionEdit[] => {
    claimed.add(field);
    return [{ field, from: before(field), to, line: edit }];
  };

  if (role.role === "other") return [];

  if (role.role === "run") {
    const e = readWallRunLine(edit)?.run;
    if (!e) return [];
    const o = orig ? readWallRunLine(orig)?.run : undefined;
    let to = e.value;
    if (o && e.stated !== undefined && o.stated !== undefined && nearly(e.stated, o.stated)) {
      // Total left alone but the addends changed ("… + 12.0 = 40.0m"): the
      // corrected addends are the run.
      if (e.addendSum !== undefined && (o.addendSum === undefined || !nearly(e.addendSum, o.addendSum))) {
        to = e.addendSum;
      } else {
        return [];
      }
    }
    const plausible = readDimension(to, "m", "run")?.plausible ?? false;
    return one(role.field, plausible ? to : null);
  }

  const origTokens = orig ? readNumberTokens(orig) : null;
  const editTokens = readNumberTokens(edit);
  const i = changedIndex(origTokens, editTokens);
  if (i === undefined) return [];
  const t = editTokens[i];

  if (role.role === "spacing") {
    const r = readDimension(t.num, t.unit, "spacing");
    return one(role.field, r?.plausible ? r.value : null);
  }
  if (role.role === "postSpacing") {
    const r = readDimension(t.num, t.unit, "span");
    return one("post_spacing_m", r?.plausible ? r.value : null);
  }
  if (role.role === "count") {
    // A count is a plain whole number — "Door 820 x 1980" is a size.
    if (t.unit || PAIR_RE.test(edit)) return [];
    const n = Number(t.num);
    return Number.isInteger(n) && n >= 0 && n <= 200 ? one(role.field, n) : [];
  }
  if (role.role === "height") {
    const r = readDimension(t.num, t.unit, "height");
    return r ? one("height_m", r.value) : [];
  }
  if (role.role === "footprint") {
    const pair = editTokens.slice(0, 2).map(tokenMetres);
    const oldPair = (origTokens ?? []).slice(0, 2).map(tokenMetres);
    const matchesPlan =
      !!plan &&
      oldPair.length === 2 &&
      oldPair.every((v) => v !== undefined) &&
      ((nearly(oldPair[0]!, plan.length_m) && nearly(oldPair[1]!, plan.width_m)) ||
        (nearly(oldPair[0]!, plan.width_m) && nearly(oldPair[1]!, plan.length_m)));
    if (!role.labelled && !matchesPlan) return [];
    if (pair.length < 2 || pair.some((v) => v === undefined)) return [];
    const a = edgeOrNull(pair[0]);
    const b = edgeOrNull(pair[1]);
    if (a === null || b === null) return [...one("length_m", null), ...one("width_m", null)];
    return [
      ...one("length_m", Math.max(a, b)),
      ...one("width_m", Math.min(a, b)),
    ];
  }
  // A single footprint side: matched by its OLD value first (the scan's
  // labels don't always agree with the plan's length ≥ width order), then by
  // the line's label.
  const oldMetres = origTokens && origTokens.length === editTokens.length
    ? tokenMetres(origTokens[i])
    : undefined;
  const field =
    sideByValue(plan, oldMetres, claimed) ??
    (role.role === "side" ? role.field : undefined);
  if (!field) return [];
  return one(field, edgeOrNull(tokenMetres(t)));
}

function blankPlan(): ScannedPlan {
  return {
    shape: "other",
    width_m: 0,
    length_m: 0,
    regions: null,
    wall_run_m: null,
    exterior_wall_run_m: null,
    interior_wall_run_m: null,
    wall_thickness_mm: null,
    stud_spacing_mm: null,
    door_count: null,
    window_count: null,
    area_m2: null,
    perimeter_m: null,
    shape_label: null,
    tri_base_m: null,
    tri_height_m: null,
    radius_m: null,
    trap_a_m: null,
    trap_b_m: null,
    trap_h_m: null,
    post_count: null,
    post_spacing_m: null,
    joist_spacing_mm: null,
    joist_orientation: null,
    height_m: null,
  };
}

/** Pair the scanned lines with the tradie's lines (LCS on their wording). */
function alignLines(a: string[], b: string[]): Array<[string | null, string]> {
  const shape = (line: string) =>
    line
      .toLowerCase()
      .replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g, "#")
      .replace(/\s+/g, " ");
  const sa = a.map(shape);
  const sb = b.map(shape);
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        sa[i] === sb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const pairs: Array<[string | null, string]> = [];
  let pendingA: string[] = [];
  let pendingB: string[] = [];
  // Unmatched lines between two anchors were rewritten in place — pair them
  // up in order; any extra edited lines are additions.
  const flush = () => {
    pendingB.forEach((line, k) => pairs.push([pendingA[k] ?? null, line]));
    pendingA = [];
    pendingB = [];
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (sa[i] === sb[j]) {
      flush();
      pairs.push([a[i], b[j]]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      pendingA.push(a[i++]);
    } else {
      pendingB.push(b[j++]);
    }
  }
  while (i < a.length) pendingA.push(a[i++]);
  while (j < b.length) pendingB.push(b[j++]);
  flush();
  return pairs;
}

/**
 * Write the tradie's corrections to the DIMENSIONS text into the scanned plan
 * (see the section comment above). Returns the plan untouched — the same
 * object — when nothing that maps onto the plan was changed.
 */
export function applyDimensionEdits(
  plan: ScannedPlan | null,
  original: string,
  edited: string,
): { plan: ScannedPlan | null; edits: DimensionEdit[] } {
  const lines = (t: string) =>
    t
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  const a = lines(original);
  const b = lines(edited);
  if (a.join("\n") === b.join("\n")) return { plan, edits: [] };

  const claimed = new Set<PlanField>();
  const edits: DimensionEdit[] = [];
  for (const [orig, edit] of alignLines(a, b)) {
    if (orig === edit) continue;
    edits.push(...editsForLine(plan, orig, edit, claimed));
  }
  if (edits.length === 0) return { plan, edits };

  const next: ScannedPlan = { ...(plan ?? blankPlan()) };
  for (const e of edits) {
    if (e.field === "length_m" || e.field === "width_m") next[e.field] = e.to ?? 0;
    else next[e.field] = e.to;
  }
  // A corrected footprint makes a composite shape's computed area stale.
  if (claimed.has("length_m") || claimed.has("width_m")) {
    if (next.shape_label) {
      next.area_m2 = null;
      next.perimeter_m = null;
      next.shape_label = null;
    }
  }
  // With no TOTAL line on screen, the total is exterior + interior — keep it
  // in step with a corrected split.
  const hasTotalLine = [...a, ...b].some(
    (l) => readWallRunLine(l)?.which === "total",
  );
  if (
    !hasTotalLine &&
    (claimed.has("exterior_wall_run_m") || claimed.has("interior_wall_run_m")) &&
    next.exterior_wall_run_m !== null &&
    next.interior_wall_run_m !== null
  ) {
    next.wall_run_m =
      Math.round((next.exterior_wall_run_m + next.interior_wall_run_m) * 100) / 100;
  }
  return { plan: next, edits };
}

export function buildFinalTranscript(
  jobType: JobType,
  timberLength: number,
  result: ScanResult,
  editedDimensions: string,
): string {
  const parts: string[] = [];

  // Wave 43 — structured markers at the very top. The parser reads
  // these BEFORE the loose text so the calculator gets the AI's
  // structured guess directly, not whatever first "X by Y" pattern
  // happens to appear in the prose. Skipping these on job types
  // without a calculator (Fence/Concrete/Roofing/Other) is fine —
  // the AI quote path handles those without a calculator anyway.
  const planType = planTypeForJob(jobType, result.buildType);
  // Every correction the tradie made to the dimensions goes into the marker.
  const reviewed = applyDimensionEdits(
    result.plan,
    result.dimensions,
    editedDimensions,
  );
  const editedFields = [
    ...new Set(reviewed.edits.filter((e) => e.to !== null).map((e) => e.field)),
  ];
  if (planType) {
    // Always emit the classified type marker so detectTakeoffType routes off the
    // AI's drawing classification — even when geometry failed to parse. Without
    // this, a house/wall scan with no readable dimensions fell through to loose
    // keyword matching, where the boilerplate word "decking" misrouted it to the
    // deck calculator. A type-only marker keeps it on the wall/framing path; the
    // downstream calculator then asks for the missing dimensions rather than
    // fabricating them.
    parts.push(
      reviewed.plan
        ? buildPlanMarker(planType, reviewed.plan, editedFields)
        : `[T2Q_PLAN] type=${planType}`,
    );
  }
  parts.push(`[T2Q_TIMBER] stock_length_m=${timberLength}`);

  parts.push(`Job type: ${jobType}.`);
  parts.push(
    // NB: do NOT mention "decking" here — this instruction is appended to every
    // scan transcript (wall, subfloor, cladding…), and a stray "decking" token
    // can misroute non-deck jobs to the deck calculator when no marker is read.
    `Tradie buys timber in ${timberLength}m lengths. Calculate board / stud / plate counts in whole ${timberLength}m lengths with a 10% waste factor.`,
  );
  if (result.buildType) {
    parts.push(`What is being built: ${result.buildType}.`);
  }
  if (editedDimensions.trim()) {
    parts.push("DIMENSIONS (tradie-confirmed):\n" + editedDimensions.trim());
  }
  if (result.structural.trim()) {
    parts.push("STRUCTURAL ELEMENTS & FIXINGS:\n" + result.structural.trim());
  }
  if (result.notes.trim()) {
    parts.push("NOTES & ASSUMPTIONS:\n" + result.notes.trim());
  }
  return parts.join("\n\n");
}

/** Plain words for the machine codes the scan route can answer with. */
const SCAN_ERROR_MESSAGES: Record<string, string> = {
  trial_expired: "Your free trial has ended. Subscribe to keep scanning drawings.",
  rate_limited:
    "You've hit today's drawing-scan limit. It resets at midnight UTC — get in touch if you need more.",
  ai_consent_required:
    "Turn on AI features to scan drawings. Open a new quote to review and enable it.",
  unauthorized: "Your session has expired. Sign in again to scan drawings.",
};

/**
 * Message shown to the tradie when the scan route answers with an error.
 * Known codes (`trial_expired`, …) get plain words; a sentence the route
 * wrote for people is shown as-is; anything else — an unknown code, a
 * server-configuration detail, an empty body — gets a generic message.
 * A raw code is never shown.
 */
export function scanErrorMessage(status: number, body: unknown): string {
  const data = (body && typeof body === "object" ? body : {}) as {
    error?: unknown;
    message?: unknown;
  };
  const code = typeof data.error === "string" ? data.error.trim() : "";
  const known =
    SCAN_ERROR_MESSAGES[code.toLowerCase()] ??
    (status === 401
      ? SCAN_ERROR_MESSAGES.unauthorized
      : status === 402
        ? SCAN_ERROR_MESSAGES.trial_expired
        : status === 429
          ? SCAN_ERROR_MESSAGES.rate_limited
          : undefined);
  if (known) return known;
  if (status === 503) {
    return "Drawing scan isn't available right now. Please try again later.";
  }
  const isSentence = (s: string) => /\s/.test(s) && !/[_{}<>]/.test(s);
  if (code && isSentence(code)) return code;
  const message = typeof data.message === "string" ? data.message.trim() : "";
  if (message && isSentence(message)) return message;
  return `Scan failed (${status}). Please try again.`;
}

export function ScanPanel({
  transcript,
  setTranscript,
}: {
  transcript: string;
  setTranscript: (s: string) => void;
}) {
  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hint, setHint] = useState<string>("");
  const [jobType, setJobType] = useState<JobType | "">("");
  const [timberLengthInput, setTimberLengthInput] = useState<string>(
    String(TIMBER_LENGTH_DEFAULT),
  );
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [editedDimensions, setEditedDimensions] = useState<string>("");
  // Drives the tape-measure progress: true = scan finished, snap to 100%.
  const [scanComplete, setScanComplete] = useState(false);
  // A big plan can take minutes — after SCAN_SLOW_NOTICE_MS say so plainly.
  const [scanSlow, setScanSlow] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (state !== "uploading") return;
    const timer = setTimeout(() => setScanSlow(true), SCAN_SLOW_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  function parsedTimberLength(): number {
    const n = Number.parseFloat(timberLengthInput);
    if (!Number.isFinite(n)) return TIMBER_LENGTH_DEFAULT;
    if (n < TIMBER_LENGTH_MIN) return TIMBER_LENGTH_MIN;
    if (n > TIMBER_LENGTH_MAX) return TIMBER_LENGTH_MAX;
    return Math.round(n * 10) / 10;
  }

  function fullReset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setTranscript("");
    setScanResult(null);
    setEditedDimensions("");
    setScanComplete(false);
    setError("");
    setState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function backToSetup() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setTranscript("");
    setScanResult(null);
    setEditedDimensions("");
    setScanComplete(false);
    setError("");
    setState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  async function handleFile(inputFile: File) {
    setError("");

    const sourceSizeError = scanUploadSizeError(inputFile);
    if (sourceSizeError) {
      setError(sourceSizeError);
      setState("error");
      return;
    }
    if (!isSupportedScanInput(inputFile)) {
      setError(
        `Unsupported file type: ${inputFile.type || "unknown"}. Use JPEG, PNG, WebP, GIF or HEIC.`,
      );
      setState("error");
      return;
    }

    // Prep the photo client-side before upload: convert iPhone HEIC → JPEG
    // (Claude can't read HEIC) and downscale big photos so they clear
    // Vercel's ~4.5 MB request-body limit (otherwise the upload 413s).
    let file = inputFile;
    if (needsPrep(inputFile)) {
      setState("converting");
      try {
        file = await prepareScanImage(inputFile);
      } catch {
        setError(
          'Couldn’t read that photo. Upload a JPEG, or switch your iPhone Camera to "Most Compatible".',
        );
        setState("error");
        return;
      }
    }

    if (file.size > MAX_SCAN_UPLOAD_BYTES) {
      setError(
        `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max 8 MB — try compressing or taking a smaller photo.`,
      );
      setState("error");
      return;
    }
    if (!isPreparedScanMime(detectImageMime(file))) {
      setError(
        `Unsupported file type: ${file.type || "unknown"}. Use JPEG, PNG, WebP or GIF.`,
      );
      setState("error");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setScanComplete(false);
    setScanSlow(false);
    setState("uploading");

    const timberLength = parsedTimberLength();
    const form = new FormData();
    form.append("image", file, file.name || "drawing.jpg");
    // Job type is an optional hint — only send it if the tradie picked one.
    if (jobType) form.append("jobType", jobType);
    form.append("timberLength", String(timberLength));
    if (hint.trim().length > 0) {
      form.append("hint", hint.trim());
    }

    try {
      const res = await fetch("/api/quotes/scan-drawing", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}));
        setError(scanErrorMessage(res.status, data));
        setState("error");
        return;
      }
      const data = (await res.json()) as Partial<ScanResult> & {
        document_type?: string;
        detectedType?: string;
      };
      const documentType: ScanResult["documentType"] =
        data.document_type === "supplier_quote" ||
        data.document_type === "other"
          ? data.document_type
          : "drawing";
      // The AI's image-derived structure type wins. Fall back to whatever
      // the tradie selected (if anything), then "Other" — never assume Deck.
      const detectedType: JobType = (JOB_TYPES as readonly string[]).includes(
        data.detectedType ?? "",
      )
        ? (data.detectedType as JobType)
        : jobType || "Other";
      const result: ScanResult = {
        buildType: (data.buildType ?? "").trim(),
        summary: (data.summary ?? "").trim(),
        dimensions: (data.dimensions ?? "").trim(),
        structural: (data.structural ?? "").trim(),
        notes: (data.notes ?? "").trim(),
        plan: data.plan ?? null,
        documentType,
        detectedType,
      };
      setScanResult(result);
      setEditedDimensions(result.dimensions);
      // Let the tape snap to 100% (the satisfying click) before swapping views.
      setScanComplete(true);
      await new Promise((r) => setTimeout(r, 450));
      // A supplier quote photographed into the drawing scanner produces a
      // hallucinated takeoff — steer the tradie to the quote importer
      // instead, while still letting them force the takeoff if they meant to.
      setState(documentType === "supplier_quote" ? "wrong-doc" : "review-dims");
    } catch (err) {
      setError(
        err instanceof Error && err.name === "TimeoutError"
          ? "The drawing took too long to read. Try again, or crop the photo to the part you need."
          : "Network error. Check your connection and try again.",
      );
      setState("error");
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  }

  function generateMaterials() {
    if (!scanResult) return;
    // Build the transcript off the AI's detected type, NOT the tradie's
    // hint — the drawing decides what gets quoted.
    const final = buildFinalTranscript(
      scanResult.detectedType,
      parsedTimberLength(),
      scanResult,
      editedDimensions,
    );
    setTranscript(final);
    setState("transcript");
  }

  function rescan() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setScanResult(null);
    setEditedDimensions("");
    setScanComplete(false);
    setError("");
    setState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  // Job type is an optional hint now — the camera is always enabled. The AI
  // reads the structure type off the drawing regardless.
  const canScan = state !== "uploading" && state !== "converting";

  return (
    <section
      id="panel-scan"
      role="tabpanel"
      aria-labelledby="tab-scan"
      data-testid="panel-scan"
      className="t2q-card-pro p-6 sm:p-8"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={SCAN_IMAGE_ACCEPT}
        className="hidden"
        data-testid="scan-upload-input"
        onChange={onFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept={SCAN_IMAGE_ACCEPT}
        capture="environment"
        className="hidden"
        data-testid="scan-camera-input"
        onChange={onFileChange}
      />

      {state === "wrong-doc" && scanResult ? (
        <WrongDocNotice
          previewUrl={previewUrl}
          onContinueAnyway={() => setState("review-dims")}
          onRedo={fullReset}
        />
      ) : state === "transcript" && scanResult ? (
        <ScanTranscriptReview
          transcript={transcript}
          buildType={scanResult.buildType}
          previewUrl={previewUrl}
          onChange={setTranscript}
          onBack={() => setState("review-dims")}
          onRedo={fullReset}
        />
      ) : state === "review-dims" && scanResult ? (
        <>
          {/* Detected-vs-picked notice. The drawing is the source of truth
              (8a6d40b), so when the tradie's optional job-type pick differs
              from what the AI read off the image, tell them we went with the
              drawing — and how to override (re-scan with a different pick). */}
          {jobType && jobType !== scanResult.detectedType ? (
            <div
              data-testid="scan-type-mismatch-notice"
              className="mb-4 flex items-start gap-3 rounded-lg border border-hivis/40 bg-hivis/10 p-3 sm:p-4"
            >
              <Warning
                size={18}
                weight="bold"
                className="mt-0.5 shrink-0 text-hivis"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-ink-200 sm:text-sm">
                You picked{" "}
                <span className="font-semibold text-white">{jobType}</span>, but
                this drawing looks like{" "}
                <span className="font-semibold text-white">
                  {scanResult.buildType || scanResult.detectedType}
                </span>
                . We&apos;ve read it as{" "}
                <span className="font-semibold text-white">
                  {scanResult.detectedType}
                </span>{" "}
                from the drawing. If that&apos;s wrong, go back, change the job
                type and re-scan.
              </p>
            </div>
          ) : null}
          <DimensionReview
            buildType={scanResult.buildType}
            plan={scanResult.plan}
            jobType={scanResult.detectedType}
            previewUrl={previewUrl}
            dimensions={editedDimensions}
            onDimensionsChange={setEditedDimensions}
            onGenerate={generateMaterials}
            onBack={backToSetup}
          />
        </>
      ) : (
        <ScanSetup
          state={state}
          error={error}
          scanComplete={scanComplete}
          scanSlow={scanSlow}
          previewUrl={previewUrl}
          jobType={jobType}
          setJobType={setJobType}
          timberLengthInput={timberLengthInput}
          setTimberLengthInput={setTimberLengthInput}
          hint={hint}
          setHint={setHint}
          canScan={canScan}
          onTakePhoto={() => cameraInputRef.current?.click()}
          onUpload={() => fileInputRef.current?.click()}
          onRetry={rescan}
        />
      )}
    </section>
  );
}

function ScanSetup({
  state,
  error,
  scanComplete,
  scanSlow,
  previewUrl,
  jobType,
  setJobType,
  timberLengthInput,
  setTimberLengthInput,
  hint,
  setHint,
  canScan,
  onTakePhoto,
  onUpload,
  onRetry,
}: {
  state: ScanState;
  error: string;
  scanComplete: boolean;
  scanSlow: boolean;
  previewUrl: string | null;
  jobType: JobType | "";
  setJobType: (j: JobType) => void;
  timberLengthInput: string;
  setTimberLengthInput: (s: string) => void;
  hint: string;
  setHint: (s: string) => void;
  canScan: boolean;
  onTakePhoto: () => void;
  onUpload: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      {previewUrl && state === "uploading" ? (
        <div className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Drawing preview"
            className="mx-auto max-h-48 w-auto rounded-sm border border-ink-600 opacity-70"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="mb-4 grid h-24 w-24 place-items-center rounded-full border-2 border-brand text-brand sm:h-28 sm:w-28"
        >
          <Camera weight="bold" className="h-10 w-10 sm:h-12 sm:w-12" />
        </div>
      )}

      {state === "uploading" && (
        <div className="mb-5 flex w-full justify-center">
          <TapeMeasureProgress done={scanComplete} label="// reading drawing" />
        </div>
      )}

      <h3 className="font-display text-lg uppercase tracking-tight text-white sm:text-xl">
        Scan a hand-drawn plan
      </h3>
      <p className="mt-2 max-w-sm text-sm text-ink-300">
        Snap your sketch — we&rsquo;ll read the drawing, work out what it
        shows and tally the materials. Pick a job type below only if you want
        to nudge what we look for.
      </p>

      <div className="mt-6 w-full max-w-md text-left">
        <label
          id="scan-jobtype-label"
          className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
        >
          Job type <span className="text-ink-500">(optional)</span>
        </label>
        <div
          role="radiogroup"
          aria-labelledby="scan-jobtype-label"
          data-testid="scan-jobtype"
          className="mt-2 grid grid-cols-3 gap-2"
        >
          {JOB_TYPES.map((j) => {
            const active = jobType === j;
            return (
              <button
                key={j}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`scan-jobtype-${j.toLowerCase()}`}
                onClick={() => setJobType(j)}
                disabled={state === "uploading"}
                className={[
                  "min-h-11 rounded-sm border px-2 font-display text-sm uppercase tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "border-brand bg-brand text-ink-900"
                    : "border-ink-600 bg-ink-900 text-ink-300 hover:border-brand hover:text-white",
                ].join(" ")}
              >
                {j}
              </button>
            );
          })}
        </div>
        {!jobType && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
            {"// optional — we read the structure from the drawing"}
          </p>
        )}
      </div>

      <div className="mt-5 w-full max-w-md text-left">
        <label
          htmlFor="scan-timber-length"
          className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
        >
          Timber length preference
        </label>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-sm text-ink-300">I buy timber in</span>
          <input
            id="scan-timber-length"
            data-testid="scan-timber-length"
            type="number"
            inputMode="decimal"
            min={TIMBER_LENGTH_MIN}
            max={TIMBER_LENGTH_MAX}
            step="0.1"
            value={timberLengthInput}
            onChange={(e) => setTimberLengthInput(e.target.value)}
            disabled={state === "uploading"}
            className="w-20 rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-center text-base text-white outline-none focus:border-brand disabled:opacity-50"
          />
          <span className="text-sm text-ink-300">metre lengths</span>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
          {"// default 6m · we factor 10% waste into the count"}
        </p>
      </div>

      <div className="mt-6 flex w-full flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onTakePhoto}
          disabled={!canScan}
          data-testid="scan-take-photo"
          className="t2q-btn-primary-pro inline-flex min-h-[44px] items-center justify-center gap-2 px-5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Camera weight="bold" className="h-5 w-5" />
          Take photo
        </button>
        <button
          type="button"
          onClick={onUpload}
          disabled={!canScan}
          data-testid="scan-upload"
          className="t2q-btn-ghost-pro inline-flex min-h-[44px] items-center justify-center gap-2 px-5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UploadSimple weight="bold" className="h-5 w-5" />
          Upload image
        </button>
      </div>

      <div className="mt-5 w-full max-w-md text-left">
        <label
          htmlFor="scan-hint"
          className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
        >
          Optional context
        </label>
        <input
          id="scan-hint"
          data-testid="scan-hint"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          maxLength={500}
          disabled={state === "uploading"}
          placeholder="e.g. Treated pine deck, 1.2m off ground."
          className="mt-2 block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand disabled:opacity-50"
        />
      </div>

      <p
        data-testid="scan-status"
        aria-live="polite"
        className="mt-4 min-h-5 text-sm text-ink-300"
      >
        {state === "idle" &&
          "JPEG, PNG, WebP, GIF or iPhone HEIC photos. Large phone photos are compressed before upload."}
        {state === "converting" && "Preparing photo…"}
        {state === "uploading" &&
          (scanSlow ? SCAN_SLOW_NOTICE : "Reading your drawing…")}
        {state === "error" && (
          <span data-testid="scan-error" className="text-red-400">
            {error}
          </span>
        )}
      </p>

      {state === "error" && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-[44px] items-center text-sm font-mono uppercase tracking-[0.2em] text-brand hover:text-brand-300"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function DimensionReview({
  buildType,
  plan,
  jobType,
  previewUrl,
  dimensions,
  onDimensionsChange,
  onGenerate,
  onBack,
}: {
  buildType: string;
  plan: ScannedPlan | null;
  jobType: JobType | "Other";
  previewUrl: string | null;
  dimensions: string;
  onDimensionsChange: (s: string) => void;
  onGenerate: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        data-testid="scan-back-to-setup"
        className="inline-flex items-center gap-1 text-sm font-mono uppercase tracking-[0.2em] text-ink-300 hover:text-white"
      >
        <ArrowLeft weight="bold" className="h-4 w-4" />
        Back
      </button>

      <div className="mt-3">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
          Here&rsquo;s what I read from your drawing
        </div>
        {buildType && (
          <p className="mt-1 font-display text-base uppercase tracking-tight text-white">
            {buildType}
          </p>
        )}
      </div>

      {plan && (plan.area_m2 != null || plan.perimeter_m != null) && (
        <div
          data-testid="scan-geometry"
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          {plan.shape_label && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-brand/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-brand">
              {plan.shape_label}
            </span>
          )}
          {plan.area_m2 != null && (
            <span className="rounded-sm border border-ink-700 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-200">
              Area {plan.area_m2} m²
            </span>
          )}
          {plan.perimeter_m != null && (
            <span className="rounded-sm border border-ink-700 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-200">
              Perimeter {plan.perimeter_m} m
            </span>
          )}
        </div>
      )}

      {plan?.review_flags && plan.review_flags.length > 0 && (
        <ul
          data-testid="scan-review-flags"
          className="mt-3 space-y-1 rounded-sm border border-hivis/40 bg-hivis/10 px-3 py-2 text-xs text-hivis"
        >
          {plan.review_flags.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}

      {plan && (
        <div
          data-testid="floor-plan-wrapper"
          className="mt-4 overflow-hidden rounded-sm border border-ink-700 bg-ink-950"
        >
          <div className="border-b border-ink-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
            {"// schematic — measure against your drawing"}
          </div>
          <FloorPlanSvg plan={plan} jobType={jobType as JobType} />
        </div>
      )}

      {previewUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Scanned drawing"
            className="max-h-56 w-auto rounded-sm border border-ink-600"
          />
        </div>
      )}

      <label
        htmlFor="scan-dimensions"
        className="mt-5 block font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
      >
        Dimensions — correct any misreads
      </label>
      <textarea
        id="scan-dimensions"
        data-testid="scan-dimensions"
        value={dimensions}
        onChange={(e) => onDimensionsChange(e.target.value)}
        rows={10}
        className="mt-2 block w-full resize-y rounded-sm border border-ink-600 bg-ink-900 px-4 py-3 text-sm text-white outline-none focus:border-brand"
      />
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
        {"// edit any number we got wrong — the materials list will use these"}
      </p>

      <div className="mt-5">
        <button
          type="button"
          onClick={onGenerate}
          data-testid="scan-generate-materials"
          disabled={dimensions.trim().length === 0}
          className="t2q-btn-primary-pro inline-flex min-h-[44px] w-full items-center justify-center px-5 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          Generate materials →
        </button>
      </div>
    </div>
  );
}

function ScanTranscriptReview({
  transcript,
  buildType,
  previewUrl,
  onChange,
  onBack,
  onRedo,
}: {
  transcript: string;
  buildType: string;
  previewUrl: string | null;
  onChange: (s: string) => void;
  onBack: () => void;
  onRedo: () => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          data-testid="scan-back-to-dims"
          className="inline-flex items-center gap-1 text-sm font-mono uppercase tracking-[0.2em] text-ink-300 hover:text-white"
        >
          <ArrowLeft weight="bold" className="h-4 w-4" />
          Edit dimensions
        </button>
        <button
          type="button"
          onClick={onRedo}
          data-testid="scan-clear"
          aria-label="Remove drawing"
          className="grid h-11 w-11 place-items-center rounded-sm border border-ink-600 text-ink-300 hover:border-brand hover:text-brand"
        >
          <X weight="bold" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
          Drawing read
        </div>
        {buildType && (
          <p className="mt-1 font-display text-base uppercase tracking-tight text-white">
            {buildType}
          </p>
        )}
      </div>

      {previewUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Scanned drawing"
            className="max-h-56 w-auto rounded-sm border border-ink-600"
          />
        </div>
      )}

      <label
        htmlFor="scan-transcript"
        className="mt-4 block font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
      >
        Takeoff — review before we quote
      </label>
      <textarea
        id="scan-transcript"
        data-testid="scan-transcript"
        value={transcript}
        onChange={(e) => onChange(e.target.value)}
        rows={12}
        className="mt-2 block w-full resize-y rounded-sm border border-ink-600 bg-ink-900 px-4 py-3 text-sm text-white outline-none focus:border-brand"
      />
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
        {"// edit anything that's wrong — the quote will be built off this text"}
      </p>
    </div>
  );
}

/**
 * Shown when the scan looks like a printed supplier quote rather than a
 * hand-drawn plan. The drawing takeoff would hallucinate over a priced
 * materials list, so we steer the tradie to the quote importer (which
 * mirrors the supplier's lines + prices 1:1) while still letting them force
 * the takeoff if they really did mean to scan a drawing.
 */
function WrongDocNotice({
  previewUrl,
  onContinueAnyway,
  onRedo,
}: {
  previewUrl: string | null;
  onContinueAnyway: () => void;
  onRedo: () => void;
}) {
  return (
    <div data-testid="scan-wrong-doc">
      <div className="flex items-start gap-3 rounded-sm border border-hivis/40 bg-hivis/10 p-4">
        <Warning weight="fill" className="mt-0.5 h-5 w-5 shrink-0 text-hivis" />
        <div>
          <h3 className="font-display text-base uppercase tracking-tight text-white">
            That looks like a supplier quote
          </h3>
          <p className="mt-1 text-sm text-ink-200">
            This scanner reads hand-drawn plans. To turn a merchant quote (ITM,
            PlaceMakers…) into a quote that matches it exactly, use the quote
            importer — it copies the supplier&rsquo;s line items and prices 1:1.
          </p>
        </div>
      </div>

      {previewUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Scanned document"
            className="max-h-48 w-auto rounded-sm border border-ink-600"
          />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Link
          href="/app/materials/import-quote"
          data-testid="scan-wrong-doc-import"
          className="t2q-btn-primary-pro inline-flex min-h-[44px] items-center justify-center gap-2 px-5"
        >
          <Receipt weight="bold" className="h-5 w-5" />
          Open quote importer
        </Link>
        <p className="text-xs text-ink-400 sm:max-w-[14rem]">
          You&rsquo;ll need to take or import the photo again there.
        </p>
        <button
          type="button"
          onClick={onContinueAnyway}
          data-testid="scan-wrong-doc-continue"
          className="t2q-btn-ghost-pro inline-flex min-h-[44px] items-center justify-center px-5"
        >
          Use as a drawing anyway
        </button>
        <button
          type="button"
          onClick={onRedo}
          className="inline-flex min-h-[44px] items-center justify-center px-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-300 hover:text-white"
        >
          Scan something else
        </button>
      </div>
    </div>
  );
}
