import { describe, expect, it } from "vitest";
import { extractClientTopFrame, sanitizeClientReport } from "./clientErrors";

const chromeStack = (hash: string, line: number, col: number) =>
  [
    "TypeError: Cannot read properties of undefined (reading 'x')",
    `    at handleClick (https://app.example.com/_next/static/chunks/app/quote/page-${hash}.js:${line}:${col})`,
    `    at HTMLButtonElement.callCallback (https://app.example.com/_next/static/chunks/main-app-${hash}.js:10:20)`,
  ].join("\n");

describe("extractClientTopFrame — browser stacks, deploy-stable grouping", () => {
  it("Chrome: strips origin + chunk hash + line:col for the stable frame, keeps them for display", () => {
    const { display, stable } = extractClientTopFrame(chromeStack("9f3a2b1c", 5, 200));
    expect(display).toBe(
      "handleClick /_next/static/chunks/app/quote/page-9f3a2b1c.js:5:200",
    );
    expect(stable).toBe("handleClick /_next/static/chunks/app/quote/page.js");
    expect(stable).not.toMatch(/:\d+:\d+/);
    expect(stable).not.toMatch(/9f3a2b1c/);
  });

  it("two builds (different hash + line:col) collapse to the SAME stable frame", () => {
    const a = extractClientTopFrame(chromeStack("9f3a2b1c", 5, 200)).stable;
    const b = extractClientTopFrame(chromeStack("77dd88ee", 9, 404)).stable;
    expect(a).toBe(b);
  });

  it("Firefox/Safari fn@url format is parsed the same way", () => {
    const ff =
      "handleClick@https://app.example.com/_next/static/chunks/app/quote/page-9f3a2b1c.js:5:200";
    const { stable } = extractClientTopFrame(ff);
    expect(stable).toBe("handleClick /_next/static/chunks/app/quote/page.js");
  });

  it("null / empty stack → nulls", () => {
    expect(extractClientTopFrame(null)).toEqual({ display: null, stable: null });
    expect(extractClientTopFrame("")).toEqual({ display: null, stable: null });
  });
});

describe("sanitizeClientReport — bounded, PII-free, surface=client", () => {
  it("rejects empty / garbage payloads", () => {
    expect(sanitizeClientReport(null)).toBeNull();
    expect(sanitizeClientReport("nope")).toBeNull();
    expect(sanitizeClientReport({})).toBeNull();
    expect(sanitizeClientReport({ message: "", stack: null })).toBeNull();
  });

  it("scrubs PII / tokens from the stored message and caps length", () => {
    const r = sanitizeClientReport({
      name: "Error",
      message: "contact bob@example.com token sk_live_ABCDEFGH1234 " + "x".repeat(1000),
      path: "/app",
    })!;
    expect(r.surface).toBe("client");
    expect(r.message).toContain("<email>");
    expect(r.message).toContain("<redacted>");
    expect(r.message).not.toContain("bob@example.com");
    expect(r.message!.length).toBeLessThanOrEqual(501);
  });

  it("reduces the page path to a route shape (ids → :id)", () => {
    const r = sanitizeClientReport({
      message: "boom",
      path: "/app/quotes/123e4567-e89b-12d3-a456-426614174000/edit",
    })!;
    expect(r.route).toBe("/app/quotes/:id/edit");
    const n = sanitizeClientReport({ message: "boom", path: "/app/invoices/4821" })!;
    expect(n.route).toBe("/app/invoices/:id");
  });

  it("two occurrences differing only by hash / line:col / numeric ids share a fingerprint", () => {
    const a = sanitizeClientReport({
      name: "TypeError",
      message: "Cannot read properties of undefined (reading 'x') for id 123",
      stack: chromeStack("9f3a2b1c", 5, 200),
      path: "/app/quotes/123",
    })!;
    const b = sanitizeClientReport({
      name: "TypeError",
      message: "Cannot read properties of undefined (reading 'x') for id 999",
      stack: chromeStack("77dd88ee", 9, 404),
      path: "/app/quotes/999",
    })!;
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("different route → different fingerprint", () => {
    const a = sanitizeClientReport({ message: "boom", stack: chromeStack("aa11bb22", 1, 1), path: "/app/a" })!;
    const b = sanitizeClientReport({ message: "boom", stack: chromeStack("aa11bb22", 1, 1), path: "/app/b" })!;
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("only an allowed kind is carried into extra", () => {
    expect(sanitizeClientReport({ message: "x", kind: "boundary" })!.extra).toEqual({
      kind: "boundary",
    });
    expect(sanitizeClientReport({ message: "x", kind: "nonsense" })!.extra).toBeNull();
  });

  it("a stack-only report (no message) is still recorded", () => {
    const r = sanitizeClientReport({ stack: chromeStack("aa11bb22", 3, 3) });
    expect(r).not.toBeNull();
    expect(r!.stack).toContain("page");
  });

  it("drops a stack that is entirely browser-extension frames", () => {
    const stack = [
      "TypeError: Cannot read properties of undefined (reading 'M_ID')",
      "    at Object.t (chrome-extension://abcdefghijklmnopqrstuvwxyz012345/content.js:1:1)",
    ].join("\n");
    expect(sanitizeClientReport({ message: "boom", stack })).toBeNull();
  });

  it("drops a stack whose TOP frame is an extension, even if a deeper frame is our own https:// code (an extension wrapping a page function)", () => {
    const stack = [
      "TypeError: boom",
      "    at Object.wrapped (moz-extension://abcdefgh-1234-5678-90ab-cdefghijklmn/content.js:1:1)",
      "    at handleClick (https://app.example.com/_next/static/chunks/app/quote/page-9f3a2b1c.js:5:200)",
    ].join("\n");
    expect(sanitizeClientReport({ message: "boom", stack })).toBeNull();
  });

  it("drops a Safari content-blocker's masked-url top frame", () => {
    const stack = "Error: boom\n    at f (webkit-masked-url://hidden/script.js:1:1)";
    expect(sanitizeClientReport({ message: "boom", stack })).toBeNull();
  });

  it("keeps a real error whose stack is our own https:// code throughout", () => {
    const r = sanitizeClientReport({ message: "boom", stack: chromeStack("aa11bb22", 3, 3) });
    expect(r).not.toBeNull();
  });

  it("carries only the known boolean page-rewrite flags into extra, dropping anything else", () => {
    const r = sanitizeClientReport({
      message: "boom",
      flags: { translated: true, appleDataDetectors: false, grammarly: true, notAFlag: "x" },
    })!;
    expect(r.extra).toEqual({ translated: true, appleDataDetectors: false, grammarly: true });
  });

  it("merges flags alongside kind in extra", () => {
    const r = sanitizeClientReport({
      message: "boom",
      kind: "boundary",
      flags: { translated: true, appleDataDetectors: false, grammarly: false },
    })!;
    expect(r.extra).toEqual({ kind: "boundary", translated: true, appleDataDetectors: false, grammarly: false });
  });

  it("extra is null when there is neither a kind nor any flag", () => {
    expect(sanitizeClientReport({ message: "boom" })!.extra).toBeNull();
    expect(sanitizeClientReport({ message: "boom", flags: {} })!.extra).toBeNull();
    expect(sanitizeClientReport({ message: "boom", flags: "nonsense" })!.extra).toBeNull();
  });
});
