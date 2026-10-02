import { describe, expect, it } from "vitest";
import { AiError } from "@/lib/ai/errors";
import { RUN_ENDING, classifyRejection, describeRejection } from "./rejection";

const bad = (detail: string, status = 400) => new AiError({ kind: "bad_request", provider: "anthropic", status, detail });

describe("classifyRejection", () => {
  it("an empty account is an account problem, whatever the status", () => {
    expect(classifyRejection(bad("invalid_request_error: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."))).toBe("account");
    expect(classifyRejection(new AiError({ kind: "auth", provider: "anthropic", status: 401 }))).toBe("account");
    expect(classifyRejection(new AiError({ kind: "auth", provider: "anthropic", status: 403, detail: "permission_error: nope" }))).toBe("account");
  });

  it("a structured-output schema the API can't compile is a setup problem, not 'too large'", () => {
    expect(classifyRejection(bad("invalid_request_error: output_config.format.schema: compiled grammar is too large"))).toBe("setup");
    expect(classifyRejection(bad("invalid_request_error: Schema is too complex for compilation"))).toBe("setup");
  });

  it("a model or setting the API refuses is a setup problem", () => {
    expect(classifyRejection(bad("not_found_error: model: claude-opus-9", 404))).toBe("setup");
    expect(classifyRejection(bad("invalid_request_error: output_config.effort: not supported for this model"))).toBe("setup");
  });

  it("a request that is too big is too_long, by status or by words", () => {
    expect(classifyRejection(bad("request_too_large: Request exceeds the maximum allowed number of bytes.", 413))).toBe("too_long");
    expect(classifyRejection(bad("invalid_request_error: prompt is too long: 213456 tokens > 200000 maximum"))).toBe("too_long");
    expect(classifyRejection(bad("invalid_request_error: A maximum of 100 PDF pages may be provided."))).toBe("too_long");
  });

  it("a page the service can't open is a pdf problem", () => {
    expect(classifyRejection(bad("invalid_request_error: messages.0.content.0.document.source.base64.data: The PDF specified was not valid."))).toBe("pdf");
    expect(classifyRejection(bad("invalid_request_error: Could not process PDF"))).toBe("pdf");
    expect(classifyRejection(bad("invalid_request_error: The PDF specified is password protected."))).toBe("pdf");
  });

  it("the fallback routing turned down is a beta problem (and wins over setup)", () => {
    expect(classifyRejection(bad("invalid_request_error: fallbacks: Extra inputs are not permitted"))).toBe("beta");
    expect(classifyRejection(bad("invalid_request_error: Unexpected value(s) `server-side-fallback-2026-07-01` for the `anthropic-beta` header."))).toBe("beta");
  });

  it("a 400 with no reason, or one we don't know, is 'other'", () => {
    expect(classifyRejection(bad(""))).toBe("other");
    expect(classifyRejection(bad("invalid_request_error: something new"))).toBe("other");
  });

  it("is not a rejection when the service was busy, slow, refused, or it wasn't an AI error at all", () => {
    expect(classifyRejection(new AiError({ kind: "overloaded", provider: "anthropic", status: 529 }))).toBeNull();
    expect(classifyRejection(new AiError({ kind: "timeout", provider: "anthropic" }))).toBeNull();
    expect(classifyRejection(new AiError({ kind: "refused", provider: "anthropic" }))).toBeNull();
    expect(classifyRejection(new Error("boom"))).toBeNull();
    expect(classifyRejection(undefined)).toBeNull();
  });

  it("only account and setup problems end the whole run", () => {
    expect([...RUN_ENDING].sort()).toEqual(["account", "setup"]);
  });
});

describe("describeRejection", () => {
  it("has a plain sentence for every kind, none of them leaking provider text", () => {
    for (const why of ["account", "setup", "too_long", "pdf", "beta", "other"] as const) {
      const text = describeRejection(why);
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/anthropic|400|invalid_request/i);
    }
  });
});
