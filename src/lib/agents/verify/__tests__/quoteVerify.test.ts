import { describe, expect, it } from "vitest";
import {
  parseCritic,
  quoteToBrief,
  verifyQuote,
  verifyQuoteDeterministic,
} from "../quoteVerify";
import { parseVerificationReport } from "../report";
import type { GeneratedQuote } from "../../quote-generation";

function quote(over: Partial<GeneratedQuote> = {}): GeneratedQuote {
  const base: GeneratedQuote = {
    jobName: "Deck build",
    clientName: "Dave",
    lineItems: [
      { description: "Decking", quantity: 24, unit: "m2", unitPrice: 80, lineTotal: 1920, category: "materials" },
      { description: "Labour", quantity: 8, unit: "hr", unitPrice: 85, lineTotal: 680, category: "labour" },
    ],
    subtotal: 2600,
    gstRate: 0.15,
    gstAmount: 390,
    total: 2990,
    notes: [],
    terms: "Net 7.",
  };
  return { ...base, ...over };
}

/** A Claude tool_use response for the critic. */
function criticResponse(input: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      content: [{ type: "tool_use", name: "report_quote_issues", input }],
      usage: {},
    }),
  } as unknown as Response;
}

describe("verifyQuoteDeterministic", () => {
  it("passes a clean quote with no issues", () => {
    expect(verifyQuoteDeterministic(quote())).toEqual([]);
  });

  it("flags no line items as an error", () => {
    const issues = verifyQuoteDeterministic(quote({ lineItems: [] }));
    expect(issues.some((i) => i.code === "no_line_items" && i.severity === "error")).toBe(true);
  });

  it("catches a subtotal that doesn't match the line totals", () => {
    const issues = verifyQuoteDeterministic(quote({ subtotal: 9999 }));
    expect(issues.some((i) => i.code === "subtotal_mismatch" && i.severity === "error")).toBe(true);
  });

  it("catches a wrong GST", () => {
    const issues = verifyQuoteDeterministic(quote({ gstAmount: 10 }));
    expect(issues.some((i) => i.code === "gst_mismatch")).toBe(true);
  });

  it("warns on a zero-priced line", () => {
    const issues = verifyQuoteDeterministic(
      quote({
        lineItems: [
          { description: "Mystery", quantity: 1, unit: "each", unitPrice: 0, lineTotal: 0, category: "materials" },
        ],
        subtotal: 0,
        gstAmount: 0,
        total: 0,
      }),
    );
    expect(issues.some((i) => i.code === "zero_price")).toBe(true);
    expect(issues.some((i) => i.code === "zero_total" && i.severity === "error")).toBe(true);
  });

  it("warns on duplicate lines", () => {
    const dup = { description: "Decking", quantity: 1, unit: "m2", unitPrice: 80, lineTotal: 80, category: "materials" as const };
    const issues = verifyQuoteDeterministic(
      quote({ lineItems: [dup, dup], subtotal: 160, gstAmount: 24, total: 184 }),
    );
    expect(issues.some((i) => i.code === "duplicate_line")).toBe(true);
  });

  it("warns on an implausibly large total", () => {
    const big = { description: "X", quantity: 1, unit: "each", unitPrice: 2_000_000, lineTotal: 2_000_000, category: "materials" as const };
    const issues = verifyQuoteDeterministic(
      quote({ lineItems: [big], subtotal: 2_000_000, gstAmount: 300_000, total: 2_300_000 }),
    );
    expect(issues.some((i) => i.code === "implausible_total")).toBe(true);
  });

  it("catches a total that doesn't equal subtotal + GST", () => {
    // subtotal + gst reconcile internally, but the printed total is wrong.
    const issues = verifyQuoteDeterministic(quote({ total: 9999 }));
    expect(issues.some((i) => i.code === "total_mismatch" && i.severity === "error")).toBe(true);
  });

  it("warns on a missing job name", () => {
    const issues = verifyQuoteDeterministic(quote({ jobName: "   " }));
    expect(issues.some((i) => i.code === "missing_job_name" && i.severity === "warning")).toBe(true);
  });
});

describe("parseCritic", () => {
  it("maps issues and defaults severity to warning", () => {
    const res = parseCritic({
      scope_covered: false,
      issues: [
        { severity: "error", message: "Missing the handrail" },
        { message: "Decking price looks low" },
        { severity: "warning", message: "  " }, // blank → dropped
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.scopeCovered).toBe(false);
    expect(res.value.issues).toHaveLength(2);
    expect(res.value.issues[0]).toMatchObject({ code: "critic", severity: "error" });
    expect(res.value.issues[1].severity).toBe("warning");
  });

  it("treats scope_covered as true unless explicitly false", () => {
    expect((parseCritic({ issues: [] }) as { value: { scopeCovered: boolean } }).value.scopeCovered).toBe(true);
  });
});

describe("verifyQuote (orchestrator)", () => {
  it("runs deterministic only when the critic is off", async () => {
    const report = await verifyQuote({ quote: quote(), runCritic: false });
    expect(report.ok).toBe(true);
    expect(report.checkedBy).toEqual(["deterministic"]);
  });

  it("merges critic issues when enabled", async () => {
    const fetchImpl = (async () =>
      criticResponse({
        scope_covered: false,
        issues: [{ severity: "warning", message: "No handrail quoted" }],
      })) as unknown as typeof fetch;
    const report = await verifyQuote({
      quote: quote(),
      transcript: "Build a deck with a handrail",
      runCritic: true,
      apiKey: "key",
      fetchImpl,
    });
    expect(report.checkedBy).toContain("critic");
    expect(report.issues.some((i) => i.message.includes("handrail"))).toBe(true);
    expect(report.issues.some((i) => i.code === "scope_not_covered")).toBe(true);
    expect(report.ok).toBe(true); // warnings only
  });

  it("degrades gracefully when the critic call fails", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const report = await verifyQuote({
      quote: quote(),
      transcript: "Build a deck",
      runCritic: true,
      apiKey: "key",
      fetchImpl,
    });
    // Falls back to deterministic-only, still ok.
    expect(report.checkedBy).toEqual(["deterministic"]);
    expect(report.ok).toBe(true);
  });

  it("reports not-ok when there's an error-severity issue", async () => {
    const report = await verifyQuote({ quote: quote({ lineItems: [] }), runCritic: false });
    expect(report.ok).toBe(false);
  });
});

// ─── Audit 2026-09-24, item 7 — checks judge the quote on its own terms ──
describe("verifyQuoteDeterministic — real rate, markup, price-pending", () => {
  // UK: VAT 20%, markup 20% on £500 of materials = £100 on top of the lines.
  const uk = (over: Partial<GeneratedQuote> = {}) =>
    quote({
      lineItems: [
        { description: "Timber", quantity: 10, unit: "m", unitPrice: 50, lineTotal: 500, category: "materials" },
        { description: "Labour", quantity: 8, unit: "hour", unitPrice: 60, lineTotal: 480, category: "labour" },
      ],
      markupAmount: 100,
      subtotal: 1080, // 500 + 100 markup + 480
      gstRate: 0.2,
      taxLabel: "VAT",
      gstAmount: 216,
      total: 1296,
      ...over,
    });

  it("uses the quote's own tax rate (20% VAT is not a 'GST isn't 15%' error)", () => {
    expect(verifyQuoteDeterministic(uk())).toEqual([]);
  });

  it("still catches a wrong tax amount, naming the right tax", () => {
    const issues = verifyQuoteDeterministic(uk({ gstAmount: 162, total: 1242 }));
    const gst = issues.find((i) => i.code === "gst_mismatch");
    expect(gst?.message).toMatch(/^VAT 162 isn't 20% of the subtotal/);
  });

  it("adds markup charged on top of the line totals before comparing the subtotal", () => {
    expect(verifyQuoteDeterministic(uk()).some((i) => i.code === "subtotal_mismatch")).toBe(false);
    // Without the markup the same subtotal WOULD be a mismatch.
    const noMarkup = verifyQuoteDeterministic(uk({ markupAmount: undefined }));
    expect(noMarkup.some((i) => i.code === "subtotal_mismatch")).toBe(true);
  });

  it("price-pending lines raise no zero_price / zero_total findings", () => {
    const issues = verifyQuoteDeterministic(
      quote({
        lineItems: [
          { description: "GIB sheets", quantity: 12, unit: "sheet", unitPrice: 0, lineTotal: 0, category: "materials", pricePending: true },
          { description: "Skip bin", quantity: 1, unit: "each", unitPrice: 0, lineTotal: 0, category: "sundries", pricePending: true },
        ],
        subtotal: 0,
        gstAmount: 0,
        total: 0,
      }),
    );
    expect(issues.filter((i) => i.code === "zero_price" || i.code === "zero_total")).toEqual([]);
  });

  it("a $0 line that is NOT price-pending is still flagged", () => {
    const issues = verifyQuoteDeterministic(
      quote({
        lineItems: [
          { description: "Priced", quantity: 1, unit: "each", unitPrice: 100, lineTotal: 100, category: "materials" },
          { description: "Forgot", quantity: 1, unit: "each", unitPrice: 0, lineTotal: 0, category: "materials" },
          { description: "Pending", quantity: 1, unit: "each", unitPrice: 0, lineTotal: 0, category: "materials", pricePending: true },
        ],
        subtotal: 100,
        gstAmount: 15,
        total: 115,
      }),
    );
    const zero = issues.filter((i) => i.code === "zero_price").map((i) => i.message);
    expect(zero).toHaveLength(1);
    expect(zero[0]).toMatch(/Forgot/);
  });
});

describe("critic brief — price-pending lines are named as such", () => {
  const pendingQuote = quote({
    lineItems: [
      { description: "GIB sheets", quantity: 12, unit: "sheet", unitPrice: 0, lineTotal: 0, category: "materials", pricePending: true },
      { description: "Labour", quantity: 8, unit: "hour", unitPrice: 85, lineTotal: 680, category: "labour" },
    ],
    markupAmount: 0,
    subtotal: 680,
    gstAmount: 102,
    total: 782,
  });

  it("quoteToBrief prints '@ price pending' instead of '@ $0 = $0'", () => {
    const brief = quoteToBrief(pendingQuote);
    expect(brief).toContain("GIB sheets — 12 sheet @ price pending [materials]");
    expect(brief).not.toContain("@ $0");
    expect(brief).toContain("Labour — 8 hour @ $85 = $680 [labour]");
  });

  it("the critic request carries the price-pending brief and the rule (same token cap)", async () => {
    let body: { max_tokens?: number; system?: Array<{ text: string }>; messages?: Array<{ content: Array<{ text: string }> }> } = {};
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}"));
      return criticResponse({ scope_covered: true, issues: [] });
    }) as unknown as typeof fetch;
    const report = await verifyQuote({
      quote: pendingQuote,
      transcript: "Line the garage",
      runCritic: true,
      apiKey: "key",
      fetchImpl,
    });
    expect(report.checkedBy).toEqual(["deterministic", "critic"]);
    expect(body.max_tokens).toBe(1024);
    expect(body.messages?.[0].content[0].text).toContain("@ price pending");
    expect(body.system?.[0].text).toMatch(/price pending/);
  });
});

describe("parseVerificationReport (stored quote_data.verification)", () => {
  it("round-trips a real report", async () => {
    const report = await verifyQuote({ quote: quote(), runCritic: false });
    expect(parseVerificationReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
  });

  it("rejects malformed / legacy payloads", () => {
    expect(parseVerificationReport(null)).toBeNull();
    expect(parseVerificationReport({ ok: "yes", issues: [], checkedBy: ["deterministic"] })).toBeNull();
    expect(parseVerificationReport({ ok: true, issues: [], checkedBy: [] })).toBeNull();
    expect(
      parseVerificationReport({ ok: true, issues: [{ message: "x", severity: "bogus" }, { nope: 1 }], checkedBy: ["deterministic", "hacker"] }),
    ).toEqual({ ok: true, issues: [{ code: "check", severity: "warning", message: "x" }], checkedBy: ["deterministic"] });
  });
});
