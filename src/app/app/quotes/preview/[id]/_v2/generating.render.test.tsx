// "Writing your quote": the new look's panel (kit markup, the classic
// generator's logic) and the classic card, which is pinned by a file
// snapshot taken before the new look got its own markup, so the classic page
// provably renders exactly as before.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { markupRuleBreaks } from "@/test/design-rules";
import { QuoteGenerator } from "../_components/QuoteGenerator";
import { GeneratingScreen } from "./GeneratingScreen";
import { GeneratingPanel, GeneratingPanelView, generatingMessage, type GeneratingPanelViewProps } from "./parts/GeneratingPanel";

const html = (element: React.ReactElement) => renderToStaticMarkup(element);

const WRITING: GeneratingPanelViewProps = {
  pending: true,
  complete: false,
  error: "",
  waitingNote: "",
  elapsedS: 0,
  onRetry: () => {},
};
const view = (patch: Partial<GeneratingPanelViewProps> = {}) => html(createElement(GeneratingPanelView, { ...WRITING, ...patch }));

/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

describe("the classic generator (old look), exactly as before", () => {
  it("first paint: writing, with the tape and the clock", async () => {
    const out = html(createElement(QuoteGenerator, { id: "q1" }));
    await expect(out).toMatchFileSnapshot("./__snapshots__/QuoteGenerator.old.writing.html");
  });
});

describe("the new look's generating screen", () => {
  const screen = html(createElement(GeneratingScreen, { quoteId: "q1", quoteNumber: "Q-0012" }));

  it("frames the panel with the job's top bar and rail, and none of the classic card", () => {
    expect(screen).toMatch(/<h1[^>]*>New quote<\/h1>/);
    expect(screen).toContain("Quote Q-0012");
    expect(screen).toContain('data-testid="quote-generator"');
    for (const old of ["t2q-card-pro", "t2q-loading-tape", "t2q-generation", "Generation failed", "font-mono"]) {
      expect(screen).not.toContain(old);
    }
  });

  it("drops the rail's 'Writing your quote' line once a try fails (by CSS, from the panel's state)", () => {
    expect(tag(screen, "This usually takes under a minute.")).toContain(
      "group-has-[[data-state=failed]]/generating:hidden",
    );
    expect(tag(screen, "group/generating")).toContain("max-w-xl");
  });

  it("starts writing at once, like the classic card (the same logic)", () => {
    expect(html(createElement(GeneratingPanel, { quoteId: "q1" }))).toBe(view());
    expect(tag(screen, 'data-testid="quote-generator"')).toContain('data-state="writing"');
  });

  it("follows the design rules in every state", () => {
    expect(markupRuleBreaks(screen)).toEqual([]);
    for (const patch of [{ complete: true }, { waitingNote: "We're already writing this quote." }, { pending: false, error: "Boom" }]) {
      expect(markupRuleBreaks(view(patch)), JSON.stringify(patch)).toEqual([]);
    }
  });
});

describe("the new look's generating panel", () => {
  it("writing: a spinner that stops for reduced motion, the words live, the clock not", () => {
    const out = view({ elapsedS: 75 });
    expect(out).toContain("Writing your quote…");
    expect(tag(out, "animate-spin")).toContain("motion-reduce:animate-none");
    expect(tag(out, "Still working.")).toContain('aria-live="polite"');
    expect(out).toContain("1:15 elapsed");
    expect(tag(out, "1:15 elapsed")).not.toContain("aria-live");
    expect(tag(out, "1:15 elapsed")).toContain("tabular-nums");
  });

  it("uses the classic card's words while it waits", () => {
    expect(generatingMessage({ complete: false, waitingNote: "", elapsedS: 5 })).toBe(
      "Turning your job details into materials, labour and a total for you to check.",
    );
    expect(generatingMessage({ complete: false, waitingNote: "", elapsedS: 60 })).toBe(
      "Still working. Your job details are saved.",
    );
    expect(generatingMessage({ complete: false, waitingNote: "Another tab is writing it.", elapsedS: 90 })).toBe(
      "Another tab is writing it.",
    );
    expect(generatingMessage({ complete: true, waitingNote: "x", elapsedS: 90 })).toBe("Opening your review.");
  });

  it("ready: a tick, and it says it's opening the review", () => {
    const out = view({ complete: true, elapsedS: 42 });
    expect(tag(out, 'data-testid="quote-generator"')).toContain('data-state="ready"');
    expect(out).toContain("Your quote is ready");
    expect(out).toContain("Opening your review.");
    expect(out).toContain("text-ui-ok");
    expect(out).not.toContain("animate-spin");
  });

  it("failed: a plain alert with the reason, Try again and a way Home", () => {
    const out = view({ pending: false, error: "The AI service is busy. Try again in a minute." });
    const box = tag(out, 'data-testid="quote-generator"');
    expect(box).toContain('data-state="failed"');
    expect(box).toContain('role="alert"');
    expect(out).toContain('data-tone="bad"');
    expect(out).toContain('data-testid="quote-generator-error"');
    expect(out).toContain("We couldn&#x27;t write your quote");
    expect(out).toContain("The AI service is busy. Try again in a minute.");
    expect(out).toContain("come back to it later from Jobs");
    const retry = tag(out, 'data-testid="quote-generator-retry"');
    expect(retry).toContain('type="button"');
    expect(retry).toContain('data-variant="primary"');
    expect(retry).toContain("min-h-12");
    expect(tag(out, 'data-testid="quote-generator-dashboard"')).toContain('href="/app"');
    expect(out).toContain("Back to Home");
  });
});
