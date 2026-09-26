// The new-quote loading screen. A loading file can't ask which look is on, so
// one markup has to read right in both shells: ui- tokens only, its own ui
// background, and the new look's top bar shown by CSS only inside the
// new-look shell (data-look="new").

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import NewQuoteLoading from "./loading";

const html = renderToStaticMarkup(<NewQuoteLoading />);

/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

describe("new quote loading screen", () => {
  it("says what's happening, politely, to screen readers too", () => {
    const status = tag(html, 'data-testid="new-quote-loading"');
    expect(status).toContain('role="status"');
    expect(status).toContain('aria-live="polite"');
    expect(html).toContain("Getting ready…");
    expect(html).toContain("Checking your account and warming up the recorder.");
  });

  it("is the new flow's first screen in outline: the top bar, a heading, three ways in", () => {
    expect(html).toMatch(/<h1[^>]*>New quote<\/h1>/);
    expect(html).toMatch(/<a [^>]*href="\/app"[^>]*>.*Cancel<\/a>/);
    expect(html.match(/data-skeleton="line"/g)).toHaveLength(6);
    expect(tag(html, 'data-skeleton="block"')).toContain("h-12 w-12");
    expect(tag(html, "<ul")).toContain('aria-hidden="true"');
  });

  it("shows the top bar only inside the new-look shell, where the flow's own bar takes over", () => {
    const bar = tag(html, "sticky top-[env(safe-area-inset-top)]");
    expect(bar).toContain(" hidden ");
    expect(bar).toContain("[[data-look=new]_&amp;]:block");
  });

  it("paints its own ui background, so words and page flip together in outdoor mode, in either shell", () => {
    const screen = tag(html, 'data-new-quote-screen="loading"');
    expect(screen).toContain("bg-ui-bg");
    expect(screen).toContain("text-ui-text");
    expect(screen).toContain("min-h-dvh");
  });

  it("no old-look parts: no // step label, uppercase heading, card or ink colours", () => {
    for (const old of ["step 1 of 3", "t2q-", "font-mono", "uppercase", "text-white", "bg-ink", "text-ink", "animate-pulse-ring"]) {
      expect(html).not.toContain(old);
    }
  });

  it("follows the design rules, in what it renders and in its source", () => {
    expect(markupRuleBreaks(html)).toEqual([]);
    const source = readFileSync(join(process.cwd(), "src/app/app/quotes/new/loading.tsx"), "utf8");
    expect(sourceRuleBreaks(source)).toEqual([]);
  });
});
