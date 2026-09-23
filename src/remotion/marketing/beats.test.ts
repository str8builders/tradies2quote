import { describe, expect, it } from "vitest";
import {
  DEMO_TIMELINE,
  EXAMPLE,
  HERO_LOOP_FRAMES,
  LABOUR_EDIT_STEPS,
  SOCIAL_TIMELINE,
  TOUR_TIMELINE,
  VIDEO_FPS,
  lineTotal,
  type Timeline,
} from "../demo-script";
import { HERO_BEATS, checkBeats, draftBeats, fieldText, labourLineAt, type Pace } from "./beats";

const round2 = (n: number) => Math.round(n * 100) / 100;
const cents = (n: number) => Math.round(n * 100);

/** Quote totals the app would show for a set of lines (no markup in the example). */
function quoteTotals(lines: ReadonlyArray<{ quantity: number; unitPrice: number }>) {
  const subtotal = round2(lines.reduce((sum, l) => sum + lineTotal(l.quantity, l.unitPrice), 0));
  const gst = round2((subtotal * EXAMPLE.gstRate) / 100);
  return { subtotal, gst, total: round2(subtotal + gst) };
}

/** Frames of a chapter in a timeline, as the compositions see them. */
function chapterFrames(timeline: Timeline, id: string) {
  const chapter = timeline.chapters.find((c) => c.id === id);
  if (!chapter) throw new Error(`${timeline.id} has no ${id} chapter`);
  return chapter.durationInFrames;
}

const CHECK_CUTS: Array<[string, Pace, number]> = [
  ["demo", "full", chapterFrames(DEMO_TIMELINE, "check")],
  ["tour", "full", chapterFrames(TOUR_TIMELINE, "check")],
  ["social", "fast", chapterFrames(SOCIAL_TIMELINE, "check")],
];

describe("line maths in every composition", () => {
  it("every example line is quantity × unit price", () => {
    for (const l of EXAMPLE.lines) expect(cents(l.quantity * l.unitPrice)).toBe(cents(l.total));
    for (const l of EXAMPLE.supplierLines) expect(cents(l.quantity * l.unitPrice)).toBe(cents(l.total));
    expect(cents(lineTotal(EXAMPLE.deck.length, EXAMPLE.deck.width))).toBe(cents(EXAMPLE.deck.area));
  });

  it("each labour edit step carries its own correct totals", () => {
    const [deck] = EXAMPLE.lines;
    const expected = {
      draft: { line: 1560, subtotal: 4200, gst: 630, total: 4830 },
      hours: { line: 1440, subtotal: 4080, gst: 612, total: 4692 },
      rate: { line: 1560, subtotal: 4200, gst: 630, total: 4830 },
    } as const;
    for (const step of LABOUR_EDIT_STEPS) {
      const totals = quoteTotals([deck, step]);
      expect(lineTotal(step.quantity, step.unitPrice)).toBe(expected[step.step].line);
      expect(totals).toEqual({ subtotal: expected[step.step].subtotal, gst: expected[step.step].gst, total: expected[step.step].total });
    }
    // Draft and reviewed quotes agree, so every total the videos show is $4,830.00.
    expect(quoteTotals([deck, LABOUR_EDIT_STEPS[0]]).total).toBe(EXAMPLE.total);
    expect(quoteTotals(EXAMPLE.lines).total).toBe(EXAMPLE.total);
  });

  it.each(CHECK_CUTS)("%s: the labour line reads qty × rate = total on every frame of Check every line", (_cut, pace, frames) => {
    let lastStep = -1;
    for (let f = 0; f < frames; f++) {
      const state = labourLineAt(f / frames, pace);
      expect(cents(state.quantity * state.unitPrice), `frame ${f}`).toBe(cents(state.total));
      if (state.editing) {
        const shown = state.editing.field === "qty" ? state.quantity : state.unitPrice;
        expect(state.editing.text, `frame ${f}`).toBe(fieldText(shown));
      }
      const index = LABOUR_EDIT_STEPS.findIndex((s) => s.step === state.step);
      expect(index, `frame ${f}`).toBeGreaterThanOrEqual(lastStep);
      lastStep = index;
    }
    const first = labourLineAt(0, pace);
    const last = labourLineAt((frames - 1) / frames, pace);
    expect([first.step, first.total]).toEqual(["draft", 1560]);
    expect([last.step, last.quantity, last.unitPrice, last.total]).toEqual(["rate", 24, 65, 1560]);
    // Each edit is on screen long enough to read (at least 4 frames per step).
    for (const step of LABOUR_EDIT_STEPS) {
      let count = 0;
      for (let f = 0; f < frames; f++) if (labourLineAt(f / frames, pace).step === step.step) count++;
      expect(count, step.step).toBeGreaterThanOrEqual(4);
    }
    expect(checkBeats(pace).priceSel[1]).toBeGreaterThan(checkBeats(pace).qtySel[1]);
  });
});

describe("count-ups settle before any cut", () => {
  const DRAFT_CUTS: Array<[string, Pace, number]> = [
    ["demo", "full", chapterFrames(DEMO_TIMELINE, "draft")],
    ["tour", "full", chapterFrames(TOUR_TIMELINE, "draft")],
    ["social", "fast", chapterFrames(SOCIAL_TIMELINE, "draft")],
  ];

  it.each(DRAFT_CUTS)("%s: totals land and hold at least 1.5 s before the chapter ends", (_cut, pace, frames) => {
    const { count } = draftBeats(pace);
    const heldFrames = frames - Math.ceil(count[1] * frames);
    expect(heldFrames / VIDEO_FPS).toBeGreaterThanOrEqual(1.5);
  });

  it("hero loop: the total holds 1.5 s+ and the loop ends on a static hold", () => {
    expect((HERO_BEATS.back[0] - HERO_BEATS.count[1]) / VIDEO_FPS).toBeGreaterThanOrEqual(1.5);
    expect(HERO_BEATS.back[1]).toBeLessThan(HERO_LOOP_FRAMES);
    expect(HERO_BEATS.tap[0]).toBeGreaterThan(0);
  });
});
