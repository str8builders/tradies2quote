// Job photos in both looks. The classic snapshot was taken from the untouched
// component, before the new look was added, so the classic editor and the
// client's public quote page provably render exactly as they did.
// Regenerate only after an intended change to the old look:
// npx vitest run <this file> --update

import { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { markupRuleBreaks } from "@/test/design-rules";
import { QuotePhotos, QuotePhotosV2View } from "./QuotePhotos";

describe("QuotePhotos (classic) renders exactly as before", () => {
  it("the tradie's card, and nothing on a public link without photos", async () => {
    expect(renderToStaticMarkup(<QuotePhotos token="tok-1" />)).toBe("");
    await expect(renderToStaticMarkup(<QuotePhotos quoteId="q-1" />)).toMatchFileSnapshot(
      "./__snapshots__/QuotePhotos.classic.html",
    );
  });

  it("is the default look", () => {
    expect(renderToStaticMarkup(<QuotePhotos quoteId="q-1" look="classic" />)).toBe(
      renderToStaticMarkup(<QuotePhotos quoteId="q-1" />),
    );
  });
});

/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

const ENDPOINT = "/api/quotes/q-1/photos";
const DECK = { id: "p1", name: "Deck from the lawn.jpg" };
const STEPS = { id: "p2", name: "Old steps.jpg" };
const NOTE = "Attach up to 8 photos before sending. Clients can view them on the quote link. Photos are locked once sent.";

const view = (patch: Partial<ComponentProps<typeof QuotePhotosV2View>> = {}) =>
  renderToStaticMarkup(
    <QuotePhotosV2View
      photos={[DECK, STEPS]}
      endpoint={ENDPOINT}
      note={NOTE}
      canEdit
      busy={false}
      error=""
      onUpload={() => undefined}
      onRemove={() => undefined}
      {...patch}
    />,
  );

const STATES: Array<[string, string]> = [
  ["on the job page, loading", renderToStaticMarkup(<QuotePhotos quoteId="q-1" look="new" />)],
  ["photos the tradie can change", view()],
  ["saving a photo", view({ busy: true })],
  ["a problem", view({ error: "Photo could not be saved." })],
  ["eight photos: full", view({ photos: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Photo ${i + 1}.jpg` })) })],
  ["read only", view({ canEdit: false, note: null })],
  ["none yet", view({ photos: [] })],
];

describe("QuotePhotos in the new look", () => {
  it.each(STATES)("%s: follows the design rules", (_name, markup) => {
    expect(markupRuleBreaks(markup)).toEqual([]);
    for (const old of ["t2q-", "bg-ink", "text-ink", "border-ink", "text-brand ", "red-300", "text-xs", "text-sm"]) {
      expect(markup).not.toContain(old);
    }
  });

  it("sits inside the Photos tool: the note, no heading or card of its own", () => {
    const [, markup] = STATES[0];
    expect(markup).toMatch(/^<section class="space-y-3" aria-label="Quote photos">/);
    expect(markup).toContain("Photo attachments are included with Crew and Builder.");
    expect(markup).not.toContain("Job photos");
    expect(markup).not.toContain("<h2");
  });

  it("shows each photo with a 48 px Remove, and Add a photo as the kit's button", () => {
    const markup = view();
    expect(tag(markup, 'src="/api/quotes/q-1/photos?photo=p1"')).toContain('alt="Deck from the lawn.jpg"');
    expect(tag(markup, 'href="/api/quotes/q-1/photos?photo=p2"')).toContain('target="_blank"');
    const remove = tag(markup, 'aria-label="Remove Old steps.jpg"');
    expect(remove).toContain("h-12 w-12");
    expect(markup).toContain("Add a photo");
    expect(tag(markup, 'type="file"')).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(markup).toMatch(/<label class="[^"]*min-h-12[^"]*cursor-pointer"><svg[\s\S]*?<\/svg>Add a photo<input/);
  });

  it("while saving: the spinner keeps turning, nothing else can be changed", () => {
    const markup = view({ busy: true });
    expect(markup).toContain("Saving photo…");
    expect(markup).toMatch(/animate-spin [^"]*motion-reduce:animate-spin-calm/);
    expect(tag(markup, 'type="file"')).toContain('disabled=""');
    expect(tag(markup, 'aria-label="Remove Old steps.jpg"')).toContain('disabled=""');
  });

  it("reads a problem out, stops offering Add at eight, and hides Remove when read only", () => {
    expect(view({ error: "Photo could not be saved." })).toMatch(/role="alert"[\s\S]*Photo could not be saved\./);
    expect(STATES[4][1]).not.toContain("Add a photo");
    expect(view({ canEdit: false })).not.toContain("Remove ");
    expect(view({ canEdit: false })).not.toContain("Add a photo");
  });

  it("the public link stays empty without photos in either look", () => {
    expect(renderToStaticMarkup(<QuotePhotos token="tok-1" look="new" />)).toBe("");
  });
});
