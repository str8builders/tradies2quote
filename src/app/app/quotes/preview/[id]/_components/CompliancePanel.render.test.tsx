// The building-code review panel (and its clarification form), rendered to
// static HTML in node, one review status at a time. The classic look is pinned
// by file snapshots taken from the untouched components, before the new look
// existed, so look="classic" (the default) provably renders exactly as before.
// Regenerate only after an intended change to the classic look:
// npx vitest run <this file> --update
//
// look="new" (the new-look job page's "More tools" sheet) draws the same
// statuses with the kit: same test ids, the new look's rules. The answers and
// their save stay in CompliancePanel, for both looks.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import type {
  ClarificationQuestion,
  ComplianceLineItem,
  ComplianceReview,
  ComplianceWarning,
} from "@/lib/compliance";
import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import { ClarificationForm } from "./ClarificationForm";
import { ClarificationFormV2 } from "./ClarificationFormV2";
import { CompliancePanel } from "./CompliancePanel";

const LINES = [
  {
    type: "material",
    description: "R2.6 wall insulation",
    quantity: 12,
    unit: "pack",
    unit_price: 89,
    line_total: 1068,
    reason: "External wall in the thermal envelope",
    confidence: "high",
    compliance_source_type: "rule",
    required_confirmations: ["Confirm the wall is external"],
  },
  {
    type: "material",
    description: "90x45 framing",
    quantity: 30,
    unit: "length",
    unit_price: 14,
    line_total: 420,
    reason: "Priced from the supplier catalogue",
    confidence: "medium",
    compliance_source_type: "catalogue",
  },
  {
    type: "material",
    description: "Joist hangers",
    quantity: 28,
    unit: "each",
    unit_price: 4,
    line_total: 112,
    reason: "",
    confidence: "high",
    compliance_source_type: "user_library",
  },
  { type: "material", description: "Nails 90 mm", quantity: 2, unit: "box", unit_price: 45, line_total: 90, reason: "Estimated", confidence: "low", compliance_source_type: "ai_estimate" },
  {
    type: "material",
    description: "Wall lining",
    quantity: 10,
    unit: "sheet",
    unit_price: 32,
    line_total: 320,
    reason: "The lining wasn't said",
    confidence: "low",
    compliance_source_type: "missing_context",
    required_confirmations: ["Which lining?", "Is it a wet area?"],
  },
  { type: "labour", description: "Labour", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 },
] as ComplianceLineItem[];

const WARNINGS: ComplianceWarning[] = [
  { severity: "warning", title: "Insulation R-value below H1", message: "External walls need R2.6 or better.", line_item_index: 0, citations: [] },
  { severity: "blocker", title: "Treatment class unspecified", message: "Say H1.2 or H3.2 for the framing.", line_item_index: 1, citations: [] },
  { severity: "info", title: "Bright nails near the coast", message: "Use galvanised or stainless fixings.", citations: [] },
  { severity: "warning", title: "Check the lintel size", message: "The opening is over 1.8 m.", line_item_index: 99, citations: [] },
  { severity: "warning", title: "Missing wall type", message: "Answer the questions above.", citations: [] },
];

const QUESTIONS: ClarificationQuestion[] = [
  {
    id: "wall.type",
    question: "Is this wall internal or external?",
    why: "External walls need insulation and treated framing.",
    options: [
      { value: "internal", label: "Internal" },
      { value: "external", label: "External" },
    ],
  },
  {
    id: "wall.studSpacingMm",
    question: "What is the stud spacing (mm)?",
    why: "The framing tables key off stud centres.",
    options: [
      { value: "400", label: "400 mm" },
      { value: "600", label: "600 mm" },
    ],
  },
  { id: "wall.note", question: "Anything else about the wall?", why: "Free text, when there are no set answers." },
];

const CITATIONS = [
  { source_id: "nzbc-h1", reason: "Insulation" },
  { source_id: "nzs-3602", reason: "Treatment" },
  { source_id: "not-a-source", reason: "Unknown" },
];

const review = (over: Partial<ComplianceReview>): ComplianceReview => ({
  status: "ok",
  items: LINES,
  clarifications: [],
  warnings: [],
  citations: [],
  diagnostics: { enabled: true, rulesRun: [] },
  ...over,
});

const REVIEWS = {
  error: review({ status: "error" }),
  ok: review({ status: "ok", citations: CITATIONS }),
  "ok-no-sources": review({ status: "ok" }),
  warnings: review({ status: "warnings_only", warnings: WARNINGS, citations: CITATIONS }),
  "one-warning": review({ status: "warnings_only", warnings: [WARNINGS[0]], items: LINES.slice(5) }),
  clarify: review({ status: "needs_clarification", clarifications: QUESTIONS, warnings: [WARNINGS[1]] }),
  "clarify-one": review({ status: "needs_clarification", clarifications: QUESTIONS.slice(0, 1), items: [] }),
};

const panel = (r: ComplianceReview, look?: "classic" | "new") =>
  renderToStaticMarkup(<CompliancePanel quoteId="q-1" review={r} items={r.items} look={look} />);

const ANSWERED = { "wall.type": "external", "wall.studSpacingMm": "600", "wall.note": "Brick veneer" };
const noop = () => {};
const form = (props: Partial<ComponentProps<typeof ClarificationForm>> = {}) =>
  renderToStaticMarkup(
    <ClarificationForm
      questions={QUESTIONS}
      answers={ANSWERED}
      onChange={noop}
      onSubmit={noop}
      submitting={false}
      submitError={null}
      {...props}
    />,
  );

describe("classic look (the default) renders exactly as before", () => {
  it.each(Object.keys(REVIEWS) as Array<keyof typeof REVIEWS>)("CompliancePanel: %s", async (name) => {
    await expect(panel(REVIEWS[name])).toMatchFileSnapshot(`./__snapshots__/CompliancePanel.classic.${name}.html`);
  });

  it("CompliancePanel: nothing while the review is switched off", () => {
    expect(panel(review({ status: "disabled" }))).toBe("");
  });

  it.each([
    ["answered", {}],
    ["saving", { submitting: true, submitError: "Failed to save clarifications" }],
    ["unanswered", { answers: { "wall.type": "internal" } }],
  ] as const)("ClarificationForm: %s", async (name, props) => {
    await expect(form(props)).toMatchFileSnapshot(`./__snapshots__/ClarificationForm.classic.${name}.html`);
  });
});

const NAMES = Object.keys(REVIEWS) as Array<keyof typeof REVIEWS>;
const testIds = (markup: string) => [...markup.matchAll(/\bdata-testid="[^"]*"/g)].map((m) => m[0]);
const words = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};
const formV2 = (props: Partial<ComponentProps<typeof ClarificationFormV2>> = {}) =>
  renderToStaticMarkup(
    <ClarificationFormV2
      questions={QUESTIONS}
      answers={ANSWERED}
      onChange={noop}
      onSubmit={noop}
      submitting={false}
      submitError={null}
      {...props}
    />,
  );

describe("new look: CompliancePanel", () => {
  it('look="classic" is the default', () => {
    for (const name of NAMES) expect(panel(REVIEWS[name], "classic")).toBe(panel(REVIEWS[name]));
  });

  it.each(NAMES)("%s: the classic test ids, in order, and the design rules", (name) => {
    const out = panel(REVIEWS[name], "new");
    expect(testIds(out)).toEqual(testIds(panel(REVIEWS[name])));
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("switched off: still nothing", () => {
    expect(panel(review({ status: "disabled" }), "new")).toBe("");
  });

  it("didn't run: an info callout that never blocks sending", () => {
    const out = panel(REVIEWS.error, "new");
    expect(out).toContain('data-tone="info"');
    expect(words(out)).toContain("The building code check didn't run");
    expect(words(out)).toContain("Check them yourself before you send.");
  });

  it("passed: an ok callout, and the sources folded away when there are any", () => {
    const out = panel(REVIEWS.ok, "new");
    expect(out).toContain('data-tone="ok"');
    expect(words(out)).toContain("Building code check passed");
    const sources = tag(out, 'data-testid="compliance-sources"');
    expect(sources).toMatch(/^<details /);
    expect(sources).not.toContain("open");
    // The two known sources, not the unknown id.
    expect(words(out)).toContain("Sources (2)");
    expect(panel(REVIEWS["ok-no-sources"], "new")).not.toContain("compliance-sources");
  });

  it("the sources' caret turns with its own section, not the tool section around it", () => {
    const summary = panel(REVIEWS.ok, "new").match(/<summary[\s\S]*?<\/summary>/)![0];
    expect(summary).toContain("min-h-12");
    expect(summary).toContain("group-open/sources:rotate-180");
    expect(summary).not.toMatch(/\bgroup-open:/);
  });

  it("warnings: a warn callout with the count, then each group with its checks", () => {
    const out = panel(REVIEWS.warnings, "new");
    expect(tag(out, 'data-testid="compliance-panel"')).not.toContain("data-tone");
    expect(words(out)).toContain("Worth a look before you send");
    // Warning + blocker, as the classic count: 4 (the info note isn't counted).
    expect(words(out)).toContain("4 things to review (1 must be fixed). You can still save the quote while you decide.");
    for (const title of ["Insulation checks", "Timber treatment checks", "Fixing checks", "Other code warnings"]) {
      expect(words(out)).toContain(title);
    }
    // The severity is said in words as well as shown.
    expect(words(out)).toContain("Must fix: Treatment class unspecified");
    expect(words(out)).toContain("Warning: Insulation R-value below H1");
    expect(words(out)).toContain("Note: Bright nails near the coast");
    expect(words(out)).toContain("Line: R2.6 wall insulation");
    // A warning about a line that isn't there names no line, as before.
    const at = out.indexOf("Check the lintel size");
    const lintel = out.slice(out.lastIndexOf("<li", at), out.indexOf("</li>", at));
    expect(words(lintel)).toContain("The opening is over 1.8 m.");
    expect(lintel).not.toContain("Line:");
    // Clarification-type warnings aren't listed here (the form asks them), as before.
    expect(out).not.toContain("Missing wall type");
  });

  it("warnings: every reviewed line with where its decision came from", () => {
    const out = panel(REVIEWS.warnings, "new");
    const pills = [...out.matchAll(/data-tone="(\w+)"[^>]*>([^<]+)<\/span>/g)].map(([, tone, label]) => `${tone}:${label}`);
    expect(pills).toEqual([
      "ok:Code rule",
      "info:Catalogue",
      "info:Your library",
      "neutral:T2Q estimate",
      "warn:Needs more detail",
    ]);
    expect(words(out)).toContain("Which lining?");
    // Labour has no review of its own: not listed.
    expect(out).not.toContain('data-testid="compliance-line-5"');
  });

  it("one warning, no reviewed lines: singular words, no line-by-line section", () => {
    const out = panel(REVIEWS["one-warning"], "new");
    expect(words(out)).toContain("1 thing to review. You can still save");
    expect(out).not.toContain("Line by line");
  });

  it("needs answers: the questions come first, in the same form", () => {
    const out = panel(REVIEWS.clarify, "new");
    expect(words(out)).toContain("A few questions before you send");
    expect(words(out)).toContain("Answer 3 questions so the rules engine can confirm the code-critical materials.");
    expect(out.indexOf('data-testid="clarification-form"')).toBeLessThan(out.indexOf('data-testid="compliance-warning-0"'));
    expect(words(out)).toContain("3 still to answer.");
    expect(tag(out, 'data-testid="clarification-submit"')).toContain('disabled=""');
    expect(words(panel(REVIEWS["clarify-one"], "new"))).toContain("Answer 1 question so");
  });
});

describe("new look: the clarification form", () => {
  it("set answers are 48 px buttons that show the pick in words and state, not colour alone", () => {
    const out = formV2({ answers: { "wall.type": "external" } });
    const picked = tag(out, 'data-testid="clarification-opt-wall.type-external"');
    expect(picked).toContain('aria-pressed="true"');
    expect(picked).toContain("min-h-12");
    expect(picked).toContain('type="button"');
    expect(tag(out, 'data-testid="clarification-opt-wall.type-internal"')).toContain('aria-pressed="false"');
    expect(out).toContain('<legend class="font-semibold">1. Is this wall internal or external?</legend>');
    expect(words(out)).toContain("External walls need insulation and treated framing.");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("anything else is typed into a kit field, labelled by its question", () => {
    const out = formV2({ answers: {} });
    expect(out).toMatch(/<label for="[^"]+" class="[^"]*">3\. Anything else about the wall\?<\/label>/);
    expect(out).toContain('placeholder="Type your answer"');
    expect(out).toContain("ui-input-reset");
    expect(words(out)).toContain("Free text, when there are no set answers.");
  });

  it("Save waits for every answer; saving shows it's busy; a failed save is read out", () => {
    expect(tag(formV2({ answers: { "wall.type": "internal" } }), 'data-testid="clarification-submit"')).toContain(
      'disabled=""',
    );
    const ready = formV2();
    expect(tag(ready, 'data-testid="clarification-submit"')).not.toContain('disabled=""');
    expect(tag(ready, 'data-testid="clarification-submit"')).toContain('type="submit"');
    expect(words(ready)).toContain("All answered.");
    expect(words(ready)).toContain("Save answers");

    const saving = formV2({ submitting: true, submitError: "Failed to save clarifications" });
    const button = tag(saving, 'data-testid="clarification-submit"');
    expect(button).toContain('disabled=""');
    expect(button).toContain('aria-busy="true"');
    expect(words(saving)).toContain("Saving…");
    expect(tag(saving, 'role="alert"')).toMatch(/^<div role="alert">$/);
    expect(words(saving)).toContain("Failed to save clarifications");
    expect(markupRuleBreaks(saving)).toEqual([]);
  });
});

describe("new-look source files follow the design rules", () => {
  it.each(["CompliancePanelV2.tsx", "ClarificationFormV2.tsx"])("%s", (file) => {
    expect(sourceRuleBreaks(readFileSync(join(__dirname, file), "utf8"))).toEqual([]);
  });
});
