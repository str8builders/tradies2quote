import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { librarySaveOutcome } from "@/lib/materials/libraryImport";
import { markupRuleBreaks } from "@/test/design-rules";
import { QuoteImportDone } from "./QuoteImportDone";

// The screen after "Add to library" on a scanned supplier quote must say
// what really happened — never "Added to your library" when nothing was.
// In either look.

function render(
  result: Parameters<typeof librarySaveOutcome>[0],
  merged: Array<{ name: string; count: number }> = [],
  look?: "old" | "new",
) {
  return renderToStaticMarkup(
    createElement(QuoteImportDone, {
      outcome: librarySaveOutcome(result),
      merged,
      onScanAnother: () => undefined,
      onBack: () => undefined,
      look,
    }),
  );
}

/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

describe("QuoteImportDone", () => {
  it("nothing saved: an error with a way back to the lines, never 'Added'", () => {
    const html = render({ inserted: 0, updated: 0, failed: 2, failedNames: ["Pine 90x45", "Nails"] });
    expect(html).toContain('data-tone="bad"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Nothing was saved to your library.");
    expect(html).not.toContain("Added");
    expect(html).toContain("“Pine 90x45”, “Nails”");
    expect(html).toContain("Back to the lines");
    expect(html).not.toContain("View library");
  });

  it("some failed: names them", () => {
    const html = render({ inserted: 3, updated: 0, failed: 1, failedNames: ["Bad line"] });
    expect(html).toContain('data-tone="partial"');
    expect(html).toContain("Saved 3 of 4 to your library.");
    expect(html).toContain("Not saved: “Bad line”");
    expect(html).toContain("View library");
  });

  it("all saved: says so, and lists names that were on two lines", () => {
    const html = render({ inserted: 2, updated: 1, failed: 0 }, [{ name: "Joist hanger", count: 2 }]);
    expect(html).toContain("Added to your library.");
    expect(html).toContain("2 new, 1 updated.");
    expect(html).toContain("“Joist hanger”");
  });
});

describe("QuoteImportDone, new look", () => {
  const NOTHING = { inserted: 0, updated: 0, failed: 2, failedNames: ["Pine 90x45", "Nails"] };
  const SOME = { inserted: 3, updated: 0, failed: 1, failedNames: ["Bad line"] };
  const ALL = { inserted: 2, updated: 1, failed: 0 };

  it("the old look stays the default", () => {
    expect(render(ALL, [], "old")).toBe(render(ALL));
    expect(render(ALL)).toContain("t2q-card-pro");
  });

  it("nothing saved: an alert with a way back to the lines, never 'Added'", () => {
    const html = render(NOTHING, [], "new");
    expect(tag(html, 'data-testid="quote-import-done"')).toContain('role="alert"');
    expect(html).toContain('data-tone="bad"');
    expect(html).toContain("Nothing was saved to your library");
    expect(html).not.toContain("Added");
    expect(html).not.toContain("scanned estimates");
    expect(tag(html, 'data-testid="quote-import-done-back"')).toContain('data-variant="primary"');
    expect(html).not.toContain('href="/app/materials"');
  });

  it("some or all saved: said plainly, with the way back to your prices", () => {
    const some = render(SOME, [], "new");
    expect(tag(some, 'data-testid="quote-import-done"')).toContain('role="status"');
    expect(some).toContain('data-tone="warn"');
    expect(some).toContain("Saved 3 of 4 to your library");
    expect(some).toContain("Not saved: “Bad line”");
    const all = render(ALL, [{ name: "Joist hanger", count: 2 }], "new");
    expect(all).toContain('data-tone="ok"');
    expect(all).toContain("Added to your library");
    expect(all).toContain("scanned estimates");
    expect(tag(all, 'data-testid="quote-import-done-merged"')).toBeTruthy();
    expect(all).toContain("“Joist hanger”");
    expect(tag(all, 'href="/app/materials"')).toContain('data-variant="primary"');
    expect(all).toContain("Scan another");
  });

  it.each([NOTHING, SOME, ALL])("follows the design rules (%#)", (result) => {
    const html = render(result, [{ name: "Joist hanger", count: 2 }], "new");
    for (const old of ["t2q-", "font-display", "uppercase", "text-white", "text-ink", "text-brand ", "text-hivis"]) {
      expect(html).not.toContain(old);
    }
    expect(markupRuleBreaks(html)).toEqual([]);
  });
});
