// ─────────────────────────────────────────────────────────────────────────
// Plan-reader — sheet classifier (Phase 1).
//
// Labels ONE plan page as deck | floor_plan | foundation | elevation |
// section_detail | schedule | unknown, with a confidence in [0,1] and an
// auditable `basis` (which signals voted).
//
// Three signals, combined:
//   1. filename hints      (pure, deterministic, tested)
//   2. title-block / OCR text hints (pure, deterministic, tested)
//   3. vision features      (Claude call — async, optional)
//
// Design rule from the brief: do NOT process unknown/low-confidence sheets
// as if they were a known type. So when nothing votes confidently we return
// `unknown` and the caller sets review_required — never a hopeful guess.
// ─────────────────────────────────────────────────────────────────────────

import {
  parseSheetClassification,
  type SheetClassification,
  type SheetType,
} from "./schema";
import { TIMEOUTS } from "@/lib/fetchTimeout";
import { aiModel } from "@/lib/ai/models";
import { callAnthropic, EPHEMERAL_CACHE } from "@/lib/ai/anthropic";
import { isAiError } from "@/lib/ai/errors";
import type { RetryOptions } from "@/lib/ai/http";

// ── Keyword tables ────────────────────────────────────────────────────────
//
// Each supported/recognized type maps to lowercase keyword fragments. Weights
// let a strong, specific term ("foundation plan") outvote a weak, ambiguous
// one ("plan"). These are clean-room trade vocabulary, not copyrighted text.

type Keyword = { term: string; weight: number };

const KEYWORDS: Record<Exclude<SheetType, "unknown">, Keyword[]> = {
  deck: [
    { term: "deck", weight: 1.0 },
    { term: "decking", weight: 1.0 },
    { term: "pergola", weight: 0.5 },
    { term: "joist layout", weight: 0.6 },
    { term: "bearer", weight: 0.4 },
  ],
  floor_plan: [
    { term: "floor plan", weight: 1.0 },
    { term: "floorplan", weight: 1.0 },
    { term: "ground floor", weight: 0.9 },
    { term: "first floor", weight: 0.9 },
    { term: "level 1", weight: 0.5 },
    { term: "layout plan", weight: 0.7 },
    { term: "building layout", weight: 0.8 },
    { term: "room", weight: 0.3 },
  ],
  foundation: [
    { term: "foundation", weight: 1.0 },
    { term: "footing", weight: 0.9 },
    { term: "slab", weight: 0.8 },
    { term: "pile layout", weight: 0.7 },
    { term: "subfloor", weight: 0.6 },
    { term: "reinforc", weight: 0.5 }, // reinforcing / reinforcement
    { term: "mesh", weight: 0.4 },
  ],
  elevation: [
    { term: "elevation", weight: 1.0 },
    { term: "north elevation", weight: 1.0 },
    { term: "south elevation", weight: 1.0 },
    { term: "east elevation", weight: 1.0 },
    { term: "west elevation", weight: 1.0 },
  ],
  section_detail: [
    { term: "section", weight: 0.9 },
    { term: "detail", weight: 0.8 },
    { term: "cross section", weight: 1.0 },
    { term: "typical detail", weight: 1.0 },
  ],
  schedule: [
    { term: "schedule", weight: 1.0 },
    { term: "door schedule", weight: 1.0 },
    { term: "window schedule", weight: 1.0 },
    { term: "finishes schedule", weight: 1.0 },
    { term: "joinery schedule", weight: 1.0 },
  ],
};

/** Score every type against a lowercased haystack; returns weighted hits. */
function scoreText(
  haystack: string,
  label: string,
): Array<{ type: Exclude<SheetType, "unknown">; score: number; hits: string[] }> {
  const text = haystack.toLowerCase();
  return (Object.keys(KEYWORDS) as Array<Exclude<SheetType, "unknown">>).map(
    (type) => {
      let score = 0;
      const hits: string[] = [];
      for (const { term, weight } of KEYWORDS[type]) {
        if (text.includes(term)) {
          score += weight;
          hits.push(`${label}:${term}`);
        }
      }
      return { type, score, hits };
    },
  );
}

// ── Pure heuristic classifier (filename + title-block text) ───────────────

export type HeuristicInput = {
  filename?: string | null;
  /** Concatenated title-block / OCR text for the sheet, if available. */
  titleBlockText?: string | null;
};

/**
 * Deterministic, network-free classification from text signals alone.
 * Confidence here is conservative — text hints rarely exceed ~0.75 on their
 * own; vision (if available) can push a sheet over the extraction threshold.
 */
export function classifyFromText(input: HeuristicInput): SheetClassification {
  const fileScores = input.filename
    ? scoreText(input.filename, "filename")
    : [];
  const blockScores = input.titleBlockText
    ? scoreText(input.titleBlockText, "titleblock")
    : [];

  // Title-block text is more reliable than a filename, so weight it higher.
  const combined = new Map<
    Exclude<SheetType, "unknown">,
    { score: number; hits: string[] }
  >();
  const add = (
    rows: ReturnType<typeof scoreText>,
    multiplier: number,
  ) => {
    for (const r of rows) {
      if (r.score <= 0) continue;
      const cur = combined.get(r.type) ?? { score: 0, hits: [] };
      cur.score += r.score * multiplier;
      cur.hits.push(...r.hits);
      combined.set(r.type, cur);
    }
  };
  add(fileScores, 0.6);
  add(blockScores, 1.0);

  if (combined.size === 0) {
    return { sheet_type: "unknown", confidence: 0, basis: [] };
  }

  const ranked = [...combined.entries()].sort((a, b) => b[1].score - a[1].score);
  const [topType, top] = ranked[0];
  const runnerScore = ranked[1]?.[1].score ?? 0;

  // Confidence: saturating function of the winning score, penalised when a
  // runner-up is close (ambiguous sheet).
  const margin = top.score - runnerScore;
  const raw = 1 - Math.exp(-0.9 * top.score); // 0..~1, rises with evidence
  const ambiguityPenalty = top.score > 0 ? Math.min(0.4, runnerScore / (top.score + runnerScore) * 0.8) : 0;
  const confidence = Math.max(
    0,
    Math.min(0.9, raw - ambiguityPenalty + Math.min(0.1, margin * 0.05)),
  );

  return {
    sheet_type: topType,
    confidence: Math.round(confidence * 100) / 100,
    basis: top.hits,
  };
}

// ── Vision classifier (Claude) ────────────────────────────────────────────

const VISION_SYSTEM = `You are a construction-drawing sheet classifier. You are shown ONE page from a set of building plans. Identify which single category best describes the sheet.

Categories (use these exact ids):
- deck: a deck/pergola plan — decking boards, joists, bearers, posts/piles for an outdoor timber structure.
- floor_plan: a building floor/layout plan — rooms, walls, doors, windows seen in plan view from above.
- foundation: a foundation/footing/slab/pile layout — concrete footings, slab outline, pile positions, reinforcing/mesh.
- elevation: an exterior elevation (a view of one face of the building).
- section_detail: a cross-section or construction detail.
- schedule: a table/schedule (door, window, finishes, joinery).
- unknown: you cannot tell, or it is none of the above.

Rules:
- Judge ONLY from what you can see. Do NOT guess from a faint resemblance.
- If two categories are plausible or the image is unclear, return "unknown".
- Respond with ONLY a JSON object: {"sheet_type": "<id>", "confidence": <0..1>, "reason": "<short>"}.`;

export type VisionClassifyDeps = RetryOptions & {
  apiKey: string;
  /** base64-encoded page image. */
  imageBase64: string;
  /** Image media type (e.g. "image/png", "image/jpeg"). Defaults to PNG. */
  mediaType?: string;
  /** Optional override for tests/injection. */
  fetchImpl?: typeof fetch;
  /**
   * Told about a failed vision call (after the shared client's retries) so
   * the route can report it; the verdict still degrades to unknown@0.
   */
  onError?: (error: unknown) => void;
};

/**
 * Ask the vision model to classify a single page image. Returns a validated
 * SheetClassification, or unknown@0 on any error (never throws into the
 * caller — an unreadable sheet must degrade to review, not crash ingest).
 * Timeout and retries come from the shared AI client.
 */
export async function classifyFromVision(
  deps: VisionClassifyDeps,
): Promise<SheetClassification> {
  try {
    const reply = await callAnthropic({
      apiKey: deps.apiKey,
      body: {
        model: aiModel("planReader"),
        max_tokens: 256,
        // Static instructions as the cacheable prefix (below Opus 4.8's
        // 1,024-token minimum today, so the API simply doesn't cache it).
        system: [{ type: "text", text: VISION_SYSTEM, cache_control: EPHEMERAL_CACHE }],
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
              { type: "text", text: "Classify this sheet." },
            ],
          },
        ],
      },
      timeoutMs: TIMEOUTS.llm,
      fetchImpl: deps.fetchImpl,
      onTruncated: "return",
      maxAttempts: deps.maxAttempts,
      budgetMs: deps.budgetMs,
      sleep: deps.sleep,
      random: deps.random,
      now: deps.now,
    });
    const obj = safeJson(reply.text);
    const parsed = parseSheetClassification(obj);
    if (!parsed.ok) return { sheet_type: "unknown", confidence: 0, basis: ["vision:unparsable"] };
    return {
      ...parsed.value,
      basis: [
        `vision:${parsed.value.sheet_type}@${parsed.value.confidence.toFixed(2)}`,
      ],
    };
  } catch (e) {
    deps.onError?.(e);
    if (isAiError(e) && e.status !== null) {
      return { sheet_type: "unknown", confidence: 0, basis: [`vision:http_${e.status}`] };
    }
    return { sheet_type: "unknown", confidence: 0, basis: ["vision:error"] };
  }
}

function safeJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ── Combiner ──────────────────────────────────────────────────────────────

/**
 * Merge the text heuristic with an (optional) vision verdict into a final
 * classification. When both agree, confidence is boosted; when they disagree,
 * we take the higher-confidence one but record the conflict in `basis` and
 * cap confidence so the gate is more likely to ask for review.
 */
export function combineClassification(
  text: SheetClassification,
  vision?: SheetClassification | null,
): SheetClassification {
  if (!vision || vision.sheet_type === "unknown") {
    return text;
  }
  if (text.sheet_type === "unknown") {
    return vision;
  }
  if (text.sheet_type === vision.sheet_type) {
    return {
      sheet_type: text.sheet_type,
      confidence: Math.min(
        0.98,
        Math.round((text.confidence + vision.confidence * (1 - text.confidence)) * 100) / 100,
      ),
      basis: [...text.basis, ...vision.basis, "agree"],
    };
  }
  // Conflict — trust the stronger signal but cap and flag.
  const winner = vision.confidence >= text.confidence ? vision : text;
  return {
    sheet_type: winner.sheet_type,
    confidence: Math.min(0.6, winner.confidence),
    basis: [
      ...text.basis,
      ...vision.basis,
      `conflict:text=${text.sheet_type},vision=${vision.sheet_type}`,
    ],
  };
}
