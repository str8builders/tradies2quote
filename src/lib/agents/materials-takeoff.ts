/**
 * Materials / Takeoff Agent — Anthropic-backed material extractor.
 *
 * Takes a job description (the same kind of text a tradie speaks into
 * the voice-quote flow, but typed) and returns a structured list of
 * likely materials with quantities, units, NZ-specific notes, and an
 * "ai_estimated" flag so the UI can show a "AI estimate" pill.
 *
 * NEVER fakes supplier prices. The agent leaves `unit_price` as null —
 * the user pulls real prices from their materials library on the
 * quote editor. We don't pretend to know Bunnings or PlaceMakers
 * pricing.
 *
 * Server-only. Needs ANTHROPIC_API_KEY at runtime.
 */
import "server-only";
import {
  runStructuredAgent,
  type AgentRunOptions,
  type ParseResult,
} from "./runtime";

export type TakeoffLineUnit =
  | "each"
  | "lm"
  | "m2"
  | "m3"
  | "kg"
  | "bag"
  | "sheet"
  | "roll"
  | "litre"
  | "hr"
  | "day";

export interface TakeoffLine {
  description: string;
  /** Estimated quantity. Null if the agent can't reasonably guess. */
  quantity: number | null;
  /** "each" / "lm" / "m2" / "sheet" etc. */
  unit: TakeoffLineUnit | null;
  /** Free-form trade note: "H3.2 treatment recommended", etc. */
  note: string | null;
  /** True when the quantity is an AI guess, not measured. */
  ai_estimated: boolean;
  /** Category bucket for grouping in the editor. */
  category:
    | "framing"
    | "linings"
    | "insulation"
    | "fixings"
    | "paint_plaster"
    | "exterior"
    | "fittings"
    | "consumables"
    | "labour"
    | "other";
}

export interface TakeoffReviewFlag {
  /** Why the agent wants the human to look at this. */
  message: string;
}

export interface TakeoffResult {
  /** Echo of the job text so the UI can show "what was understood". */
  understoodAs: string;
  lines: TakeoffLine[];
  assumptions: string[];
  reviewFlags: TakeoffReviewFlag[];
}

export interface MaterialsTakeoffInput {
  /** The job description text — voice transcript, paste, or typed. */
  jobText: string;
  /** Optional country hint. Defaults to NZ. */
  country?: "NZ" | "AU" | "UK" | "US" | "CA";
}

const MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You are a senior NZ builder's takeoff assistant.

Given a tradie's plain-English job description, extract:
1. The likely materials (with quantity + unit where reasonable).
2. Trade-correct notes (treatment grade, sheet size, gauge, screw size, etc.).
3. Any assumptions you had to make to estimate quantities.
4. Any "review flags" — places where the human MUST decide before quoting.

Trade-specific rules:
- NZ-style names: GIB (plasterboard), H3.2 / H4 (treated timber), Pink Batts (insulation), MDF, customwood, James Hardie, Colorsteel.
- Standard sheet sizes: 1200x2400 GIB, 2440x1220 ply, 3.6m or 4.8m timber lengths.
- Common units:
  • "lm"   linear metres of timber, skirting, architraves, batten
  • "m2"   areas of GIB, paint, insulation, decking
  • "m3"   concrete, soil, scoria
  • "sheet" GIB, ply, OSB
  • "each" doors, windows, fixings, joist hangers
  • "bag"  concrete bags, screws bulk packs
  • "kg"   nails, screws by weight
  • "roll" building paper, building wrap
  • "litre" paint, primer, stain
- NEVER invent supplier prices. Leave them out entirely — the user pulls real prices from their library.
- If you cannot reasonably guess a quantity, set "quantity": null and explain in "note".
- Always set "ai_estimated": true unless the user gave you a specific number ("12 sheets of GIB" → ai_estimated=false, quantity=12).
- Add a review flag for: load-bearing structural calls, fire-rated assemblies, anything that requires a producer statement or engineer's input, "the customer said it's plaster behind there but I haven't checked" — anything that needs a site visit to confirm.

Return the takeoff by calling the emit_takeoff tool with the structured fields described above. Do not reply with prose — only the tool call.`;

const TAKEOFF_TOOL = {
  name: "emit_takeoff",
  description: "Return the structured NZ materials takeoff for the job description.",
  schema: {
    type: "object",
    required: ["understoodAs", "lines", "assumptions", "reviewFlags"],
    properties: {
      understoodAs: {
        type: "string",
        description: "One-line echo of what the job was understood to be.",
      },
      lines: {
        type: "array",
        items: {
          type: "object",
          required: ["description", "ai_estimated", "category"],
          properties: {
            description: { type: "string" },
            quantity: {
              type: ["number", "null"],
              description: "Estimated quantity, or null if it can't be guessed.",
            },
            unit: {
              type: ["string", "null"],
              enum: [
                "each", "lm", "m2", "m3", "kg", "bag", "sheet", "roll",
                "litre", "hr", "day", null,
              ],
            },
            note: { type: ["string", "null"] },
            ai_estimated: { type: "boolean" },
            category: {
              type: "string",
              enum: [
                "framing", "linings", "insulation", "fixings", "paint_plaster",
                "exterior", "fittings", "consumables", "labour", "other",
              ],
            },
          },
        },
      },
      assumptions: { type: "array", items: { type: "string" } },
      reviewFlags: {
        type: "array",
        items: {
          type: "object",
          required: ["message"],
          properties: { message: { type: "string" } },
        },
      },
    },
  },
};

function pickEnum<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const UNIT_OPTIONS: readonly TakeoffLineUnit[] = [
  "each",
  "lm",
  "m2",
  "m3",
  "kg",
  "bag",
  "sheet",
  "roll",
  "litre",
  "hr",
  "day",
];

const CATEGORY_OPTIONS: readonly TakeoffLine["category"][] = [
  "framing",
  "linings",
  "insulation",
  "fixings",
  "paint_plaster",
  "exterior",
  "fittings",
  "consumables",
  "labour",
  "other",
];

/**
 * Validate + normalise the model's `emit_takeoff` tool input. Pure; the runtime
 * retries once if this returns an error. `jobTextFallback` backfills
 * `understoodAs` when the model omits it.
 */
export function parseTakeoff(
  input: unknown,
  jobTextFallback = "",
): ParseResult<TakeoffResult> {
  const obj = (input ?? {}) as Partial<TakeoffResult>;

  const lines: TakeoffLine[] = Array.isArray(obj.lines)
    ? obj.lines
        .map((l) => {
          const rec = (l ?? {}) as Partial<TakeoffLine>;
          const q = typeof rec.quantity === "number" ? rec.quantity : null;
          return {
            description:
              typeof rec.description === "string" ? rec.description.trim() : "",
            quantity: q !== null && Number.isFinite(q) ? q : null,
            unit: pickEnum(rec.unit ?? null, UNIT_OPTIONS, "each") || null,
            note: typeof rec.note === "string" ? rec.note : null,
            ai_estimated:
              typeof rec.ai_estimated === "boolean" ? rec.ai_estimated : true,
            category: pickEnum(rec.category ?? "other", CATEGORY_OPTIONS, "other"),
          };
        })
        .filter((l) => l.description.length > 0)
    : [];

  if (lines.length === 0) {
    return {
      ok: false,
      error: "no material lines — extract at least one likely material",
    };
  }

  return {
    ok: true,
    value: {
      understoodAs:
        typeof obj.understoodAs === "string"
          ? obj.understoodAs
          : jobTextFallback.slice(0, 240),
      lines,
      assumptions: Array.isArray(obj.assumptions)
        ? obj.assumptions.filter((s): s is string => typeof s === "string")
        : [],
      reviewFlags: Array.isArray(obj.reviewFlags)
        ? obj.reviewFlags
            .map((f) => {
              const fr = (f ?? {}) as { message?: unknown };
              return typeof fr.message === "string"
                ? { message: fr.message }
                : null;
            })
            .filter((f): f is TakeoffReviewFlag => f !== null)
        : [],
    },
  };
}

/**
 * Display name on /app/agents/monitor. Exported so the route that mints the
 * run id logs against the SAME name the shared runtime writes — one
 * invocation must produce exactly one `agent_runs` row.
 */
export const MATERIALS_TAKEOFF_AGENT_NAME = "Materials Takeoff";

export async function runMaterialsTakeoffAgent(
  input: MaterialsTakeoffInput,
  opts: AgentRunOptions = {},
): Promise<TakeoffResult> {
  const jobText = (input.jobText ?? "").trim();
  if (jobText.length === 0) {
    throw new Error("Job description is empty.");
  }
  if (jobText.length > 10000) {
    throw new Error("Job description is too long (max 10000 characters).");
  }

  const country = input.country ?? "NZ";
  const userPrompt = `COUNTRY: ${country}\n\nJOB DESCRIPTION:\n"""\n${jobText}\n"""`;

  const result = await runStructuredAgent<TakeoffResult>({
    agentName: MATERIALS_TAKEOFF_AGENT_NAME,
    system: SYSTEM_PROMPT,
    user: userPrompt,
    tool: TAKEOFF_TOOL,
    parse: (raw) => parseTakeoff(raw, jobText),
    maxTokens: MAX_TOKENS,
    // Caller-supplied so the route and the runtime share one run row.
    runId: opts.runId,
  });

  return result.value;
}

/** Pure helper used by tests + UI — coerces an unknown unit string. */
export function normaliseUnit(input: string): TakeoffLineUnit {
  const s = input.toLowerCase().trim();
  if (s === "ea" || s === "each" || s === "pcs" || s === "pc") return "each";
  if (s === "m" || s === "metre" || s === "lm" || s === "linear metre") return "lm";
  if (s === "m2" || s === "sqm" || s === "m^2") return "m2";
  if (s === "m3" || s === "cubic metre" || s === "m^3") return "m3";
  if (s === "kg" || s === "kilo" || s === "kilogram") return "kg";
  if (s === "bag") return "bag";
  if (s === "sheet" || s === "panel") return "sheet";
  if (s === "roll") return "roll";
  if (s === "l" || s === "litre" || s === "liter") return "litre";
  if (s === "hr" || s === "hour" || s === "hrs") return "hr";
  if (s === "day" || s === "days") return "day";
  return "each";
}
