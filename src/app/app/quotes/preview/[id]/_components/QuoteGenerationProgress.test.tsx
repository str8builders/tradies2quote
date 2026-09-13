import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuoteGenerationProgress } from "./QuoteGenerationProgress";

describe("quote progress truthfulness", () => {
  it("shows activity without claiming an unmeasured percentage", () => {
    const html = renderToStaticMarkup(createElement(QuoteGenerationProgress));
    expect(html).toContain('role="progressbar"');
    expect(html).not.toContain('aria-valuenow=');
    expect(html).toContain('aria-valuetext="Writing your quote"');
    expect(html).toContain('aria-current="step">Writing quote');
    expect(html).toContain("t2q-tape-needle");
    expect(html).not.toContain("mm / 100mm");
  });
  it("reports completion only after the caller receives success", () => {
    const html = renderToStaticMarkup(createElement(QuoteGenerationProgress, { complete: true }));
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('aria-valuetext="Quote ready"');
    expect(html).toContain('aria-current="step">Ready to review');
  });
});
