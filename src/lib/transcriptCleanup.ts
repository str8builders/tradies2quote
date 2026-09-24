/**
 * Transcript cleanup — turn a raw voice/typed job description into:
 *
 *   1. A "cleaned trade transcript" — same words, NZ-trade spellings
 *      corrected mechanically.
 *   2. A list of corrections (before / after / type) for audit.
 *   3. A list of clarification questions where the cleaner couldn't
 *      decide between two equally plausible readings.
 *
 * The deterministic regex pass is fully testable in plain Node (no LLM
 * call). Higher-level structured summarisation (job type, dimensions,
 * compliance risks) lives in `buildSummaryWithClaude` and runs over the
 * already-cleaned text. The summary call is wrapped so a failure
 * downgrades to a "no summary" payload but never breaks quote saving.
 *
 * Hard rules — these are encoded into the regex pass and the prompt:
 *
 *   - Compact NZ-trade H-classes get expanded to their canonical
 *     decimal form (h32 → H3.2, h12 → H1.2, h42 → H4.2, h52 → H5.2)
 *     so the matcher's hard-filter sees the right class.
 *   - "jib" / "gyp" only become "GIB" when a plasterboard context word
 *     is nearby (sheet / board / lining / wall / ceiling / plasterboard)
 *     — otherwise leave alone and add a clarification. "job" is NEVER
 *     auto-corrected: it's too common a trade word ("job type", "job
 *     site") and rewriting it to GIB on incidental context corrupted
 *     real quotes.
 *   - "pink bats" / "pinkbatts" / "pink-bats" → "Pink Batts" only when
 *     it reads as the brand. The word "batten" / "battens" is preserved
 *     as timber unless the context says otherwise.
 *   - Numeric sizes spoken as "90 by 45" become "90x45" (regardless of
 *     whether 'by'/'×'/'x'/'-' was used) — mirrors materialNormalizer.
 *   - We NEVER invent materials. If a phrase is ambiguous, it stays in
 *     the cleaned transcript and a clarification question is emitted.
 */

import { applyGlossaryCorrections } from "./transcript/glossaryCorrect";
import { normalizeSpokenMeasurements } from "./transcript/measureNormalize";
import type { VocabSet, VocabTermType } from "./transcript/glossary";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";
import { parseModelJsonObject } from "@/lib/modelJson";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CorrectionType =
  | "treatment_class"
  | "brand_plasterboard"
  | "brand_insulation"
  | "size"
  | "supplier"
  | "brand_name"
  | "material_name"
  | "trade_term"
  | "other";

/** Where a correction came from, for the audit log. */
export type CorrectionSource =
  | "regex"
  | "global"
  | "supplier"
  | "materials_library"
  | "user_history";

export type Correction = {
  /** What was in the raw transcript. */
  before: string;
  /** What it became in the cleaned transcript. */
  after: string;
  /** Why the correction was applied. */
  type: CorrectionType;
  /** Approx character offset in the raw transcript (for highlighting). */
  index: number;
  /**
   * True when the correction depends on surrounding context — i.e. the
   * cleaner couldn't be sure from the phrase alone. The user may want
   * to double-check.
   */
  contextual?: boolean;
  /** Which vocabulary source drove the correction. Defaults to "regex". */
  source?: CorrectionSource;
  /** Plain-English why-it-changed, for the audit log. */
  reason?: string;
  /** 0..1 confidence in the correction. Auto-applied ones are high. */
  confidence?: number;
};

export type ClarificationItem = {
  /** Stable id, namespaced "transcript.*" to distinguish from compliance ones. */
  id: string;
  /** Question for the user. */
  question: string;
  /** Plain-English why-it-matters explanation. */
  why: string;
  /** The phrase from the raw transcript that triggered the question. */
  phrase: string;
};

/** Summary derived from the cleaned text. Fields may be null if unknown. */
export type TranscriptSummary = {
  job_type: string | null;
  site_or_client: string | null;
  dimensions: string | null;
  surface_context: string | null;
  exposure_context: string | null;
  material_assumptions: string[];
  missing_information: string[];
  compliance_risks: string[];
  /** 0..1 — engine's confidence that the summary is faithful. */
  confidence: number;
};

export type CleanedTranscript = {
  cleanedTranscript: string;
  summary: TranscriptSummary | null;
  corrections: Correction[];
  clarificationQuestions: ClarificationItem[];
  confidence: number;
  /** Server-side diagnostic — not surfaced on the public quote. */
  fallback?: "summary_failed" | "summary_disabled";
  fallbackReason?: string;
};

// ---------------------------------------------------------------------------
// Deterministic regex pass
// ---------------------------------------------------------------------------

/** Plasterboard context words used to decide jib/gyp/job → GIB. */
const PLASTERBOARD_CONTEXT_RE =
  /\b(sheets?|boards?|plasterboards?|linings?|lining|wall|walls|ceiling|ceilings|aqualine|braceline|noiseline)\b/i;

/** Insulation context words used to disambiguate "Pink Batts". */
const INSULATION_CONTEXT_RE =
  /\b(insulations?|R\s*\d(?:\.\d)?|ceilings?|walls?\s+thermal|acoustic|thermal\s+envelope)\b/i;

/** Timber context words for the batten case (kept timber when these apply). */
const TIMBER_CONTEXT_RE =
  /\b(timber|H[0-9](?:\.\d)?|treated|framing|45x|50x|75x|95x|100x|200x|240x|nogs?|studs?|joists?)\b/i;

/** Helper — does the input text contain `re` within ±N characters of pos? */
function nearbyMatch(text: string, pos: number, len: number, re: RegExp, span = 80): boolean {
  const start = Math.max(0, pos - span);
  const end = Math.min(text.length, pos + len + span);
  return re.test(text.slice(start, end));
}

/** Map a glossary term type onto the transcript CorrectionType union. */
function glossaryTypeToCorrectionType(t: VocabTermType): CorrectionType {
  switch (t) {
    case "supplier":
      return "supplier";
    case "brand":
      return "brand_name";
    case "material":
      return "material_name";
    case "trade_term":
      return "trade_term";
  }
}

/**
 * Apply all deterministic regex corrections, then (optionally) a vocabulary-
 * driven glossary pass. Returns the cleaned text, an audit list of
 * corrections, and clarification questions for ambiguous fragments we refuse
 * to guess.
 *
 * `vocab` is optional and backwards-compatible: without it the behaviour is
 * exactly the legacy regex-only pass. With it, supplier / brand / material /
 * trade-term spellings are corrected against the controlled vocabulary
 * (numbers preserved; only known terms applied; novel mishears flagged).
 */
export function applyDeterministicCorrections(
  raw: string,
  vocab?: VocabSet,
): {
  cleanedTranscript: string;
  corrections: Correction[];
  clarificationQuestions: ClarificationItem[];
} {
  if (!raw) {
    return { cleanedTranscript: "", corrections: [], clarificationQuestions: [] };
  }

  const corrections: Correction[] = [];
  const clarifications: ClarificationItem[] = [];
  let text = raw;

  // -------------------------------------------------------------------------
  // 0. Spoken measurements → digits (measurement contexts ONLY; audited;
  // digits never altered; [T2Q_…] marker lines untouched). This is what lets
  // "ten metres by two point four" reach the dimension-extraction regexes
  // downstream — they all need digits. See measureNormalize.ts for the
  // safety rules.
  // -------------------------------------------------------------------------
  {
    const measured = normalizeSpokenMeasurements(text);
    text = measured.text;
    for (const c of measured.corrections) {
      corrections.push({
        before: c.before,
        after: c.after,
        type: "size",
        index: c.index,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 1. Compact H-classes (h32 → H3.2 etc.). Run BEFORE simple "h3" matches
  // so we don't half-replace a compact form.
  // -------------------------------------------------------------------------
  const compactClasses: Array<[RegExp, string]> = [
    [/\bh12\b/gi, "H1.2"],
    [/\bh31\b/gi, "H3.1"],
    [/\bh32\b/gi, "H3.2"],
    [/\bh42\b/gi, "H4.2"],
    [/\bh52\b/gi, "H5.2"],
  ];
  for (const [re, target] of compactClasses) {
    text = text.replace(re, (m, offset: number) => {
      corrections.push({
        before: m,
        after: target,
        type: "treatment_class",
        index: offset,
      });
      return target;
    });
  }

  // Capitalise standalone classes (h1, h3, h4, h5 → H1, H3, H4, H5) so
  // the rest of the pipeline sees the canonical form. (h12/h32/h42/h52
  // were already converted above and don't match this regex.)
  text = text.replace(/\bh([1-5])(?!\d)\b/g, (m, digit: string, offset: number) => {
    const target = `H${digit}`;
    corrections.push({
      before: m,
      after: target,
      type: "treatment_class",
      index: offset,
    });
    return target;
  });

  // -------------------------------------------------------------------------
  // 2. jib / gyp → GIB (plasterboard context required)
  //
  // "job" is deliberately NOT in this list. It's one of the most common
  // words in a job description ("job type", "job site", "this job"), and
  // rewriting it to GIB on incidental nearby context (a stray digit + the
  // word "board") corrupted ~16% of real transcripts — including our own
  // "Job type:" scaffold becoming "GIB type:". Genuine GIB mishears come
  // through as "jib" / "gyp", which are handled here.
  // -------------------------------------------------------------------------
  text = text.replace(/\b(jib|gyp)\b/gi, (m, _w, offset: number) => {
    if (!nearbyMatch(text, offset, m.length, PLASTERBOARD_CONTEXT_RE)) {
      // jib / gyp without plasterboard context — refuse the rewrite
      // and emit a clarification so the user can confirm intent.
      clarifications.push({
        id: `transcript.gib.${offset}`,
        question: `Did you mean GIB plasterboard at "${m}"?`,
        why: "GIB is the NZ plasterboard brand. We only auto-correct 'jib'/'gyp' when a plasterboard context word is nearby.",
        phrase: m,
      });
      return m;
    }
    corrections.push({
      before: m,
      after: "GIB",
      type: "brand_plasterboard",
      index: offset,
      contextual: true,
    });
    return "GIB";
  });

  // -------------------------------------------------------------------------
  // 3. pink bats / pinkbatts / pink-bats → Pink Batts
  //
  // We only rewrite when the next word context is insulation (R-value,
  // ceiling, wall thermal, acoustic, etc.). If the surrounding tokens
  // say "batten" / "timber" / "H3.2", we leave the original alone and
  // add a clarification — it might really mean a timber batten.
  // -------------------------------------------------------------------------
  text = text.replace(
    /\bpink[\s-]*bat(?:t?s?)\b/gi,
    (m, offset: number) => {
      if (nearbyMatch(text, offset, m.length, TIMBER_CONTEXT_RE, 40)) {
        clarifications.push({
          id: `transcript.batts.${offset}`,
          question: `Did you mean Pink Batts insulation at "${m}", or a timber batten?`,
          why: "Pink Batts is the wall/ceiling insulation brand. 'Batten' is timber framing — they sound similar but use very different materials.",
          phrase: m,
        });
        return m;
      }
      corrections.push({
        before: m,
        after: "Pink Batts",
        type: "brand_insulation",
        index: offset,
        contextual: true,
      });
      return "Pink Batts";
    },
  );

  // -------------------------------------------------------------------------
  // 4. Sizes — "90 by 45" / "90 × 45" / "90 - 45" → "90x45"
  //
  // We only rewrite when both numbers are 2–4 digits (typical timber/sheet
  // dimensions). "10 by 5 cars" should NOT be rewritten, but realistically
  // 2-digit pairs in trade descriptions are sizes. Lower bound chosen to
  // avoid common phrases like "1 of 2".
  // -------------------------------------------------------------------------
  text = text.replace(
    /\b(\d{2,4})\s*(?:by|×|x)\s*(\d{2,4})\b/gi,
    (m, a: string, b: string, offset: number) => {
      const target = `${a}x${b}`;
      if (m === target) return m; // already in canonical form
      corrections.push({
        before: m,
        after: target,
        type: "size",
        index: offset,
      });
      return target;
    },
  );

  // -------------------------------------------------------------------------
  // 4b. Thickness — "12 mil" / "12 mils" / "12 millimetres" → "12mm", and
  // tighten a spaced "12 mm" to "12mm". Tradies say "mil" for millimetres
  // (13 mil GIB, 12 mil ply). Bounded to 1–3 digits so it only ever touches
  // real thicknesses, and "million" is safe (the \b after "mil" never
  // matches inside "million").
  // -------------------------------------------------------------------------
  text = text.replace(
    /\b(\d{1,3})\s*(?:mils?|millimet(?:re|er)s?|mm)\b/gi,
    (m, n: string, offset: number, full: string) => {
      // Decimal guard: "1.5 mil" is money slang ("$1.5 million"), not a
      // thickness — \b lets the match start mid-number after the point, so
      // check the preceding character explicitly.
      const prev = full[offset - 1];
      if (prev === "." || prev === ",") return m;
      const target = `${n}mm`;
      if (m === target) return m; // already canonical "12mm"
      corrections.push({
        before: m,
        after: target,
        type: "size",
        index: offset,
      });
      return target;
    },
  );

  // -------------------------------------------------------------------------
  // 5. "battens" emit a clarification when an insulation-context word is
  // nearby — covered already in step 3 for the Pink Batts case, but a
  // bare "battens" with insulation context is also worth flagging.
  // -------------------------------------------------------------------------
  text.replace(
    /\bbattens?\b/gi,
    (m, offset: number) => {
      if (
        nearbyMatch(text, offset, m.length, INSULATION_CONTEXT_RE, 40) &&
        !nearbyMatch(text, offset, m.length, TIMBER_CONTEXT_RE, 40)
      ) {
        clarifications.push({
          id: `transcript.battens.${offset}`,
          question: `Is "${m}" timber battens or Pink Batts insulation?`,
          why: "These two words sound alike. Timber battens are framing; Pink Batts is insulation.",
          phrase: m,
        });
      }
      return m;
    },
  );

  // Tag the regex-origin corrections before merging the glossary ones.
  for (const c of corrections) c.source ??= "regex";

  // Vocabulary-driven glossary pass (optional). Runs over the already
  // regex-cleaned text so the two never fight; appends its corrections +
  // clarifications. Pure, no LLM, numbers preserved.
  if (vocab && vocab.entries.length > 0) {
    const glossary = applyGlossaryCorrections(text, vocab);
    text = glossary.cleanedText;
    for (const gc of glossary.corrections) {
      corrections.push({
        before: gc.before,
        after: gc.after,
        type: glossaryTypeToCorrectionType(gc.type),
        index: gc.index,
        source: gc.source,
        reason: gc.reason,
        confidence: gc.confidence,
      });
    }
    for (const gq of glossary.clarifications) {
      clarifications.push({
        id: gq.id,
        question: gq.question,
        why: gq.why,
        phrase: gq.phrase,
      });
    }
  }

  // Sort corrections by position so the panel can highlight in order.
  corrections.sort((a, b) => a.index - b.index);

  return { cleanedTranscript: text, corrections, clarificationQuestions: clarifications };
}

// ---------------------------------------------------------------------------
// LLM summary (Anthropic) — optional layer over the deterministic pass
// ---------------------------------------------------------------------------

const SUMMARY_SYSTEM_PROMPT = `You are a NZ building-trade assistant. Given a CLEANED job description, return a strictly JSON summary with this exact shape:

{
  "job_type": string|null,
  "site_or_client": string|null,
  "dimensions": string|null,
  "surface_context": string|null,
  "exposure_context": string|null,
  "material_assumptions": string[],
  "missing_information": string[],
  "compliance_risks": string[],
  "confidence": number
}

Rules:
- Output VALID JSON. No markdown fences, no commentary, no trailing text.
- Preserve the user's exact words for client names, site addresses, brands, model names, dimensions, and quantities. Never invent.
- "surface_context" describes what's being built (wall / floor / roof / deck) — null if unclear.
- "exposure_context" is internal/external/wet/exposed — null if unclear.

QUOTE-CRITICAL FILTER — only the next three arrays are surfaced to
the tradie as questions before the quote is generated. The tradie
already reviews the line items afterwards, so anything they can
fix on the review page should NOT appear here. Limit each array to
the items that will materially change the QUOTE itself
(price, line count, materials chosen, labour hours, compliance pass/fail).

- "material_assumptions": ONLY include materials where:
  * The inferred grade/thickness/treatment changes the unit price by
    20%+ compared to a different reasonable inference (e.g. GIB
    Standard 13mm vs GIB Aqualine 13mm), OR
  * The wrong inference would fail NZ Building Code (e.g. assuming
    H1.2 framing where H3.2 is required).
  Skip generic confirmations the tradie can spot-check on the line items.
  Hard limit: 3 items maximum. Pick the highest-stakes ones.

- "missing_information": ONLY include facts that change the quote total:
  * Material quantities the tradie did not give (e.g. "how many m² of
    wall lining?", "how many sheets of bracing?").
  * Labour hours not specified for a major task (e.g. "how long to
    demolish existing wall?").
  * Site-access facts that change labour (e.g. "second-storey access
    via scaffold or ladder?").
  EXCLUDE: client preferences (paint colour, finish, brand colour),
  scheduling, site address, client contact, drawings availability,
  permit/consent status (those go on the quote terms, not the price).
  Hard limit: 3 items maximum. Phrase each as a direct question
  ending with "?".

- "compliance_risks": ONLY include items that affect NZ Building
  Code pass/fail or insurance (treatment class for exposed timber,
  bracing element under E2/B1, fire-rated GIB where required,
  insulation R-value under H1, fastener finish under E1/H3+).
  Skip generic safety reminders. Hard limit: 3 items maximum.

- "confidence" is between 0 and 1 (1 = no ambiguity).

Always under 9 items across the three arrays combined. If the
recording is clear and quote-ready, return all three arrays empty —
that's the correct answer and the modal will not open.

If you cannot summarise faithfully, return null for unknown fields and a low confidence — DO NOT guess.`;

/** Test seam: replace the network call in unit tests. */
export type AnthropicCallable = (
  args: {
    apiKey: string;
    system: string;
    user: string;
    model: string;
    maxTokens: number;
  },
) => Promise<string>;

/** Default local OpenAI-compatible call (used in production). */
async function callLocalSummary({
  apiKey,
  system,
  user,
  model,
  maxTokens,
}: {
  apiKey: string;
  system: string;
  user: string;
  model: string;
  maxTokens: number;
}): Promise<string> {
  const baseUrl = process.env.LOCAL_LLM_BASE_URL?.trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("LOCAL_LLM_BASE_URL is not configured.");
  const parsedUrl = new URL(baseUrl);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("LOCAL_LLM_BASE_URL must use HTTP or HTTPS.");
  }
  const timeoutValue = Number(process.env.LOCAL_LLM_TIMEOUT_MS);
  const timeoutMs =
    Number.isInteger(timeoutValue) && timeoutValue > 0
      ? timeoutValue
      : 30 * 60 * 1000;
  const maxTokensCeilingValue = Number(process.env.LOCAL_LLM_MAX_TOKENS);
  const maxTokensCeiling =
    Number.isInteger(maxTokensCeilingValue) && maxTokensCeilingValue > 0
      ? maxTokensCeilingValue
      : 2048;
  const summarySchema = {
    type: "object",
    additionalProperties: false,
    required: [
      "job_type",
      "site_or_client",
      "dimensions",
      "surface_context",
      "exposure_context",
      "material_assumptions",
      "missing_information",
      "compliance_risks",
      "confidence",
    ],
    properties: {
      job_type: { type: ["string", "null"] },
      site_or_client: { type: ["string", "null"] },
      dimensions: { type: ["string", "null"] },
      surface_context: { type: ["string", "null"] },
      exposure_context: { type: ["string", "null"] },
      material_assumptions: { type: "array", items: { type: "string" } },
      missing_information: { type: "array", items: { type: "string" } },
      compliance_risks: { type: "array", items: { type: "string" } },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
  };
  const res = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(maxTokens, maxTokensCeiling),
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "transcript_summary",
            strict: true,
            schema: summarySchema,
          },
        },
      }),
    },
    timeoutMs,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Local LLM ${res.status}: ${detail.slice(0, 200)}`);
  }
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return payload.choices?.[0]?.message?.content ?? "";
}

// Keep this transport browser-import-safe: this module also supplies the
// deterministic cleanup used by client code. Never import the server-only
// quote completion module here.
const callHostedSummary: AnthropicCallable = async ({ apiKey, system, user, model, maxTokens }) => {
  const res = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        // Current Claude models think adaptively inside max_tokens. At the
        // default effort the reasoning alone ate a 768-token cap and every
        // summary came back truncated; low effort is plenty for a fixed
        // JSON shape and keeps the answer inside the budget.
        output_config: { effort: "low" },
        system,
        messages: [{ role: "user", content: user }],
      }),
    },
    TIMEOUTS.llm,
  );
  if (!res.ok) throw new Error(`Summary provider returned HTTP ${res.status}`);
  const payload = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  };
  if (payload.stop_reason === "max_tokens") throw new Error("Summary response was truncated");
  return payload.content?.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n") ?? "";
};

/**
 * A swallowed summary failure, WITHOUT personal data: the stage, the
 * error's class name and the provider's HTTP status (parsed from our own
 * "HTTP 503"-style messages). The error message, transcript and model text
 * are never included — a parse error can quote the model's reply, which
 * quotes the job.
 */
export type SummaryFailureReport = {
  stage: "call" | "parse";
  httpStatus?: number;
  errorName: string;
};

function summaryFailure(
  stage: SummaryFailureReport["stage"],
  e: unknown,
): SummaryFailureReport {
  const status =
    e instanceof Error ? /\bHTTP (\d{3})\b/.exec(e.message)?.[1] : undefined;
  return {
    stage,
    ...(status ? { httpStatus: Number(status) } : {}),
    errorName: e instanceof Error ? e.name : typeof e,
  };
}

export type BuildSummaryOptions = {
  /**
   * Called whenever the summary fails and degrades to null, so the failure
   * is never silent. Server callers pass `reportSummaryFailureToMonitor`
   * (src/lib/transcript/summaryMonitoring.ts → the internal error monitor).
   * Injected rather than imported because this module is also bundled in
   * the browser (the Voice Cleanup agent) and the monitor is server-only.
   */
  onSummaryFailure?: (report: SummaryFailureReport) => void;
  apiKey?: string;
  /** Defaults to the selected provider's model. */
  model?: string;
  /** Legacy-named test seam — pass a fake to avoid hitting the model. */
  callAnthropic?: AnthropicCallable;
};

/**
 * Build the structured summary from the cleaned transcript using the
 * configured text model. Returns null on any failure — caller must handle.
 */
export async function buildSummary(
  cleanedTranscript: string,
  options: BuildSummaryOptions = {},
): Promise<TranscriptSummary | null> {
  if (process.env.TRANSCRIPT_SUMMARY?.trim().toLowerCase() === "off") return null;
  const local = process.env.TEXT_AI_PROVIDER?.trim().toLowerCase() === "local";
  const apiKey = options.apiKey ?? (local ? process.env.LOCAL_LLM_API_KEY : process.env.ANTHROPIC_API_KEY);
  if (!apiKey) return null;
  const model = options.model ?? (local
    ? process.env.LOCAL_LLM_MODEL?.trim() || "qwen3.5-9b-uncensored"
    : process.env.ANTHROPIC_QUOTE_MODEL?.trim() || "claude-sonnet-5");
  const fn = options.callAnthropic ?? (local ? callLocalSummary : callHostedSummary);

  let raw: string;
  try {
    raw = await fn({
      apiKey,
      system: SUMMARY_SYSTEM_PROMPT,
      user: cleanedTranscript,
      model,
      // The summary shape is compact (~300 tokens). Local CPU inference stays
      // bounded at 768; the hosted model gets headroom for its reasoning.
      maxTokens: local ? 768 : 2048,
    });
  } catch (e) {
    // Degrade to "no summary" as before, but never silently (PII-free).
    options.onSummaryFailure?.(summaryFailure("call", e));
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseModelJsonObject<unknown>(raw);
  } catch (e) {
    options.onSummaryFailure?.(summaryFailure("parse", e));
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  // Coerce — defensive parsing because we cannot trust the LLM completely.
  const stringOrNull = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v : null;
  const stringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const number01 = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  };

  return {
    job_type: stringOrNull(obj.job_type),
    site_or_client: stringOrNull(obj.site_or_client),
    dimensions: stringOrNull(obj.dimensions),
    surface_context: stringOrNull(obj.surface_context),
    exposure_context: stringOrNull(obj.exposure_context),
    material_assumptions: stringArray(obj.material_assumptions),
    missing_information: stringArray(obj.missing_information),
    compliance_risks: stringArray(obj.compliance_risks),
    confidence: number01(obj.confidence),
  };
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export type CleanTranscriptOptions = BuildSummaryOptions & {
  /** Skip the LLM summary call entirely (used by tests + offline mode). */
  summaryDisabled?: boolean;
  /**
   * Controlled vocabulary for the glossary correction pass (suppliers,
   * brands, materials, trade terms). Omit for the legacy regex-only behaviour.
   */
  vocab?: VocabSet;
};

/**
 * High-level cleanup: deterministic regex pass + optional LLM summary.
 * Never throws — failures degrade to a transcript without a summary.
 */
export async function cleanTranscript(
  raw: string,
  options: CleanTranscriptOptions = {},
): Promise<CleanedTranscript> {
  const det = applyDeterministicCorrections(raw, options.vocab);

  if (options.summaryDisabled || process.env.TRANSCRIPT_SUMMARY?.trim().toLowerCase() === "off") {
    return {
      cleanedTranscript: det.cleanedTranscript,
      summary: null,
      corrections: det.corrections,
      clarificationQuestions: det.clarificationQuestions,
      confidence: det.clarificationQuestions.length === 0 ? 0.85 : 0.6,
      fallback: "summary_disabled",
    };
  }

  let summary: TranscriptSummary | null = null;
  let fallback: CleanedTranscript["fallback"] | undefined;
  let fallbackReason: string | undefined;
  try {
    summary = await buildSummary(det.cleanedTranscript, options);
    if (!summary) {
      fallback = "summary_failed";
      fallbackReason = "Text model returned null or unparsable JSON";
    }
  } catch (err) {
    fallback = "summary_failed";
    fallbackReason = err instanceof Error ? err.message : String(err);
    options.onSummaryFailure?.(summaryFailure("call", err));
  }

  // Combined confidence: summary's confidence (or 0.5 fallback) discounted
  // by clarifications outstanding.
  const summaryConfidence = summary?.confidence ?? 0.5;
  const clarificationPenalty = Math.min(
    0.4,
    det.clarificationQuestions.length * 0.1,
  );
  const confidence = Math.max(0, summaryConfidence - clarificationPenalty);

  return {
    cleanedTranscript: det.cleanedTranscript,
    summary,
    corrections: det.corrections,
    clarificationQuestions: det.clarificationQuestions,
    confidence,
    fallback,
    fallbackReason,
  };
}
