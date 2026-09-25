/**
 * Photo / Plan Reading Agent — OpenAI Vision-backed.
 *
 * Takes an image (a phone photo of a wall, a sketched floor plan, a
 * sticker / spec label, an old drawing) and returns:
 *   • A plain-English description of what the model sees.
 *   • A list of likely materials / items it spotted, with explicit
 *     uncertainty flags.
 *   • A short "review flags" list — places where the model is unsure or
 *     where the human must measure on site.
 *
 * Critical safety rule: NEVER claim a measurement unless the image
 * literally contains a scale bar / tape / labelled dimension. The
 * model is instructed to say "approx" or "unknown" otherwise.
 *
 * Server-only. Needs OPENAI_API_KEY at runtime.
 */
import "server-only";
import {
  runOpenAIStructuredAgent,
  type OpenAIContentBlock,
} from "./openai-runtime";
import type { ParseResult } from "./runtime";
import { aiModel } from "@/lib/ai/models";

export interface PhotoPlanItem {
  /** Short label, e.g. "GIB plasterboard sheet (used)". */
  label: string;
  /** Where in the image (approx). E.g. "left wall, lower half". */
  location: string | null;
  /** Free-form note, condition, NZ trade context. */
  note: string | null;
  /** Confidence 0–1 the model assigned. */
  confidence: number;
  /** True = the item is a guess from visual context, not labelled. */
  ai_estimated: boolean;
}

export interface PhotoPlanResult {
  description: string;
  items: PhotoPlanItem[];
  /** Anything the human MUST measure or check on site. */
  reviewFlags: string[];
  /** Suggested quote-note text — paste-ready. */
  quoteNote: string;
}

export interface PhotoPlanInput {
  /** Image data, base64 (NOT a data URL). */
  imageBase64: string;
  /** MIME type, e.g. "image/jpeg". */
  mimeType: string;
  /** Optional context the user typed alongside the image. */
  hint?: string | null;
}

// The id lives in src/lib/ai/models.ts (role "photoPlan").
const MODEL = aiModel("photoPlan");
const MAX_TOKENS = 1500;

const SYSTEM_PROMPT = `You are an NZ-builder vision assistant. The user uploaded a photo or a sketched plan from a trade job.

Your job:
1. Describe what is in the image in plain English (2–4 sentences). NZ trade vocabulary preferred (GIB, H3.2, Pink Batts, Colorsteel, James Hardie).
2. List likely materials / fittings / items you spotted, each with:
   - confidence (0–1 you'd actually bet on it)
   - location (rough — "back wall", "top-left corner")
   - note (trade context: condition, replacement implications, treatment)
   - ai_estimated: true unless the image literally labels it
3. Add review flags whenever the human must measure or check on site:
   - No visible scale → can't quote dimensions
   - Possible asbestos / hazardous material
   - Load-bearing call needed
   - Hidden defect risk
4. Draft a "quoteNote" the tradie can paste into the quote — short, professional, NZ-builder voice, references the image.

CRITICAL: never claim a measurement (mm / m / m2) unless the image itself shows a scale bar, a tape measure, a labelled dimension, or a known-size reference (e.g. a standard 2400×1200 GIB sheet visibly intact). Default to "approx" or "unknown".

Return your answer by calling the emit_photo_plan tool. Do not reply with prose — only the tool call.`;

const PHOTO_PLAN_TOOL = {
  name: "emit_photo_plan",
  description: "Return what was seen in the trade photo / plan.",
  schema: {
    type: "object",
    required: ["description", "items", "reviewFlags", "quoteNote"],
    properties: {
      description: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["label", "confidence", "ai_estimated"],
          properties: {
            label: { type: "string" },
            location: { type: ["string", "null"] },
            note: { type: ["string", "null"] },
            confidence: { type: "number" },
            ai_estimated: { type: "boolean" },
          },
        },
      },
      reviewFlags: { type: "array", items: { type: "string" } },
      quoteNote: { type: "string" },
    },
  },
};

/** Validate + normalise the model's emit_photo_plan tool input. Pure. */
export function parsePhotoPlan(input: unknown): ParseResult<PhotoPlanResult> {
  const obj = (input ?? {}) as Partial<PhotoPlanResult>;
  const items: PhotoPlanItem[] = Array.isArray(obj.items)
    ? obj.items.map((rec) => {
        const r = (rec ?? {}) as Partial<PhotoPlanItem>;
        const c = typeof r.confidence === "number" ? r.confidence : 0.5;
        return {
          label: typeof r.label === "string" ? r.label.trim() : "(unlabelled item)",
          location: typeof r.location === "string" ? r.location : null,
          note: typeof r.note === "string" ? r.note : null,
          confidence: c < 0 ? 0 : c > 1 ? 1 : c,
          ai_estimated: typeof r.ai_estimated === "boolean" ? r.ai_estimated : true,
        };
      })
    : [];

  return {
    ok: true,
    value: {
      description:
        typeof obj.description === "string" && obj.description.length > 0
          ? obj.description
          : "(model returned no description)",
      items,
      reviewFlags: Array.isArray(obj.reviewFlags)
        ? obj.reviewFlags.filter((s): s is string => typeof s === "string")
        : [],
      quoteNote:
        typeof obj.quoteNote === "string" && obj.quoteNote.length > 0
          ? obj.quoteNote
          : "(model returned no quote note)",
    },
  };
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Max raw bytes accepted. Photos are usually 0.5–3 MB; cap at 8 MB. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Display name on /app/agents/monitor; the route logs against the same name. */
export const PHOTO_PLAN_AGENT_NAME = "Photo Plan";

export async function runPhotoPlanAgent(
  input: PhotoPlanInput,
  opts: { runId?: string } = {},
): Promise<PhotoPlanResult> {
  if (!input.imageBase64 || input.imageBase64.length === 0) {
    throw new Error("Image is empty.");
  }
  if (!ALLOWED_MIME.has(input.mimeType.toLowerCase())) {
    throw new Error(`Unsupported image type: ${input.mimeType}`);
  }
  // Rough byte estimate from base64 length: bytes ≈ b64Length * 3/4.
  const approxBytes = Math.floor((input.imageBase64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image is too large (~${(approxBytes / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`,
    );
  }

  const dataUrl = `data:${input.mimeType};base64,${input.imageBase64}`;
  const userText = [
    input.hint ? `Tradie note: ${input.hint}` : null,
    "Analyse the image and call the emit_photo_plan tool.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const userContent: OpenAIContentBlock[] = [
    { type: "text", text: userText },
    { type: "image_url", image_url: { url: dataUrl } },
  ];

  const result = await runOpenAIStructuredAgent<PhotoPlanResult>({
    agentName: PHOTO_PLAN_AGENT_NAME,
    system: SYSTEM_PROMPT,
    user: userContent,
    tool: PHOTO_PLAN_TOOL,
    parse: parsePhotoPlan,
    model: MODEL,
    maxTokens: MAX_TOKENS,
    // Caller-supplied so the route and the runtime share one run row.
    runId: opts.runId,
  });

  return result.value;
}
