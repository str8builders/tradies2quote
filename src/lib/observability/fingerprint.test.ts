import { describe, expect, it } from "vitest";
import {
  buildErrorRow,
  buildFingerprint,
  extractTopFrame,
  normalizeMessage,
  scrubText,
  truncate,
} from "./fingerprint";

describe("scrubText — redacts PII / secret-shaped tokens", () => {
  it("redacts emails, bearer tokens, key-shaped strings, JWTs", () => {
    expect(scrubText("user bob@example.com failed")).toContain("<email>");
    expect(scrubText("Authorization: Bearer abc.def-123")).toContain("Bearer <redacted>");
    expect(scrubText("key=sk_live_ABCDEFGH1234")).toContain("<redacted>");
    expect(scrubText("token eyJhbGciOiJIUzI1NiI9.payload")).toContain("<jwt>");
  });
});

describe("truncate", () => {
  it("leaves short strings, ellipsises long ones", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("abcdef", 3)).toBe("abc…");
  });
});

describe("normalizeMessage — collapses volatile tokens", () => {
  it("groups two messages that differ only by ids/numbers/urls", () => {
    const a = normalizeMessage('quote 123e4567-e89b-12d3-a456-426614174000 failed at 42 via "X"');
    const b = normalizeMessage('quote 987f6543-a21c-43d2-b654-000000000000 failed at 99 via "Y"');
    expect(a).toBe(b);
    expect(a).toContain("<id>");
    expect(a).toContain("<n>");
    expect(a).toContain("<str>");
  });
  it("replaces urls and long hex", () => {
    expect(normalizeMessage("fetch https://api.example.com/x 200")).toContain("<url>");
    expect(normalizeMessage("hash deadbeefcafe1234")).toContain("<hex>");
  });
});

describe("extractTopFrame — display keeps line:col, stable strips it", () => {
  const stack = [
    "Error: boom",
    "    at POST (/var/task/.next/server/app/api/quotes/generate/route.js:123:45)",
    "    at runHandler (/var/task/node_modules/next/x.js:1:1)",
  ].join("\n");
  it("prefers the app/.next frame and project-relativises it", () => {
    const { display, stable } = extractTopFrame(stack);
    expect(display).toMatch(/\.next\/server\/app\/api\/quotes\/generate\/route\.js:123:45/);
    expect(stable).toMatch(/\.next\/server\/app\/api\/quotes\/generate\/route\.js$/);
    expect(stable).not.toMatch(/:\d+:\d+/); // line:col stripped for grouping
  });
  it("null stack → nulls", () => {
    expect(extractTopFrame(null)).toEqual({ display: null, stable: null });
  });
});

describe("buildFingerprint — deterministic + discriminating", () => {
  const base = { surface: "api", route: "quotes/generate", name: "TypeError", normalizedMessage: "x is <n>", stableFrame: "src/a.ts" };
  it("same inputs → same hash", () => {
    expect(buildFingerprint(base)).toBe(buildFingerprint({ ...base }));
  });
  it("different route → different hash", () => {
    expect(buildFingerprint(base)).not.toBe(buildFingerprint({ ...base, route: "quotes/transcribe" }));
  });
  it("different stable frame → different hash", () => {
    expect(buildFingerprint(base)).not.toBe(buildFingerprint({ ...base, stableFrame: "src/b.ts" }));
  });
});

describe("buildErrorRow — bounded, PII-free, groups repeats", () => {
  it("two occurrences differing only by ids share a fingerprint", () => {
    const e1 = new Error('failed for quote 123e4567-e89b-12d3-a456-426614174000 (42)');
    const e2 = new Error('failed for quote 987f6543-a21c-43d2-b654-000000000000 (99)');
    const r1 = buildErrorRow(e1, { route: "quotes/generate" });
    const r2 = buildErrorRow(e2, { route: "quotes/generate" });
    expect(r1.fingerprint).toBe(r2.fingerprint);
    expect(r1.surface).toBe("api"); // default
  });

  it("scrubs the stored message + caps length", () => {
    const r = buildErrorRow(new Error("contact bob@example.com — " + "x".repeat(1000)), { route: "r" });
    expect(r.message).toContain("<email>");
    expect(r.message!.length).toBeLessThanOrEqual(501); // 500 + ellipsis
  });

  it("non-Error inputs are tolerated", () => {
    expect(() => buildErrorRow("a plain string")).not.toThrow();
    expect(buildErrorRow("a plain string").name).toBe("Error");
  });

  it("oversized extra is dropped to a marker, small extra passes through", () => {
    const big = buildErrorRow(new Error("x"), { extra: { blob: "y".repeat(5000) } });
    expect(big.extra).toMatchObject({ _truncated: true });
    const small = buildErrorRow(new Error("x"), { extra: { count: 3 } });
    expect(small.extra).toEqual({ count: 3 });
  });

  it("carries route / surface / httpStatus / requestId through", () => {
    const r = buildErrorRow(new Error("x"), {
      route: "quotes/send", surface: "server_action", httpStatus: 500, requestId: "vrcl-1",
    });
    expect(r.route).toBe("quotes/send");
    expect(r.surface).toBe("server_action");
    expect(r.http_status).toBe(500);
    expect(r.request_id).toBe("vrcl-1");
  });
});

describe("buildErrorRow — what the provider said", () => {
  it("an AI error's own explanation is in the logged message, so a 400 isn't a mystery", async () => {
    const { AiError } = await import("@/lib/ai/errors");
    const e = new AiError({
      kind: "bad_request",
      provider: "anthropic",
      status: 400,
      detail: "invalid_request_error: output_config.format.schema: Schema is too complex for compilation",
    });
    const r = buildErrorRow(e, { route: "plansets/interpret" });
    expect(r.message).toBe("Anthropic bad request (HTTP 400): invalid_request_error: output_config.format.schema: Schema is too complex for compilation");
    expect(r.title).toContain("Schema is too complex");
  });

  it("a different explanation is a different group, the same one with other numbers is the same", async () => {
    const { AiError } = await import("@/lib/ai/errors");
    const make = (detail: string) => buildErrorRow(new AiError({ kind: "bad_request", provider: "anthropic", status: 400, detail }), { route: "plansets/interpret" });
    expect(make("invalid_request_error: prompt is too long: 213456 tokens > 200000 maximum").fingerprint).toBe(
      make("invalid_request_error: prompt is too long: 201111 tokens > 200000 maximum").fingerprint,
    );
    expect(make("invalid_request_error: prompt is too long: 213456 tokens > 200000 maximum").fingerprint).not.toBe(
      make("invalid_request_error: fallbacks: Extra inputs are not permitted").fingerprint,
    );
  });

  it("never copies another kind of error's detail (a database error's can hold customer values)", () => {
    const e = Object.assign(new Error("duplicate key value violates unique constraint"), {
      detail: "Key (email)=(sam@example.invalid) already exists.",
    });
    const r = buildErrorRow(e, { route: "r" });
    expect(r.message).toBe("duplicate key value violates unique constraint");
    expect(JSON.stringify(r)).not.toContain("sam@");
  });
});

