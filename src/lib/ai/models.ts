// ─────────────────────────────────────────────────────────────────────────
// The ONE place every AI model id lives.
//
// Every caller (the shared agent runtime, the quote pipeline, the drawing
// scan, the plan reader, the supplier-quote reader, the photo plan agent and
// voice transcription) reads its model from here. Each role takes an env
// override first — trimmed, blank ignored — and falls back to the default.
//
// The defaults are today's production ids. Changing one is a measured
// decision (run the evals first), not an edit scattered across routes.
//
// Browser-safe on purpose: src/lib/transcriptCleanup.ts is bundled into
// client code and reads the quote model from here. No secrets live in this
// file, and `process.env` lookups of unset names return undefined in the
// browser, so the defaults apply there.
// ─────────────────────────────────────────────────────────────────────────

export type AiModelRole =
  /** Shared agent runtime, `fast` tier (moderation, request questions). */
  | "agent.fast"
  /** Shared agent runtime, `default` tier (most agents). */
  | "agent.default"
  /** Shared agent runtime, `deep` tier. */
  | "agent.deep"
  /** Main quote pipeline and its transcript summary (hosted). */
  | "quote"
  /** Hand-drawn / CAD drawing scan (vision). */
  | "drawingScan"
  /** Plan reader: sheet classification and extraction (vision). */
  | "planReader"
  /** Supplier quote / invoice photo reader (vision). */
  | "supplierQuote"
  /** Photo / plan agent on OpenAI vision. */
  | "photoPlan"
  /** OpenAI structured runtime when a caller names no model. */
  | "openaiDefault"
  /** OpenAI speech-to-text for voice quotes. */
  | "transcription"
  /**
   * Self-hosted model id used by the transcript summary when LOCAL_LLM_MODEL
   * is unset. The quote and agent paths require LOCAL_LLM_MODEL instead.
   */
  | "localFallback";

export const AI_MODEL_DEFAULTS: Readonly<Record<AiModelRole, string>> = {
  "agent.fast": "claude-haiku-4-5",
  "agent.default": "claude-sonnet-5",
  "agent.deep": "claude-opus-4-8",
  quote: "claude-sonnet-5",
  drawingScan: "claude-opus-4-8",
  planReader: "claude-opus-4-8",
  supplierQuote: "claude-sonnet-5",
  photoPlan: "gpt-4o-mini",
  openaiDefault: "gpt-4o-mini",
  transcription: "gpt-4o-transcribe",
  localFallback: "qwen3.5-9b-uncensored",
};

/**
 * Env names checked in order for each role. `ANTHROPIC_QUOTE_MODEL` and
 * `LOCAL_LLM_MODEL` predate this file and keep working.
 */
export const AI_MODEL_ENV: Readonly<Record<AiModelRole, readonly string[]>> = {
  "agent.fast": ["AI_MODEL_AGENT_FAST"],
  "agent.default": ["AI_MODEL_AGENT_DEFAULT"],
  "agent.deep": ["AI_MODEL_AGENT_DEEP"],
  quote: ["ANTHROPIC_QUOTE_MODEL", "AI_MODEL_QUOTE"],
  drawingScan: ["AI_MODEL_DRAWING_SCAN"],
  planReader: ["AI_MODEL_PLAN_READER"],
  supplierQuote: ["AI_MODEL_SUPPLIER_QUOTE"],
  photoPlan: ["AI_MODEL_PHOTO_PLAN"],
  openaiDefault: ["AI_MODEL_OPENAI_DEFAULT"],
  transcription: ["AI_MODEL_TRANSCRIPTION"],
  localFallback: ["LOCAL_LLM_MODEL"],
};

type Env = Record<string, string | undefined>;

function currentEnv(): Env {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

/** Resolve the model id for a role: first non-blank env override, else the default. */
export function aiModel(role: AiModelRole, env: Env = currentEnv()): string {
  for (const name of AI_MODEL_ENV[role] ?? []) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return AI_MODEL_DEFAULTS[role] ?? AI_MODEL_DEFAULTS["agent.default"];
}
