// ─────────────────────────────────────────────────────────────────────────
// Quote verification pass — an independent check on a generated quote BEFORE
// it reaches the tradie.
//
// Two layers, in the spirit of "deterministic where possible, model only for
// judgement":
//   1. verifyQuoteDeterministic() — pure, free, ALWAYS on. Catches the
//      mechanical mistakes: broken maths, zero prices, duplicate lines,
//      implausible totals.
//   2. runQuoteCritic() — a SECOND, independent model pass (gated by
//      QUOTE_VERIFY_ENABLED) that adversarially QA-checks the quote against
//      the brief: missing scope, implausible prices, wrong units, double
//      charges. Advisory — surfaces issues, never edits the quote.
//
// verifyQuote() runs (1) always and (2) when enabled, merging the issues.
// Soft everywhere: a critic failure never blocks a quote.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import { round2 } from "@/lib/quote-defaults";
import { runStructuredAgent, type ParseResult } from "../runtime";
import type { GeneratedQuote } from "../quote-generation";

export type IssueSeverity = "error" | "warning";

export interface VerificationIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
}

export interface VerificationReport {
  /** True when there are no error-severity issues. */
  ok: boolean;
  issues: VerificationIssue[];
  /** Which layers ran. */
  checkedBy: Array<"deterministic" | "critic">;
}

/** Gate for the second (LLM critic) pass. Off unless explicitly enabled. */
export function quoteVerifyEnabledFromEnv(): boolean {
  return process.env.QUOTE_VERIFY_ENABLED === "true";
}

const near = (a: number, b: number, tol = 0.05): boolean => Math.abs(a - b) <= tol;

/**
 * Pure, deterministic checks. Free and always run. Recomputes the maths
 * independently of how the quote was built — at the quote's own tax rate,
 * with any markup charged on top of the line totals added back, and without
 * reporting lines that are deliberately price-pending as mistakes.
 */
export function verifyQuoteDeterministic(quote: GeneratedQuote): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  if (quote.lineItems.length === 0) {
    issues.push({
      code: "no_line_items",
      severity: "error",
      message: "Quote has no line items.",
    });
    return issues; // nothing else to check
  }

  const taxLabel = quote.taxLabel?.trim() || "GST";
  const taxRate = Number.isFinite(quote.gstRate) ? quote.gstRate : 0.15;
  const markup = Number.isFinite(quote.markupAmount) ? Number(quote.markupAmount) : 0;
  const sumLines = round2(quote.lineItems.reduce((s, l) => s + l.lineTotal, 0));
  const expectedSubtotal = round2(sumLines + markup);
  if (!near(quote.subtotal, expectedSubtotal)) {
    issues.push({
      code: "subtotal_mismatch",
      severity: "error",
      message:
        markup !== 0
          ? `Subtotal ${quote.subtotal} doesn't equal the line totals plus markup (${expectedSubtotal}).`
          : `Subtotal ${quote.subtotal} doesn't equal the sum of line totals (${sumLines}).`,
    });
  }
  if (!near(quote.gstAmount, round2(quote.subtotal * taxRate))) {
    issues.push({
      code: "gst_mismatch",
      severity: "error",
      message: `${taxLabel} ${quote.gstAmount} isn't ${round2(taxRate * 100)}% of the subtotal.`,
    });
  }
  if (!near(quote.total, round2(quote.subtotal + quote.gstAmount))) {
    issues.push({
      code: "total_mismatch",
      severity: "error",
      message: `Total ${quote.total} doesn't equal subtotal + ${taxLabel}.`,
    });
  }
  // A $0 total on a quote whose lines are still price-pending is the
  // expected draft state (the tradie prices them), not a mistake.
  const pricePending = quote.lineItems.some((l) => l.pricePending === true);
  if (quote.total <= 0 && !pricePending) {
    issues.push({
      code: "zero_total",
      severity: "error",
      message: "Quote total is zero or negative.",
    });
  }

  // Zero/negative prices — the prompt forbids them, but verify anyway.
  // Price-pending lines are blank by design and surface in the editor.
  const zeroLines = quote.lineItems.filter(
    (l) => l.unitPrice <= 0 && l.pricePending !== true,
  );
  for (const l of zeroLines) {
    issues.push({
      code: "zero_price",
      severity: "warning",
      message: `"${l.description}" has no unit price — confirm before sending.`,
    });
  }

  // Duplicate line descriptions.
  const seen = new Map<string, number>();
  for (const l of quote.lineItems) {
    const key = l.description.trim().toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      issues.push({
        code: "duplicate_line",
        severity: "warning",
        message: `"${key}" appears ${count} times — possible double-up.`,
      });
    }
  }

  // Implausibly large total — a likely misplaced decimal / runaway quantity.
  if (quote.total > 1_000_000) {
    issues.push({
      code: "implausible_total",
      severity: "warning",
      message: `Total of ${quote.total} looks very high — double-check the figures.`,
    });
  }

  if (!quote.jobName.trim()) {
    issues.push({
      code: "missing_job_name",
      severity: "warning",
      message: "Quote has no job name.",
    });
  }

  return issues;
}

// ── LLM critic (second, independent pass) ────────────────────────────────

interface CriticResult {
  scopeCovered: boolean;
  issues: VerificationIssue[];
}

const CRITIC_SYSTEM_PROMPT = `You are a senior NZ builder QA-checking a quote a junior produced from a customer's brief, BEFORE it goes out. Your job is to catch mistakes — be sharp and specific, not reassuring.

Look for:
- MISSING SCOPE: work the brief clearly asked for that isn't in the quote.
- IMPLAUSIBLE PRICES: NZ retail prices that are obviously too high or too low for the item.
- WRONG UNITS: e.g. timber priced "each" instead of per linear metre, GIB priced per sheet vs m².
- DOUBLE CHARGES: the same work or material billed twice.
- INVENTED WORK: lines that weren't asked for in the brief.

Rules:
- Lines shown as "price pending" have no price YET by design — the tradie prices them before sending. Never flag a price-pending line (or a low/zero total caused by pending prices) as a missing or zero price; still check its quantity, unit and scope.
- Only flag things you're reasonably confident about. Don't invent problems.
- "error" = would produce a wrong or unsendable quote. "warning" = worth a human glance.
- If the quote is sound, return scope_covered true and an empty issues array.
- Return your findings ONLY by calling the report_quote_issues tool.`;

const CRITIC_TOOL = {
  name: "report_quote_issues",
  description: "Report QA issues found when checking the quote against the brief.",
  schema: {
    type: "object",
    required: ["scope_covered", "issues"],
    properties: {
      scope_covered: {
        type: "boolean",
        description: "Does the quote cover everything the brief asked for?",
      },
      issues: {
        type: "array",
        items: {
          type: "object",
          required: ["severity", "message"],
          properties: {
            severity: { type: "string", enum: ["error", "warning"] },
            message: { type: "string" },
          },
        },
      },
    },
  },
};

export function parseCritic(input: unknown): ParseResult<CriticResult> {
  const obj = (input ?? {}) as {
    scope_covered?: unknown;
    issues?: unknown;
  };
  const issues: VerificationIssue[] = Array.isArray(obj.issues)
    ? obj.issues
        .map((raw) => {
          const r = (raw ?? {}) as { severity?: unknown; message?: unknown };
          const message = typeof r.message === "string" ? r.message.trim() : "";
          if (!message) return null;
          const severity: IssueSeverity = r.severity === "error" ? "error" : "warning";
          return { code: "critic", severity, message };
        })
        .filter((x): x is VerificationIssue => x !== null)
    : [];
  return {
    ok: true,
    value: { scopeCovered: obj.scope_covered !== false, issues },
  };
}

export function quoteToBrief(quote: GeneratedQuote): string {
  const lines = quote.lineItems.map((l) =>
    l.pricePending === true
      ? `- ${l.description} — ${l.quantity} ${l.unit} @ price pending [${l.category}]`
      : `- ${l.description} — ${l.quantity} ${l.unit} @ $${l.unitPrice} = $${l.lineTotal} [${l.category}]`,
  );
  const markup = Number(quote.markupAmount) || 0;
  return [
    `Job: ${quote.jobName}`,
    `Lines:`,
    ...lines,
    [
      markup !== 0 ? `Markup $${markup}` : null,
      `Subtotal $${quote.subtotal}`,
      `${quote.taxLabel?.trim() || "GST"} $${quote.gstAmount}`,
      `Total $${quote.total}`,
    ]
      .filter(Boolean)
      .join(" · "),
  ].join("\n");
}

export async function runQuoteCritic(args: {
  transcript: string;
  quote: GeneratedQuote;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<CriticResult> {
  const user = `CUSTOMER BRIEF (verbatim):\n"""\n${args.transcript}\n"""\n\nTHE QUOTE TO CHECK:\n${quoteToBrief(args.quote)}\n\nQA-check the quote against the brief and report issues via the tool.`;
  const result = await runStructuredAgent<CriticResult>({
    agentName: "Quote Critic",
    system: CRITIC_SYSTEM_PROMPT,
    user,
    tool: CRITIC_TOOL,
    parse: parseCritic,
    maxTokens: 1024,
    apiKey: args.apiKey,
    fetchImpl: args.fetchImpl,
  });
  return result.value;
}

/**
 * Run the full verification pass: deterministic always, critic when enabled.
 * Never throws — a critic failure degrades to the deterministic result.
 */
export async function verifyQuote(args: {
  quote: GeneratedQuote;
  transcript?: string;
  runCritic?: boolean;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<VerificationReport> {
  const issues = verifyQuoteDeterministic(args.quote);
  const checkedBy: VerificationReport["checkedBy"] = ["deterministic"];

  if (args.runCritic && args.transcript && args.transcript.trim()) {
    try {
      const critic = await runQuoteCritic({
        transcript: args.transcript,
        quote: args.quote,
        apiKey: args.apiKey,
        fetchImpl: args.fetchImpl,
      });
      issues.push(...critic.issues);
      if (!critic.scopeCovered) {
        issues.push({
          code: "scope_not_covered",
          severity: "warning",
          message: "The critic thinks the quote may not cover everything in the brief.",
        });
      }
      checkedBy.push("critic");
    } catch {
      // Critic is advisory — never block a quote on it.
    }
  }

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    checkedBy,
  };
}
