import { describe, expect, it } from "vitest";
import { AI_MODEL_DEFAULTS, aiModel } from "../models";

describe("AI model config", () => {
  it("keeps today's production ids as the defaults", () => {
    expect(AI_MODEL_DEFAULTS).toEqual({
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
    });
  });

  it("uses the default when no override is set", () => {
    expect(aiModel("drawingScan", {})).toBe("claude-opus-4-8");
    expect(aiModel("transcription", {})).toBe("gpt-4o-transcribe");
  });

  it("honours env overrides, trimmed, and ignores blanks", () => {
    expect(aiModel("planReader", { AI_MODEL_PLAN_READER: " claude-opus-5 " })).toBe("claude-opus-5");
    expect(aiModel("planReader", { AI_MODEL_PLAN_READER: "   " })).toBe("claude-opus-4-8");
  });

  it("keeps the pre-existing env names working", () => {
    expect(aiModel("quote", { ANTHROPIC_QUOTE_MODEL: "claude-opus-5" })).toBe("claude-opus-5");
    // The older name wins over the new alias when both are set.
    expect(aiModel("quote", { ANTHROPIC_QUOTE_MODEL: "a", AI_MODEL_QUOTE: "b" })).toBe("a");
    expect(aiModel("localFallback", { LOCAL_LLM_MODEL: "qwen-test" })).toBe("qwen-test");
  });
});
