import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { librarySaveOutcome } from "@/lib/materials/libraryImport";
import { QuoteImportDone } from "./QuoteImportDone";

// The screen after "Add to library" on a scanned supplier quote must say
// what really happened — never "Added to your library" when nothing was.

function render(result: Parameters<typeof librarySaveOutcome>[0], merged: Array<{ name: string; count: number }> = []) {
  return renderToStaticMarkup(
    createElement(QuoteImportDone, {
      outcome: librarySaveOutcome(result),
      merged,
      onScanAnother: () => undefined,
      onBack: () => undefined,
    }),
  );
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
