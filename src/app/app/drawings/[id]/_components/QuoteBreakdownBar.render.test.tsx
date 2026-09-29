import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import type { PlanTakeoff } from "@/lib/planset/takeoff/fromModel";
import { QuoteBreakdownBar, breakdownState } from "./QuoteBreakdownBar";

const takeoff = (over: Partial<PlanTakeoff> = {}): PlanTakeoff => ({
  lines: [{ id: "studs", group: "Framing", name: "90x45 SG8 Studs", quantity: 412, unit: "each", formula: "", status: "ok", evidence: [] }],
  blockers: [],
  assumptions: [],
  byOthers: [],
  ...over,
});
const blocker = (id: string) => ({ id, message: "I couldn't find the stud height on the plans." });
const bar = (view: Parameters<typeof breakdownState>[0], extra: { onShowQuestions?: () => void; showRemake?: boolean } = {}) =>
  renderToStaticMarkup(createElement(QuoteBreakdownBar, { setId: "set-1", view, ...extra }));

describe("breakdownState", () => {
  it("opens a made quote, sends to the questions, or makes one", () => {
    expect(breakdownState({ quoteId: "q-1", takeoff: takeoff() })).toBe("open");
    expect(breakdownState({ quoteId: null, takeoff: takeoff({ blockers: [blocker("stud")] }) })).toBe("questions");
    expect(breakdownState({ quoteId: null, takeoff: takeoff({ lines: [] }) })).toBe("empty");
    expect(breakdownState({ quoteId: null, takeoff: null })).toBe("empty");
    expect(breakdownState({ quoteId: null, takeoff: takeoff() })).toBe("make");
  });
});

describe("the Quote breakdown button", () => {
  it("makes the quote breakdown from the materials", () => {
    const out = bar({ quoteId: null, takeoff: takeoff() });
    expect(out).toContain('data-testid="quote-breakdown"');
    expect(out).toContain(">Quote breakdown<");
    expect(out).toContain("Your materials by trade, each with a subtotal, priced from your price list where it matches.");
    expect(out).not.toMatch(/data-testid="quote-breakdown"[^>]*disabled/);
  });

  it("says how many questions stand in the way and goes to them", () => {
    const out = bar({ quoteId: null, takeoff: takeoff({ blockers: [blocker("a"), blocker("b")] }) }, { onShowQuestions: () => {} });
    expect(out).toContain("Answer 2 questions first. They&#x27;re at the top of Materials.");
    expect(out).not.toMatch(/data-testid="quote-breakdown"[^>]*disabled/);
    // Already on Materials: nowhere to go, so the button waits.
    expect(bar({ quoteId: null, takeoff: takeoff({ blockers: [blocker("a")] }) })).toMatch(/data-testid="quote-breakdown"[^>]*disabled/);
  });

  it("opens the quote once it's made, and offers a new one on Materials", () => {
    const out = bar({ quoteId: "q-9", takeoff: takeoff() });
    expect(out).toContain('href="/app/quotes/preview/q-9"');
    expect(out).toContain("Open the quote breakdown");
    expect(out).not.toContain("Make a new one");
    expect(bar({ quoteId: "q-9", takeoff: takeoff() }, { showRemake: true })).toContain("Make a new one");
  });

  it("waits when there's nothing to price", () => {
    const out = bar({ quoteId: null, takeoff: takeoff({ lines: [] }) });
    expect(out).toContain("There&#x27;s nothing to price from these plans yet.");
    expect(out).toMatch(/data-testid="quote-breakdown"[^>]*disabled/);
  });
});
