import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VerificationPanel } from "./VerificationPanel";
import type { VerificationReport } from "@/lib/agents/verify/quoteVerify";
import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";

const render = (report: VerificationReport) =>
  renderToStaticMarkup(createElement(VerificationPanel, { report }));

describe("VerificationPanel", () => {
  it("shows a green 'checks passed' line when there are no issues", () => {
    const html = render({ ok: true, issues: [], checkedBy: ["deterministic"] });
    expect(html).toContain("quote-verification-ok");
    expect(html).toContain("checks passed");
    expect(html).toContain("deterministic");
    expect(html).not.toContain("quote-verification&quot;"); // not the callout
  });

  it("shows an amber 'worth a glance' callout for warnings only", () => {
    const html = render({
      ok: true,
      issues: [{ code: "zero_price", severity: "warning", message: "No price on decking" }],
      checkedBy: ["deterministic", "critic"],
    });
    expect(html).toContain('data-testid="quote-verification"');
    expect(html).toContain('data-ok="true"');
    expect(html).toContain("worth a glance");
    expect(html).toContain("No price on decking");
  });

  it("shows a red 'fix before sending' callout when there's an error", () => {
    const html = render({
      ok: false,
      issues: [
        { code: "subtotal_mismatch", severity: "error", message: "Subtotal is wrong" },
        { code: "zero_price", severity: "warning", message: "Check the GIB price" },
      ],
      checkedBy: ["deterministic"],
    });
    expect(html).toContain('data-ok="false"');
    expect(html).toContain("fix before sending");
    expect(html).toContain("Subtotal is wrong");
    expect(html).toContain("Check the GIB price");
  });
});

// The classic look, pinned by file snapshots taken from the untouched panel
// before the new look existed: look="classic" (the default) renders exactly as
// before. Regenerate only after an intended change to the classic look.
const REPORTS: Record<string, VerificationReport> = {
  passed: { ok: true, issues: [], checkedBy: ["deterministic", "critic"] },
  warnings: {
    ok: true,
    issues: [{ code: "zero_price", severity: "warning", message: "No price on decking" }],
    checkedBy: ["deterministic"],
  },
  errors: {
    ok: false,
    issues: [
      { code: "subtotal_mismatch", severity: "error", message: "Subtotal is wrong" },
      { code: "zero_price", severity: "warning", message: "Check the GIB price" },
    ],
    checkedBy: ["deterministic"],
  },
};

describe("VerificationPanel, classic look (the default): exactly as before", () => {
  it.each(Object.keys(REPORTS))("%s", async (name) => {
    await expect(render(REPORTS[name])).toMatchFileSnapshot(`./__snapshots__/VerificationPanel.classic.${name}.html`);
  });
});

// look="new" (the new-look job page): the same report drawn with the kit.
const renderNew = (report: VerificationReport) =>
  renderToStaticMarkup(createElement(VerificationPanel, { report, look: "new" }));
const hooks = (markup: string) => [...markup.matchAll(/\bdata-(testid|ok)="([^"]*)"/g)].map((m) => m[0]);
const words = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("VerificationPanel, new look", () => {
  it("keeps the classic test ids and data-ok", () => {
    for (const report of Object.values(REPORTS)) expect(hooks(renderNew(report))).toEqual(hooks(render(report)));
  });

  it("passed: a quiet line saying who checked it", () => {
    const html = renderNew(REPORTS.passed);
    expect(words(html)).toContain(
      "The sums and prices were double-checked, and T2Q read the quote over a second time. Nothing to fix.",
    );
    expect(words(renderNew({ ok: true, issues: [], checkedBy: ["deterministic"] }))).toContain(
      "The sums and prices were double-checked. Nothing to fix.",
    );
    expect(html).toContain("text-ui-ok");
  });

  it("warnings only: a warn callout, nothing marked must-fix", () => {
    const html = renderNew(REPORTS.warnings);
    expect(html).toContain('data-tone="warn"');
    expect(words(html)).toContain("Worth a look before you send");
    expect(words(html)).toContain("No price on decking");
    expect(html).not.toContain("Must fix");
  });

  it("an error: a bad callout, with the errors marked must-fix", () => {
    const html = renderNew(REPORTS.errors);
    expect(html).toContain('data-tone="bad"');
    expect(words(html)).toContain("Something to fix before you send");
    expect(words(html)).toContain("Must fix: Subtotal is wrong");
    expect(words(html)).not.toContain("Must fix: Check the GIB price");
  });

  it("follows the design rules, in the markup and the source", () => {
    for (const report of Object.values(REPORTS)) expect(markupRuleBreaks(renderNew(report))).toEqual([]);
    expect(sourceRuleBreaks(readFileSync(join(__dirname, "VerificationPanelV2.tsx"), "utf8"))).toEqual([]);
  });
});
