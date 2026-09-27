// The classic editor's "Photo / plan" panel (<PhotoPlanPanel>), rendered to
// static HTML in node. The snapshot was taken from the untouched component,
// before its reading logic moved into usePhotoPlan for the new look's
// <AddFromPlanSheet>, so the classic look provably renders exactly as it did.
// Regenerate only after an intended change to the classic look:
// npx vitest run <this file> --update
//
// A static render only reaches the panel's first state, so every other state
// is seeded through its useState calls, in the order the panel makes them:
// file, hint, previewUrl, submitting, result, error (usePhotoPlan keeps these
// six in this order), then itemsApplied, notesApplied. `undefined` keeps a
// state's own starting value.

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhotoPlanResult } from "@/lib/agents/photo-plan";

const seed = vi.hoisted(() => ({ values: [] as unknown[], next: 0 }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const at = seed.next++;
      const value = seed.values[at];
      return value === undefined ? actual.useState(initial) : [value, () => {}];
    },
  };
});

import { PhotoPlanPanel } from "./PhotoPlanPanel";

const PHOTO = { name: "deck-plan.jpg", size: 1024, type: "image/jpeg" } as File;
const PREVIEW = "blob:photo-plan-preview";

const RESULT: PhotoPlanResult = {
  description: "A hand-drawn deck plan with piles marked along the long side and steps at one end.",
  items: [
    {
      label: "H3.2 treated pine joists",
      location: "across the short side",
      note: "Ground-level deck",
      confidence: 0.82,
      ai_estimated: true,
    },
    { label: "Concrete piles", location: null, note: null, confidence: 0.6, ai_estimated: true },
  ],
  reviewFlags: ["No scale on the drawing, so measure the deck on site.", "Check the bearer spans."],
  quoteNote: "Supply and build a treated pine deck as drawn.\nPile positions to be confirmed on site.",
};

type Seeds = [
  file?: File | null,
  hint?: string,
  previewUrl?: string | null,
  submitting?: boolean,
  result?: PhotoPlanResult | null,
  error?: string | null,
  itemsApplied?: boolean,
  notesApplied?: boolean,
];

function panel(seeds: Seeds = [], isAccepted?: boolean): string {
  seed.values = seeds;
  seed.next = 0;
  return renderToStaticMarkup(
    <PhotoPlanPanel onAddItems={() => {}} onAddNotes={() => {}} isAccepted={isAccepted} />,
  );
}

afterEach(() => {
  seed.values = [];
  seed.next = 0;
});

const STATES: Array<[name: string, markup: () => string]> = [
  ["setup", () => panel()],
  ["picked, with a note", () => panel([PHOTO, "bathroom wall", PREVIEW])],
  ["reading", () => panel([PHOTO, "", PREVIEW, true])],
  ["error", () => panel([null, "", null, false, null, "That photo couldn't be read. Try a clearer photo."])],
  ["result", () => panel([PHOTO, "", PREVIEW, false, RESULT])],
  [
    "result, one item, no flags",
    () => panel([PHOTO, "", PREVIEW, false, { ...RESULT, items: RESULT.items.slice(0, 1), reviewFlags: [] }]),
  ],
  ["result, no items", () => panel([PHOTO, "", PREVIEW, false, { ...RESULT, items: [] }])],
  ["both added", () => panel([PHOTO, "", PREVIEW, false, RESULT, null, true, true])],
  ["accepted quote", () => panel([PHOTO, "", PREVIEW, false, RESULT], true)],
];

describe("PhotoPlanPanel (classic look) renders exactly as before", () => {
  it("reaches every state it is seeded with", () => {
    expect(panel()).toContain("Upload a site photo or a sketched plan");
    expect(panel([PHOTO, "", PREVIEW])).toContain(`src="${PREVIEW}"`);
    expect(panel([PHOTO, "", PREVIEW, true])).toContain("Reading…");
    expect(panel([PHOTO, "", PREVIEW, false, RESULT])).toContain("Read · 2 items found");
    expect(panel([PHOTO, "", PREVIEW, false, RESULT, null, true, true]).replaceAll("<!-- -->", "")).toContain(
      "2 items added",
    );
  });

  it("every state", async () => {
    const out = STATES.map(([name, markup]) => `<!-- ${name} -->\n${markup()}\n`).join("\n");
    await expect(out).toMatchFileSnapshot("./__snapshots__/PhotoPlanPanel.classic.html");
  });
});
