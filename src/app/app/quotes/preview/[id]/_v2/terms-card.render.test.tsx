// The Terms card on the new-look job page: the quote's terms without the
// detailed editor. Static HTML in node, one state at a time.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { markupRuleBreaks } from "@/test/design-rules";
import { TermsCard } from "./parts/TermsCard";

const noop = () => {};
const TERMS = "50% deposit on acceptance.\nBalance on completion.\nValid for 30 days.";
const card = (terms: string | null, locked = false) =>
  renderToStaticMarkup(<TermsCard terms={terms} locked={locked} onOpen={noop} />);
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g)].map((m) => m[0].replace(/<[^>]*>/g, ""));

describe("TermsCard", () => {
  it("shows the terms as the client reads them, with Edit", () => {
    const html = card(TERMS);
    expect(html).toContain("50% deposit on acceptance.");
    expect(html).toContain("whitespace-pre-line");
    expect(buttons(html)).toEqual(["Edit"]);
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("a locked quote's terms can be read, not changed", () => {
    expect(buttons(card(TERMS, true))).toEqual(["View"]);
  });

  it("no terms yet: says so, and Add terms", () => {
    const html = card("  ");
    expect(html).toContain("No terms on this quote yet.");
    expect(buttons(html)).toEqual(["Add terms"]);
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("no terms on a locked quote: nothing to press", () => {
    expect(buttons(card(null, true))).toEqual([]);
  });
});
