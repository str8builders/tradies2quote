// The classic "Takeoff assumptions" panel renders exactly as it did before its
// form moved into useTakeoffForm (shared with the new job page's measurements
// sheet). The snapshots were taken from the untouched component, so the
// classic editor provably renders byte for byte as before.
// Regenerate only after an intended change to the old look:
// npx vitest run <this file> --update

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaterialTakeoffResult } from "@/lib/materialCalculator";
import type { TakeoffInputsSnapshot } from "@/lib/quote-types";

// After a Recalculate tap the panel shows the calculator's warnings and its
// area summary. Node has no DOM to tap in, so those two pieces of state are
// seeded instead: the panel's useState([]) (warnings) and useState(null)
// (last summary) start from these values when they are set.
const seeded = vi.hoisted(
  () => ({}) as { warnings?: string[]; summary?: MaterialTakeoffResult["summary"] },
);
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (Array.isArray(initial) && initial.length === 0 && seeded.warnings) return [seeded.warnings, () => {}];
      if (initial === null && seeded.summary) return [seeded.summary, () => {}];
      return actual.useState(initial);
    },
  };
});

import { initialTakeoffForm, takeoffFormInput, TakeoffPanel } from "./TakeoffPanel";

/** Every input moved off its default, so each field shows the stored value. */
const FILLED: TakeoffInputsSnapshot = {
  wallLengthM: 4.8,
  wallHeightM: 2.7,
  studSpacingMm: 400,
  numberOfDoors: 2,
  numberOfWindows: 1,
  gibSides: 1,
  includeInsulation: false,
  includeSkirting: true,
  includeArchitraves: true,
  wastePercent: 12.5,
};

const panel = (props: { initialInputs?: TakeoffInputsSnapshot; isAccepted?: boolean } = {}) =>
  renderToStaticMarkup(<TakeoffPanel onRecalculate={() => {}} {...props} />);

describe("TakeoffPanel (classic) renders exactly as before", () => {
  afterEach(() => {
    delete seeded.warnings;
    delete seeded.summary;
  });

  it("opened with nothing stored: the defaults, Recalculate off until a length", async () => {
    await expect(panel()).toMatchFileSnapshot("./__snapshots__/TakeoffPanel.classic.empty.html");
  });

  it("opened on stored inputs: every field and toggle filled in", async () => {
    await expect(panel({ initialInputs: FILLED })).toMatchFileSnapshot(
      "./__snapshots__/TakeoffPanel.classic.filled.html",
    );
  });

  it("on an accepted quote: Recalculate off with its reason", async () => {
    await expect(panel({ initialInputs: FILLED, isAccepted: true })).toMatchFileSnapshot(
      "./__snapshots__/TakeoffPanel.classic.accepted.html",
    );
  });

  it("after a recalculation: the warnings and the area summary", async () => {
    seeded.warnings = ["netWallAreaM2 is 0 — check wall dimensions or openings."];
    seeded.summary = { wallAreaM2: 12.96, openingAreaM2: 4.79, netWallAreaM2: 8.17, wastePercent: 12.5 };
    await expect(panel({ initialInputs: FILLED })).toMatchFileSnapshot(
      "./__snapshots__/TakeoffPanel.classic.recalculated.html",
    );
  });

  it("a partial stored snapshot (a deck quote's inputs) falls back to the defaults", async () => {
    const deckInputs = { deckLengthM: 4.8, deckWidthM: 3, wastePercent: 7, includeInsulation: false } as unknown as TakeoffInputsSnapshot;
    await expect(panel({ initialInputs: deckInputs })).toMatchFileSnapshot(
      "./__snapshots__/TakeoffPanel.classic.partial.html",
    );
  });
});

describe("useTakeoffForm's pure parts (shared with the new job page)", () => {
  it("opens on the stored inputs, else the calculator's defaults", () => {
    expect(initialTakeoffForm()).toEqual({
      wallLengthM: "",
      wallHeightM: "2.4",
      studSpacingMm: 600,
      numberOfDoors: "0",
      numberOfWindows: "0",
      gibSides: 2,
      includeInsulation: true,
      includeSkirting: false,
      includeArchitraves: false,
      wastePercent: "10",
    });
    expect(initialTakeoffForm(FILLED)).toMatchObject({ wallLengthM: "4.8", studSpacingMm: 400, gibSides: 1, wastePercent: "12.5" });
  });

  it("sends the calculator exactly what Recalculate always sent", () => {
    expect(takeoffFormInput(initialTakeoffForm(FILLED))).toEqual(FILLED);
    // An empty box is 0 (Number("") is 0), not the default...
    expect(takeoffFormInput({ ...initialTakeoffForm(), wallHeightM: "", wastePercent: "" })).toMatchObject({
      wallLengthM: 0,
      wallHeightM: 0,
      wastePercent: 0,
    });
    // ...and only text that isn't a number falls back to it.
    expect(takeoffFormInput({ ...initialTakeoffForm(), wallHeightM: "abc", wastePercent: "x" })).toMatchObject({
      wallHeightM: 2.4,
      wastePercent: 10,
    });
  });
});
