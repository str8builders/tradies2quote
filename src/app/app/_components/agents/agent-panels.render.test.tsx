// The review agents shown on the quote page (Forgotten costs, Compliance,
// Follow-up, Voice cleanup) and their Copy button, rendered to static HTML in
// node. The classic look is pinned by file snapshots taken from the untouched
// components, before the new look existed, so look="classic" (the default)
// provably renders exactly as before. Regenerate only after an intended change
// to the classic look: npx vitest run <this file> --update
//
// look="new" (the new-look job page's "More tools" sheet) draws the same
// reports with the kit: same test ids and data attributes, in the same order,
// and the new look's design rules in the markup and in its own source files.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./_log-run", () => ({ logClientAgentRun: vi.fn() }));

import { runComplianceAgent, type ComplianceReport } from "@/lib/agents/compliance";
import { detectForgottenCosts } from "@/lib/agents/forgotten-costs";
import { runVoiceCleanup } from "@/lib/agents/voice-cleanup";
import { formatCurrency } from "@/lib/quote-defaults";
import type { QuoteData } from "@/lib/quote-types";
import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import { ComplianceAgent } from "./ComplianceAgent";
import { ComplianceAgentV2 } from "./ComplianceAgentV2";
import { CopyButton } from "./CopyButton";
import { FollowupAgent } from "./FollowupAgent";
import { FollowupAgentV2 } from "./FollowupAgentV2";
import { ForgottenCostsAgent } from "./ForgottenCostsAgent";
import { VoiceCleanupAgent } from "./VoiceCleanupAgent";

const QUOTE: QuoteData = {
  client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: "021 555 0101" },
  job_summary: "Replace the old deck at 14 Rata St. Guaranteed watertight.",
  line_items: [
    { type: "material", description: "Kwila decking 140x19", quantity: 42, unit: "length", unit_price: 36, line_total: 1512 },
    { type: "labour", description: "Labour", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 },
  ],
  materials_subtotal: 1512,
  labour_subtotal: 1680,
  markup_pct: 0,
  markup_amount: 0,
  subtotal_before_tax: 3192,
  tax_amount: 478.8,
  total: 3670.8,
  currency: "NZD",
  tax_label: "GST",
  tax_rate: 15,
  terms: "Payment on completion.",
  notes: [],
};
/** Nothing flagged: exclusions noted, variations and payment in the terms, no promises. */
const TIDY: QuoteData = {
  ...QUOTE,
  job_summary: "New deck at 14 Rata St.",
  terms: "Variations agreed in writing. 50% deposit on acceptance.",
  notes: ["Excludes consents and council fees."],
};

/** Nothing to scan. */
const NO_LINES: QuoteData = { ...QUOTE, line_items: [] };

/** ISO time `n` days (plus an hour, so the day count floors cleanly) ago. */
const daysAgo = (n: number) => new Date(Date.now() - (n * 86_400_000 + 3_600_000)).toISOString();
const FOLLOWUP = {
  quoteNumber: "Q-0042",
  clientName: "Sam Taylor",
  total: 3670.8,
  currency: "NZD",
  businessName: "STR8 Builders",
};
const SENT = { ...FOLLOWUP, status: "sent" as const, sentAtIso: daysAgo(4) };
const DRAFT = { ...FOLLOWUP, status: "draft" as const, sentAtIso: null };

const RAMBLE = "um so we need to put up jib on the internal walls uh and h32 framing 90 by 45 and pink bats in the timber frame";

const html = (el: ReactElement) => renderToStaticMarkup(el);
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};
/** Test ids and the panels' own data attributes, in order (not the kit's data-tone and friends). */
const hooks = (markup: string) =>
  [...markup.matchAll(/\bdata-(?!tone\b|variant\b|amount\b)([\w-]+)="([^"]*)"/g)].map(([, name, value]) => `${name}=${value}`);
/** The words as read, without the markup. */
const words = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("classic look (the default) renders exactly as before", () => {
  it.each([
    ["found", QUOTE],
    ["clean", NO_LINES],
  ] as const)("ForgottenCostsAgent: %s", async (name, quoteData) => {
    const out = html(<ForgottenCostsAgent quoteData={quoteData} />);
    await expect(out).toMatchFileSnapshot(`./__snapshots__/ForgottenCostsAgent.classic.${name}.html`);
  });

  it.each([
    ["flags", QUOTE],
    ["clean", TIDY],
  ] as const)("ComplianceAgent: %s", async (name, quoteData) => {
    const out = html(<ComplianceAgent quoteData={quoteData} />);
    await expect(out).toMatchFileSnapshot(`./__snapshots__/ComplianceAgent.classic.${name}.html`);
  });

  it.each([
    ["sent", SENT, false],
    ["draft", DRAFT, false],
    ["draft-applicable-only", DRAFT, true],
  ] as const)("FollowupAgent: %s", async (name, context, hideInapplicable) => {
    const out = html(<FollowupAgent {...context} hideInapplicable={hideInapplicable} />);
    await expect(out).toMatchFileSnapshot(`./__snapshots__/FollowupAgent.classic.${name}.html`);
  });

  it.each([
    ["changed", RAMBLE],
    ["clean", "New deck at the back."],
  ] as const)("VoiceCleanupAgent: %s", async (name, transcript) => {
    const out = html(<VoiceCleanupAgent transcript={transcript} />);
    await expect(out).toMatchFileSnapshot(`./__snapshots__/VoiceCleanupAgent.classic.${name}.html`);
  });

  it("VoiceCleanupAgent: nothing without a transcript", () => {
    expect(html(<VoiceCleanupAgent transcript={null} />)).toBe("");
    expect(html(<VoiceCleanupAgent transcript="   " />)).toBe("");
  });

  it("CopyButton", async () => {
    const out = [
      html(<CopyButton text="Hi Sam" />),
      html(<CopyButton text="Hi Sam" label="Copy it" testId="copy-it" disabled />),
    ].join("\n");
    await expect(out).toMatchFileSnapshot("./__snapshots__/CopyButton.classic.html");
  });

  it('look="classic" is the default', () => {
    expect(html(<ForgottenCostsAgent quoteData={QUOTE} look="classic" />)).toBe(html(<ForgottenCostsAgent quoteData={QUOTE} />));
    expect(html(<ComplianceAgent quoteData={QUOTE} look="classic" />)).toBe(html(<ComplianceAgent quoteData={QUOTE} />));
    expect(html(<FollowupAgent {...SENT} look="classic" />)).toBe(html(<FollowupAgent {...SENT} />));
    expect(html(<VoiceCleanupAgent transcript={RAMBLE} look="classic" />)).toBe(html(<VoiceCleanupAgent transcript={RAMBLE} />));
    expect(html(<CopyButton text="Hi" look="classic" />)).toBe(html(<CopyButton text="Hi" />));
  });
});

describe("new look: CopyButton", () => {
  it("a small secondary kit button with the same test id, label and disabled state", () => {
    const out = html(<CopyButton text="Hi Sam" label="Copy it" testId="copy-it" look="new" />);
    const button = tag(out, 'data-testid="copy-it"');
    expect(button).toContain('type="button"');
    expect(button).toContain('data-variant="secondary"');
    // 40 px to see, 48 px to tap (the kit's small size).
    expect(button).toContain("min-h-10");
    expect(button).toContain("after:-inset-1");
    expect(button).not.toContain("disabled");
    expect(words(out)).toContain("Copy it");
    expect(markupRuleBreaks(out)).toEqual([]);

    const off = html(<CopyButton text="Hi Sam" testId="copy-it" disabled look="new" />);
    expect(tag(off, 'data-testid="copy-it"')).toContain('disabled=""');
    expect(words(off)).toContain("Copy");
    expect(markupRuleBreaks(off)).toEqual([]);
  });
});

describe("new look: ForgottenCostsAgent", () => {
  const report = detectForgottenCosts(QUOTE);

  it("keeps the classic panel's test ids, in order", () => {
    for (const quoteData of [QUOTE, NO_LINES]) {
      expect(hooks(html(<ForgottenCostsAgent quoteData={quoteData} look="new" />))).toEqual(
        hooks(html(<ForgottenCostsAgent quoteData={quoteData} />)),
      );
    }
  });

  it("found: what could be missing up front, then each cost with its estimate and why", () => {
    const out = html(<ForgottenCostsAgent quoteData={QUOTE} look="new" />);
    expect(report.costs.length).toBeGreaterThan(1);
    expect(tag(out, 'data-tone="warn"')).toContain("border-ui-warn");
    expect(words(out)).toContain(`About ${formatCurrency(report.totalEstimated, "NZD")} could be missing`);
    expect(words(out)).toContain(`${report.costs.length} costs a job like this usually has aren't on the quote yet.`);
    for (const cost of report.costs) {
      expect(out).toContain(`data-testid="agent-forgotten-cost-${cost.id}"`);
      expect(words(out)).toContain(`About ${formatCurrency(cost.estimated, "NZD")}`);
      expect(words(out)).toContain(cost.why);
    }
    expect(words(out)).toContain("These are starting estimates.");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("clean: says so, no total", () => {
    const out = html(<ForgottenCostsAgent quoteData={NO_LINES} look="new" />);
    expect(out).toContain('data-testid="agent-forgotten-costs-clean"');
    expect(out).not.toContain("agent-forgotten-costs-total");
    expect(words(out)).toContain("covered the costs jobs like this usually miss");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("new look: ComplianceAgent", () => {
  it("keeps the classic panel's test ids and severities, in order", () => {
    for (const quoteData of [QUOTE, TIDY]) {
      expect(hooks(html(<ComplianceAgent quoteData={quoteData} look="new" />))).toEqual(
        hooks(html(<ComplianceAgent quoteData={quoteData} />)),
      );
    }
  });

  it("flags as callouts (warn stays warn, info stays info), each with its fix", () => {
    const report = runComplianceAgent(QUOTE);
    const out = html(<ComplianceAgent quoteData={QUOTE} look="new" />);
    for (const flag of report.flags) {
      const item = out.slice(out.indexOf(`data-testid="agent-compliance-flag-${flag.id}"`));
      expect(tag(item, "data-tone=")).toContain(`data-tone="${flag.severity === "warn" ? "warn" : "info"}"`);
      expect(words(item)).toContain(flag.fixHint);
    }
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a high flag reads as bad", () => {
    const report: ComplianceReport = {
      flags: [{ id: "promise", severity: "high", message: "Promises a result", fixHint: "Say what the work covers." }],
      suggestions: [],
      hasRiskyWording: true,
    };
    const out = html(<ComplianceAgentV2 report={report} />);
    expect(tag(out, "data-tone=")).toContain('data-tone="bad"');
    expect(out).not.toContain("Clauses you can copy");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("every clause keeps its Copy button (named for screen readers) and its words", () => {
    const report = runComplianceAgent(TIDY);
    const out = html(<ComplianceAgent quoteData={TIDY} look="new" />);
    expect(out).toContain('data-testid="agent-compliance-clean"');
    expect(words(out)).toContain("Clauses you can copy");
    for (const clause of report.suggestions) {
      const button = tag(out, `data-testid="copy-${clause.id}"`);
      expect(button).toContain('data-variant="secondary"');
      expect(out).toContain(`Copy<span class="sr-only"> ${clause.title}</span>`);
    }
    expect(words(out)).toContain("Exclusion");
    expect(words(out)).toContain("Not legal advice.");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("new look: FollowupAgent", () => {
  it("keeps the classic panel's test ids, order and flags", () => {
    for (const [context, hide] of [
      [SENT, false],
      [DRAFT, false],
      [DRAFT, true],
    ] as const) {
      expect(hooks(html(<FollowupAgent {...context} hideInapplicable={hide} look="new" />))).toEqual(
        hooks(html(<FollowupAgent {...context} hideInapplicable={hide} />)),
      );
    }
  });

  it("sent 4 days ago: the one to send now comes first, marked, with why now", () => {
    const out = html(<FollowupAgent {...SENT} look="new" />);
    expect(tag(out, 'data-testid="agent-followup-')).toContain('data-recommended="true"');
    expect(tag(out, 'data-recommended="true"')).toContain("border-ui-brand");
    expect(words(out)).toContain("Send this one now");
    expect(words(out)).toContain("4 days and no decision");
    expect(tag(out, 'data-testid="copy-followup-price-clarification"')).not.toContain("disabled");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a draft: templates that don't apply yet say why, and can't be copied", () => {
    const out = html(<FollowupAgent {...DRAFT} look="new" />);
    expect(tag(out, 'data-testid="copy-followup-friendly-reminder"')).toContain('disabled=""');
    expect(tag(out, 'data-testid="copy-followup-missing-info"')).not.toContain("disabled");
    expect(words(out)).toContain("Quote is still a draft");
    expect(out).not.toContain("agent-followup-recommended");
    expect(words(out)).toContain("Nothing is sent from here.");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("nothing to send: an empty note", () => {
    const out = html(<FollowupAgentV2 messages={[]} />);
    expect(out).toContain('data-testid="agent-followup-empty"');
    expect(words(out)).toContain("No follow-up messages fit yet.");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("new look: VoiceCleanupAgent", () => {
  const result = runVoiceCleanup(RAMBLE);

  it("keeps the classic panel's test ids, in order", () => {
    for (const transcript of [RAMBLE, "New deck at the back."]) {
      expect(hooks(html(<VoiceCleanupAgent transcript={transcript} look="new" />))).toEqual(
        hooks(html(<VoiceCleanupAgent transcript={transcript} />)),
      );
    }
    expect(html(<VoiceCleanupAgent transcript="  " look="new" />)).toBe("");
  });

  it("what was said beside the tidy version, the trade fixes and what to double-check", () => {
    const out = html(<VoiceCleanupAgent transcript={RAMBLE} look="new" />);
    expect(result.corrections.length).toBeGreaterThan(0);
    expect(result.clarifications.length).toBeGreaterThan(0);
    expect(out).toContain(RAMBLE);
    expect(out).toContain(result.cleaned);
    expect(words(out)).toContain(`${result.originalLength} characters`);
    for (const c of result.corrections) expect(out).toContain(`<span class="font-semibold">${c.after}</span>`);
    expect(words(out)).toContain("Worth double-checking");
    expect(words(out)).toContain(`${result.corrections.length} trade fixes, and the formatting tidied.`);
    expect(tag(out, 'data-testid="agent-voice-cleanup-apply"')).not.toContain("disabled");
    expect(words(out)).toContain("Copy the tidied version");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("already clean: nothing to copy", () => {
    const out = html(<VoiceCleanupAgent transcript="New deck at the back." look="new" />);
    expect(words(out)).toContain("Already clean. Nothing to change.");
    expect(tag(out, 'data-testid="agent-voice-cleanup-apply"')).toContain('disabled=""');
    expect(out).not.toContain("agent-voice-cleanup-corrections");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("new-look source files follow the design rules", () => {
  it.each(["ForgottenCostsAgentV2.tsx", "ComplianceAgentV2.tsx", "FollowupAgentV2.tsx", "VoiceCleanupAgentV2.tsx"])(
    "%s",
    (file) => {
      expect(sourceRuleBreaks(readFileSync(join(__dirname, file), "utf8"))).toEqual([]);
    },
  );
});
