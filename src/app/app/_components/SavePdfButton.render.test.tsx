// SavePdfButton in both looks. The classic snapshot was taken from the
// untouched component, before the new look was added, so the old look (the
// classic editor, send and invoice cards) provably renders exactly as it did.
// Regenerate only after an intended change to the old look:
// npx vitest run <this file> --update

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buttonClasses } from "@/components/ui/button";
import { markupRuleBreaks } from "@/test/design-rules";
import { SavePdfButton, SavePdfButtonV2View } from "./SavePdfButton";

const PDF = "/api/quotes/q-1/pdf";
const noop = () => undefined;

describe("SavePdfButton (classic) renders exactly as before", () => {
  it("the ghost chip, and the caller's classes and label", async () => {
    const out = [
      renderToStaticMarkup(<SavePdfButton url={PDF} filename="quote-q-1.pdf" />),
      renderToStaticMarkup(
        <SavePdfButton url={PDF} filename="quote-q-1.pdf" label="Download the PDF" className="w-full rounded" />,
      ),
    ].join("\n");
    await expect(out).toMatchFileSnapshot("./__snapshots__/SavePdfButton.classic.html");
  });

  it("is the default look", () => {
    const props = { url: PDF, filename: "quote-q-1.pdf", label: "Download the PDF" };
    expect(renderToStaticMarkup(<SavePdfButton {...props} look="classic" />)).toBe(
      renderToStaticMarkup(<SavePdfButton {...props} />),
    );
  });
});

/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

const view = (state: "idle" | "working" | "done" | "error", text: string, error = "", needsBusinessName = false) =>
  renderToStaticMarkup(
    <SavePdfButtonV2View
      state={state}
      text={text}
      errorMessage={error}
      needsBusinessName={needsBusinessName}
      onSave={noop}
    />,
  );

const STATES: Array<[string, string]> = [
  ["ready", renderToStaticMarkup(<SavePdfButton url={PDF} filename="quote-q-1.pdf" label="Download the PDF" look="new" />)],
  ["making the PDF", view("working", "Preparing…")],
  ["saved", view("done", "Saved")],
  ["couldn't save", view("error", "Try again", "Could not save the PDF. Please try again.")],
  ["needs the business name", view("error", "Try again", "Add your business name in Settings before sending or downloading a quote.", true)],
];

describe("SavePdfButton in the new look", () => {
  it.each(STATES)("%s: follows the design rules", (_name, markup) => {
    expect(markupRuleBreaks(markup)).toEqual([]);
    for (const old of ["t2q-", "bg-ink", "text-ink", "text-white", "red-400", "font-mono"]) expect(markup).not.toContain(old);
  });

  it("is the kit's secondary button, full width, 48 px, with its label", () => {
    const [, markup] = STATES[0];
    const button = tag(markup, 'data-testid="save-pdf-button"');
    expect(button).toContain(buttonClasses({ variant: "secondary", fullWidth: true }));
    expect(button).toContain("min-h-12");
    expect(markup).toContain(">Download the PDF<");
    expect(markup).not.toContain('role="alert"');
  });

  it("spins while the PDF is made (still turning under Reduce Motion) and can't be tapped twice", () => {
    const markup = view("working", "Preparing…");
    const button = tag(markup, 'data-testid="save-pdf-button"');
    expect(button).toContain('disabled=""');
    expect(button).toContain('aria-busy="true"');
    expect(markup).toMatch(/animate-spin [^"]*motion-reduce:animate-spin-calm/);
    expect(markup).toContain("Preparing…");
  });

  it("says a problem in an alert, with Open Settings when the business name is missing", () => {
    const failed = view("error", "Try again", "Could not save the PDF. Please try again.");
    expect(failed).toMatch(/role="alert"[\s\S]*data-tone="bad"[\s\S]*Could not save the PDF/);
    expect(failed).not.toContain("/app/settings");
    const named = view("error", "Try again", "Add your business name in Settings.", true);
    expect(named).toContain('data-tone="warn"');
    expect(named).toMatch(/<a data-variant="secondary"[^>]*href="\/app\/settings"><span>Open Settings<\/span><\/a>/);
  });

  it("keeps the caller's className for layout, on the wrapper", () => {
    const markup = renderToStaticMarkup(<SavePdfButton url={PDF} filename="q.pdf" className="mt-4" look="new" />);
    expect(markup).toMatch(/^<div class="space-y-2 mt-4">/);
  });
});
