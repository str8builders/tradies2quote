import { computePlanGeometry, type Region } from "@/lib/takeoff/geometry";
import { aiModel } from "@/lib/ai/models";
import { readWallRunLine } from "@/lib/aiTakeoffParser";
import { round2 } from "@/lib/quantity-maths";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// The drawing-scan model id lives in src/lib/ai/models.ts (role
// "drawingScan", env AI_MODEL_DRAWING_SCAN) with every other model id.
export const MODEL = aiModel("drawingScan");
// Bumped from 2048 → 4096. A detailed hand-drawn plan (multiple
// dimension labels, step heights, post depths, fastener notes) can
// easily generate a long structured response: 6 sections of prose
// plus the JSON `plan` object. Opus's adaptive thinking also burns
// internal tokens before the visible output starts, so 2048 was
// truncating mid-JSON on dense sketches and surfacing as "Drawing
// was too detailed to scan in one go" — a misleading message,
// because the issue was the cap, not the drawing. Opus 4.7 supports
// up to 8192 output tokens; 4096 keeps headroom without paying for
// tokens we don't need.
export const MAX_TOKENS = 4096;

export const JOB_TYPES = new Set([
  "Deck",
  "Fence",
  "Framing",
  "Concrete",
  "Roofing",
  "Other",
]);

const JOB_TYPE_GUIDANCE: Record<string, string> = {
  Deck:
    "This is a TIMBER DECK. Focus on: joists (size, spacing, span), bearers, posts (H5, footing depth), decking boards (size, length, spacing), stainless decking screws, joist hangers, post anchors, handrails/balustrade if shown, steps. Concrete bag counts for post footings.",
  Fence:
    "This is a FENCE. Focus on: posts (size, spacing, depth in ground, H5 treatment), top and bottom rails, pickets or panels, gates and gate hardware, concrete bag counts for post footings, fixings (galvanised nails/screws).",
  Framing:
    "This is TIMBER WALL/FLOOR/ROOF FRAMING. Focus on: top and bottom plates (90x45 H1.2 typical), studs and stud spacing (usually 600mm centres), noggins/dwangs (1 row per 1.35m of stud height), lintels over openings, trimmers, framing nails, framing brackets, GIB bracing.",
  Concrete:
    "This is CONCRETE WORK (slab/pad/footing). Focus on: plan dimensions, depth/thickness, reinforcing (D12 rebar, SE62/SE82 mesh), polythene DPM, formwork timber, bag counts (use the stated manufacturer yield; do not invent a yield from bag weight), or call it ready-mix m³ if a truck is implied.",
  Roofing:
    "This is ROOFING. Focus on: roof plan area, pitch, purlin size and spacing, long-run iron sheet lengths and overlaps, ridge, barge, flashings, building paper, roof screws (Tek screws), gutters and downpipes if shown.",
  Other:
    "General construction takeoff — be thorough with every dimension and labelled element.",
};

// The scan turns the drawing into the SAME shape of input the
// voice/type flow already produces: a plain-English, dimension-rich
// job description. Downstream, /api/quotes/generate parses it into
// line items (and the takeoff calculator can pick up framing / deck /
// cladding patterns automatically). That means scan-drawing piggybacks
// on all the existing material-matching, pricing, library, compliance
// and review tooling — no separate quote pipeline to maintain.
export function buildSystemPrompt(
  jobTypeHint: string | null,
  timberLength: number,
): string {
  const hintLine = jobTypeHint
    ? `The user has suggested this MAY be a "${jobTypeHint}" job. Treat that ONLY as a loose hint — it is NOT authoritative. Identify the ACTUAL structure from the drawing itself. If the drawing clearly shows something else (a house floor plan, a fence, a roof, a slab), trust the DRAWING and ignore the hint.`
    : `The user did not specify a job type. Identify the structure type entirely from the drawing.`;

  // Reference focus lists for EVERY type, so whichever structure the AI
  // reads off the image, it knows what elements to take off. The AI picks
  // the type first, then uses the matching list — we no longer pre-commit
  // it to one type.
  const focusReference = Object.entries(JOB_TYPE_GUIDANCE)
    .map(([type, guidance]) => `  - ${type}: ${guidance}`)
    .join("\n");

  return `You are an NZ-builder takeoff reader. The user uploaded a photo or scan of a hand-drawn construction plan/sketch.

CONTEXT (the DRAWING is the source of truth — the hint below is NOT authoritative):
- ${hintLine}
- The tradie buys timber in ${timberLength}m stock lengths. Preserve the exact measured member lengths and counts from the drawing. Stock conversion and waste are calculated downstream; do not round measurements into stock lengths or add a waste allowance during extraction.

Your job: FIRST work out what the drawing actually shows, THEN read every annotation and produce a structured takeoff that a quoting AI can turn into materials and labour.

Read out, in order:
1. WHAT IS BEING BUILT — classify the structure from the DRAWING ITSELF, not from the hint. Set "detectedType" to exactly one of: Deck, Fence, Framing, Concrete, Roofing, Other. A house/room floor-plan layout is "Framing" if it shows wall framing, otherwise "Other" — it is NOT a Deck unless the drawing actually shows a deck. Also give a short "buildType" phrase (e.g. "Timber deck", "Single-storey house floor plan", "1.8m boundary fence").
2. PRIMARY DIMENSIONS — read EVERY labelled number on the WHOLE drawing, not just the outer box. Transcribe each one EXACTLY as written, ONE DIMENSION PER LINE, and if it is in mm restate it in metres too (e.g. "8820mm = 8.82m"). Work across the entire sheet:
   - the overall building width and length (the bounding box),
   - EVERY individual wall segment length — exterior AND interior/partition walls,
   - wall thickness(es) where shown (e.g. "90mm walls", "140mm external"),
   - EACH room's width × length and its name if labelled (e.g. "Bed 1 3.6 x 3.2"),
   - ceiling / wall / stud heights,
   - stud / joist / rafter / pile spacings (centres),
   - step heights, riser/going, post heights, pile depths, fastener spacings.
   Then, for a wall/floor framing job, ADD a line that SUMS every wall segment into the TOTAL WALL RUN, e.g. "TOTAL WALL RUN = 6.0 + 4.8 + 3.6 + 3.6 + 2.4 = 20.4m". Split exterior vs interior if you can ("EXTERIOR WALL RUN = …", "INTERIOR WALL RUN = …"). Count and list every door and window opening. Do NOT treat timber sizes (90x45, 140x45, 100x100) or fastener gauges as plan dimensions. Keep this section purely numeric so the tradie can review it quickly.
3. STRUCTURAL ELEMENTS — for each one, list the size, treatment, spacing and count, working in the tradie's ${timberLength}m timber lengths. Use the focus list for the type YOU identified in step 1:
${focusReference}
4. FIXINGS / FASTENERS / HARDWARE — joist hangers, post anchors, stainless decking screws, framing nails, coach screws, brackets.
5. CONCRETE / BAGS — count holes / pads / piles and note hole size if shown. Compute bag count where possible (20kg bag covers ~0.01m³).
6. ACCESSORIES — handrails, steps, balustrades, gates, infill, flashings.
7. EXPLICIT NOTES THE TRADIE WROTE — quote any text labels on the drawing word-for-word.
8. ASSUMPTIONS YOU MADE because the drawing was ambiguous. Flag with "Assumed:".
9. MISSING INFO the tradie should add (waste %, finish, ground conditions).

CRITICAL rules:
- The DRAWING decides the structure type, not the hint. Never describe a deck (or any structure) that the image does not show.
- DO NOT invent dimensions. If a number is not on the drawing, do not write one. Say "not shown".
- Use NZ trade vocabulary: GIB, H1.2 / H3.2 / H4 / H5 treated pine, 90x45, 140x45, 140x19 decking, Pink Batts, joist hangers, post anchors, stainless decking screws.
- Keep units explicit. mm or m, not "8.8" by itself.
- Be terse and structured, NOT chatty.
- Output STRICT JSON only — no prose, no markdown, no code fences.

Output shape:
{
  "document_type": "drawing" | "supplier_quote" | "other",
  "detectedType": "Deck" | "Fence" | "Framing" | "Concrete" | "Roofing" | "Other",
  "buildType": string,
  "summary": string,
  "dimensions": string,
  "structural": string,
  "notes": string,
  "plan": {
    "shape": "rect" | "l_shape" | "line" | "triangle" | "circle" | "trapezoid" | "other",
    "width_m": number,
    "length_m": number,
    "regions": [ { "width_m": number, "length_m": number, "label": string | null } ] | null,
    "wall_run_m": number | null,
    "exterior_wall_run_m": number | null,
    "interior_wall_run_m": number | null,
    "wall_thickness_mm": number | null,
    "stud_spacing_mm": number | null,
    "door_count": number | null,
    "window_count": number | null,
    "tri_base_m": number | null,
    "tri_height_m": number | null,
    "radius_m": number | null,
    "trap_a_m": number | null,
    "trap_b_m": number | null,
    "trap_h_m": number | null,
    "post_count": number | null,
    "post_spacing_m": number | null,
    "joist_spacing_mm": number | null,
    "joist_orientation": "width" | "length" | null,
    "height_m": number | null
  } | null
}

Where:
- "document_type" classifies what the image actually is. "drawing" = a hand-drawn or CAD plan/sketch with measurements to take off. "supplier_quote" = a printed/typed merchant quote, estimate, invoice or order (product line items with prices/SKUs and a Subtotal / GST / Total). "other" = neither. If it's clearly a supplier quote, set "supplier_quote" — the app will redirect the tradie to the quote importer instead of doing a takeoff.
- "detectedType" is the structure type YOU read off the drawing — Deck, Fence, Framing, Concrete, Roofing or Other. This is YOUR classification of the image, NOT the user's hint. If the hint says "Deck" but the drawing is a house floor plan, return "Framing" or "Other" — whatever the drawing actually shows.
- "buildType" is a short noun phrase ("Timber deck", "1.8m boundary fence", "Garage GIB lining", …).
- "summary" is one sentence (under 200 chars) for log lines.
- "dimensions" is the PRIMARY DIMENSIONS section ONLY — one dimension per line, no headers, no extra commentary. This is what the tradie will review first to catch misreads. 4–20 lines typically.
- "structural" is sections 3–6 (structural elements, fixings, concrete, accessories) joined with newlines.
- "notes" is sections 7–9 (tradie's labels, assumptions, missing info) joined with newlines.
- "plan" is the smallest structured summary that a programmatic renderer can use to draw a clean schematic of what's being built. Use NULL for any field you can't extract from the drawing. Use NULL for the entire plan if the sketch is too ambiguous to produce a confident shape. Width and length in metres, joist spacing in millimetres. "line" shape is for fences (length_m only matters). "joist_orientation" is which axis the joists span across — "width" means joists run parallel to the width edge, "length" means parallel to the length edge.
- FLOOR-PLAN WALL FIELDS — for a house/room floor plan you take off framing/lining from the TOTAL WALL RUN, never from a single edge. Fill these whenever the drawing shows walls:
  - "wall_run_m" — the TOTAL length of ALL walls (exterior + interior partitions) added together, in metres. This is the single most important number for a framing/lining job. Compute it by summing every wall segment you transcribed in section 2. If you cannot read enough wall segments to sum them, set NULL (do NOT fall back to the bounding-box perimeter).
  - "exterior_wall_run_m" / "interior_wall_run_m" — the split, when you can tell them apart. They should add up to wall_run_m.
  - "wall_thickness_mm" — nominal wall thickness if labelled (90, 140, …).
  - "stud_spacing_mm" — stud centres if shown (usually 400 or 600).
  - "door_count" / "window_count" — total openings of each kind across the whole plan.
  width_m + length_m STILL hold the overall bounding box; wall_run_m is the wall total and is much larger than either edge on a multi-room plan. Never put the bounding box edge in wall_run_m.
- SHAPE — get the footprint right; do NOT flatten everything to a rectangle:
  - If the footprint is a simple rectangle, set shape "rect" and fill width_m + length_m.
  - If it is an L / T / U / stepped footprint, set shape "l_shape" and BREAK IT INTO "regions" — a list of NON-OVERLAPPING sub-rectangles whose areas add up to the true footprint (e.g. an L is two rectangles). Still fill width_m + length_m with the OVERALL bounding box.
  - If it is a triangle, set shape "triangle" and fill tri_base_m + tri_height_m (perpendicular height).
  - If it is a circle / round pad, set shape "circle" and fill radius_m.
  - If it is a trapezoid, set shape "trapezoid" and fill trap_a_m + trap_b_m (the two parallel sides) + trap_h_m (height between them).
  - The app computes the real area and perimeter from these numbers itself — you only READ the dimensions, you do NOT compute areas. Never invent a dimension that isn't drawn.`;
}

export interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

export interface ScannedPlan {
  shape: "rect" | "l_shape" | "line" | "triangle" | "circle" | "trapezoid" | "other";
  width_m: number;
  length_m: number;
  /** Composite footprint (L/T/U/stepped) as non-overlapping sub-rectangles. */
  regions: Region[] | null;
  /**
   * Floor-plan wall totals (Wave 44). For a multi-room house plan the
   * framing/lining takeoff must run off the TOTAL wall run — every
   * exterior + interior wall summed — not a single bounding-box edge.
   * Null when the drawing isn't a wall/floor plan or the model couldn't
   * read enough segments to sum.
   */
  wall_run_m: number | null;
  exterior_wall_run_m: number | null;
  interior_wall_run_m: number | null;
  wall_thickness_mm: number | null;
  stud_spacing_mm: number | null;
  door_count: number | null;
  window_count: number | null;
  /** Deterministically computed by the app — NOT read off the drawing. */
  area_m2: number | null;
  perimeter_m: number | null;
  /** Human label for the computed shape, e.g. "L-shape (2 regions)". */
  shape_label: string | null;
  tri_base_m: number | null;
  tri_height_m: number | null;
  radius_m: number | null;
  trap_a_m: number | null;
  trap_b_m: number | null;
  trap_h_m: number | null;
  post_count: number | null;
  post_spacing_m: number | null;
  joist_spacing_mm: number | null;
  joist_orientation: "width" | "length" | null;
  height_m: number | null;
  /**
   * Things the tradie should check on the scan review, e.g. a wall run the
   * model added up differently from the wall lengths it listed. Absent when
   * there's nothing to check.
   */
  review_flags?: string[];
}

export interface ScanPayload {
  document_type?: string;
  detectedType?: string;
  buildType?: string;
  summary?: string;
  dimensions?: string;
  structural?: string;
  notes?: string;
  plan?: ScannedPlan | null;
  // Tolerate the legacy single-transcript shape too.
  transcript?: string;
}


const VALID_SHAPES = new Set([
  "rect",
  "l_shape",
  "line",
  "triangle",
  "circle",
  "trapezoid",
]);

/** Parse the model's `regions` array into clean sub-rectangles. */
function sanitiseRegions(raw: unknown): Region[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Region[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const w = Number(o.width_m);
    const l = Number(o.length_m);
    if (!Number.isFinite(w) || !Number.isFinite(l) || w <= 0 || l <= 0) continue;
    out.push({
      width_m: w,
      length_m: l,
      label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : null,
    });
  }
  return out.length > 0 ? out : null;
}

/** One wall-run sum computed in code from its transcribed segments. */
type CodeWallRun = { sum: number; addends: string };

/**
 * The wall runs the model wrote as a sum in its dimensions text —
 * "TOTAL / EXTERIOR / INTERIOR WALL RUN = 6.0 + 4.8 + 3.6 = …" — added up
 * HERE, from the segments it listed (the model's own "= total" is ignored).
 * The last line of each kind wins. Only lines that list 2+ segments count.
 */
export function wallRunSumsFromText(
  text: string,
): Partial<Record<"total" | "exterior" | "interior", CodeWallRun>> {
  const out: Partial<Record<"total" | "exterior" | "interior", CodeWallRun>> = {};
  for (const line of (text ?? "").split(/\r?\n/)) {
    const hit = readWallRunLine(line);
    if (!hit || hit.run.addendSum === undefined) continue;
    const addends =
      line
        .split("=")
        .map((s) => s.trim())
        .find((s) => s.includes("+")) ?? "";
    out[hit.which] = { sum: round2(hit.run.addendSum), addends };
  }
  return out;
}

/** Past this relative gap the model's wall-run arithmetic is replaced and flagged. */
const WALL_RUN_TOLERANCE = 0.02;

export function sanitisePlan(
  raw: unknown,
  opts: {
    /**
     * The scan's DIMENSIONS text. Its "… WALL RUN = a + b + c = t" lines are
     * the transcribed segment list the wall-run sums are checked against.
     */
    dimensionsText?: string;
  } = {},
): ScannedPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const shape = (
    typeof r.shape === "string" && VALID_SHAPES.has(r.shape) ? r.shape : "other"
  ) as ScannedPlan["shape"];
  const w = r.width_m == null && shape === "line" ? 0 : Number(r.width_m);
  const l = Number(r.length_m);
  // Reject the plan outright if we don't have at least a width AND length —
  // the renderer can't draw anything sensible without them. Fences with
  // length only still need a length_m; we treat that as width_m=0 + length.
  if (!Number.isFinite(w) || !Number.isFinite(l)) return null;
  if (w <= 0 && l <= 0) return null;
  const optNum = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  // Wall run can legitimately reach a few hundred metres on a large house,
  // but a value beyond 1000m is almost certainly a mm/garbage misread, and
  // a value below 2m can't be a whole-house wall total — clamp to a sane
  // band so a bad read can't blow the framing/lining quantities up.
  const inRunBand = (n: number): boolean => Number.isFinite(n) && n >= 2 && n <= 1000;
  const optRunM = (v: unknown): number | null => {
    const n = Number(v);
    return inRunBand(n) ? round2(n) : null;
  };
  const optCount = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 200 ? Math.round(n) : null;
  };
  const optSpacingMm = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 100 && n <= 1200 ? Math.round(n) : null;
  };
  const optThicknessMm = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 30 && n <= 600 ? Math.round(n) : null;
  };
  const orientation =
    r.joist_orientation === "width" || r.joist_orientation === "length"
      ? r.joist_orientation
      : null;
  const regions = sanitiseRegions(r.regions);
  const tri_base_m = optNum(r.tri_base_m);
  const tri_height_m = optNum(r.tri_height_m);
  const radius_m = optNum(r.radius_m);
  const trap_a_m = optNum(r.trap_a_m);
  const trap_b_m = optNum(r.trap_b_m);
  const trap_h_m = optNum(r.trap_h_m);

  // Deterministic geometry — the app computes area/perimeter, never the model.
  const geo = computePlanGeometry({
    shape,
    width_m: Math.max(0, w),
    length_m: Math.max(0, l),
    regions,
    tri_base_m,
    tri_height_m,
    radius_m,
    trap_a_m,
    trap_b_m,
    trap_h_m,
  });

  // Wall totals (Wave 44). The model is asked to ADD the wall segments it
  // transcribed; the sum is computed here instead, from the segment list in
  // its dimensions text (audit item 5). A model figure more than 2 % off is
  // replaced by the code's sum and flagged for the tradie; within 2 % the
  // exact sum of the listed walls is used. With no segment list, the model's
  // figure is kept as before.
  const review_flags: string[] = [];
  const sums = wallRunSumsFromText(opts.dimensionsText ?? "");
  const reconcile = (
    label: string,
    model: number | null,
    code: CodeWallRun | undefined,
  ): number | null => {
    if (!code || !inRunBand(code.sum)) return model;
    if (model !== null && Math.abs(model - code.sum) / code.sum > WALL_RUN_TOLERANCE) {
      review_flags.push(
        `The drawing's ${label} said ${model} m, but the walls it listed add up to ${code.sum} m (${code.addends}). Used ${code.sum} m — check the wall lengths.`,
      );
    }
    return code.sum;
  };
  const exteriorRun = reconcile("exterior wall run", optRunM(r.exterior_wall_run_m), sums.exterior);
  const interiorRun = reconcile("interior wall run", optRunM(r.interior_wall_run_m), sums.interior);
  // No TOTAL line: the listed exterior + interior walls are the total.
  const codeTotal =
    sums.total ??
    (sums.exterior && sums.interior
      ? {
          sum: round2(sums.exterior.sum + sums.interior.sum),
          addends: `${sums.exterior.addends} + ${sums.interior.addends}`,
        }
      : undefined);
  let wallRun = reconcile("total wall run", optRunM(r.wall_run_m), codeTotal);
  // exterior + interior fall back to summing the two when the model gave the
  // split but not the total.
  if (wallRun === null && (exteriorRun !== null || interiorRun !== null)) {
    const summed = round2((exteriorRun ?? 0) + (interiorRun ?? 0));
    wallRun = inRunBand(summed) ? summed : null;
  }

  return {
    shape,
    width_m: Math.max(0, w),
    length_m: Math.max(0, l),
    regions,
    wall_run_m: wallRun,
    exterior_wall_run_m: exteriorRun,
    interior_wall_run_m: interiorRun,
    wall_thickness_mm: optThicknessMm(r.wall_thickness_mm),
    stud_spacing_mm: optSpacingMm(r.stud_spacing_mm),
    door_count: optCount(r.door_count),
    window_count: optCount(r.window_count),
    area_m2: geo.area_m2 > 0 ? geo.area_m2 : null,
    perimeter_m: geo.perimeter_m,
    shape_label: geo.composite ? geo.label : null,
    tri_base_m,
    tri_height_m,
    radius_m,
    trap_a_m,
    trap_b_m,
    trap_h_m,
    post_count: optNum(r.post_count),
    post_spacing_m: optNum(r.post_spacing_m),
    joist_spacing_mm: optNum(r.joist_spacing_mm),
    joist_orientation: orientation,
    height_m: optNum(r.height_m),
    ...(review_flags.length > 0 ? { review_flags } : {}),
  };
}

/**
 * When the footprint is a real shape (composite/triangle/circle/…), the model
 * may not have written a clean total area in the dimensions text. Prepend the
 * deterministically-computed area + perimeter so the downstream regex takeoff
 * (extractAreaM2 / extractPerimeterM) uses OUR numbers, not a bounding-box
 * guess. We only do this for composite/primitive shapes — a plain rectangle's
 * existing length×width path is left byte-for-byte unchanged.
 */
export function geometryPreamble(plan: ScannedPlan | null): string {
  if (!plan || !plan.shape_label) return "";
  const lines: string[] = [];
  if (plan.area_m2 && plan.area_m2 > 0) {
    lines.push(`Computed area = ${plan.area_m2} m² (${plan.shape_label})`);
  }
  if (plan.perimeter_m && plan.perimeter_m > 0) {
    // The unit word ("perimeter") MUST follow the number for the downstream
    // extractPerimeterM regex to match (number → m → perimeter-word).
    lines.push(`Computed perimeter = ${plan.perimeter_m} m of perimeter`);
  }
  return lines.join("\n");
}

