import { describe, expect, it } from "vitest";
import {
  AI_ERROR_KINDS,
  AI_ERROR_MESSAGES,
  AiError,
  aiErrorResponse,
  classifyHttpStatus,
  describeAiError,
  parseProviderError,
  scrubSecrets,
} from "../errors";

describe("classifyHttpStatus", () => {
  it("maps statuses to kinds", () => {
    expect(classifyHttpStatus(429)).toBe("rate_limited");
    expect(classifyHttpStatus(529)).toBe("overloaded");
    expect(classifyHttpStatus(503)).toBe("overloaded");
    expect(classifyHttpStatus(408)).toBe("timeout");
    expect(classifyHttpStatus(504)).toBe("timeout");
    expect(classifyHttpStatus(500)).toBe("unavailable");
    expect(classifyHttpStatus(502)).toBe("unavailable");
    expect(classifyHttpStatus(409)).toBe("unavailable");
    expect(classifyHttpStatus(401)).toBe("auth");
    expect(classifyHttpStatus(403)).toBe("auth");
    expect(classifyHttpStatus(400)).toBe("bad_request");
    expect(classifyHttpStatus(404)).toBe("bad_request");
    expect(classifyHttpStatus(413)).toBe("bad_request");
  });

  it("prefers the provider's error type", () => {
    expect(classifyHttpStatus(500, "overloaded_error")).toBe("overloaded");
    expect(classifyHttpStatus(400, "rate_limit_error")).toBe("rate_limited");
    expect(classifyHttpStatus(400, "billing_error")).toBe("auth");
  });
});

describe("parseProviderError", () => {
  it("reads Anthropic and OpenAI error bodies", () => {
    expect(
      parseProviderError('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'),
    ).toEqual({ type: "overloaded_error", message: "Overloaded" });
    expect(
      parseProviderError('{"error":{"message":"Rate limit","code":"rate_limit_exceeded"}}'),
    ).toEqual({ type: "rate_limit_exceeded", message: "Rate limit" });
    expect(parseProviderError("<html>bad gateway</html>")).toEqual({ type: null, message: null });
  });
});

describe("AiError", () => {
  it("carries a plain message and a route status per kind", () => {
    for (const kind of AI_ERROR_KINDS) {
      const e = new AiError({ kind, provider: "anthropic" });
      expect(e.userMessage).toBe(AI_ERROR_MESSAGES[kind]);
      expect(e.userMessage).not.toMatch(/anthropic|openai|http|\{/i);
      expect(e.httpStatus).toBeGreaterThanOrEqual(400);
    }
  });

  it("clips and scrubs the server-side detail", () => {
    const e = new AiError({
      kind: "auth",
      provider: "anthropic",
      detail: `invalid x-api-key: sk-ant-api03-SECRETSECRET ${"x".repeat(600)}`,
    });
    expect(e.detail).not.toContain("SECRETSECRET");
    expect(e.detail.length).toBeLessThanOrEqual(301);
  });
});

describe("aiErrorResponse", () => {
  it("answers with the kind's plain sentence and status, never the detail", () => {
    const e = new AiError({
      kind: "overloaded",
      provider: "anthropic",
      status: 529,
      detail: 'overloaded_error: {"secret":"internal"}',
      retryAfterMs: 4_200,
    });
    const out = aiErrorResponse(e);
    expect(out.status).toBe(503);
    expect(out.body).toEqual({ error: AI_ERROR_MESSAGES.overloaded, code: "overloaded" });
    expect(JSON.stringify(out.body)).not.toContain("internal");
    expect(out.retryAfterSeconds).toBe(5);
  });

  it("lets a route phrase a kind for its feature", () => {
    const out = aiErrorResponse(new AiError({ kind: "timeout" }), {
      messages: { timeout: "Reading the photo took too long. Please try again." },
    });
    expect(out).toMatchObject({ status: 504, body: { error: "Reading the photo took too long. Please try again.", code: "timeout" } });
  });

  it("turns unknown errors into a generic 502 without their text", () => {
    const out = aiErrorResponse(new Error("Anthropic 529: {\"type\":\"error\"}"));
    expect(out.status).toBe(502);
    expect(out.body.code).toBe("unknown");
    expect(out.body.error).not.toContain("529");
  });
});

describe("helpers", () => {
  it("scrubs keys from text", () => {
    expect(scrubSecrets("Bearer sk-proj-abcdefgh1234 failed")).toBe("Bearer sk-[redacted] failed");
    expect(scrubSecrets('"x-api-key": "abc123"')).toContain("[redacted]");
  });

  it("describes errors for logs", () => {
    const e = new AiError({ kind: "rate_limited", provider: "openai", status: 429, attempts: 3, detail: "rate_limit_exceeded" });
    expect(describeAiError(e)).toBe("OpenAI rate limited (HTTP 429) after 3 attempts — rate_limit_exceeded");
    expect(describeAiError(new Error("boom"))).toBe("Error: boom");
  });
});
