import { describe, expect, it } from "vitest";
import { AiError, type AiErrorKind } from "./errors";
import { isExpectedAiError } from "./expected-errors";

describe("provider trouble that isn't a bug", () => {
  it.each<AiErrorKind>(["timeout", "rate_limited", "overloaded"])("%s is expected", (kind) => {
    expect(isExpectedAiError(new AiError({ kind, provider: "anthropic", attempts: 3 }))).toBe(true);
  });

  it.each<AiErrorKind>(["unavailable", "bad_request", "auth", "refused", "truncated", "invalid_output", "not_configured"])(
    "%s is still reported",
    (kind) => {
      expect(isExpectedAiError(new AiError({ kind, provider: "openai" }))).toBe(false);
    },
  );

  it("anything that isn't an AI error is reported", () => {
    expect(isExpectedAiError(new Error("timeout"))).toBe(false);
    expect(isExpectedAiError({ kind: "timeout" })).toBe(false);
    expect(isExpectedAiError(null)).toBe(false);
  });
});
