import { describe, expect, it } from "vitest";
import {
  CORE_CHAPTERS,
  DEMO_CHAPTERS,
  DEMO_TIMELINE,
  DEMO_TRANSCRIPT,
  EXAMPLE,
  HERO_LOOP_FRAMES,
  SOCIAL_TIMELINE,
  TIMELINES,
  TOUR_TIMELINE,
  VIDEO_FPS,
  demoChapterAt,
  formatMoney,
  type Timeline,
} from "./demo-script";

const ALL: Array<[string, Timeline]> = Object.entries(TIMELINES);

describe("marketing video script data", () => {
  it.each(ALL)("%s: chapters are contiguous, ascending and fill the duration", (_name, timeline) => {
    let cursor = 0;
    for (const chapter of timeline.chapters) {
      expect(chapter.from).toBe(cursor);
      expect(chapter.durationInFrames).toBeGreaterThan(0);
      cursor += chapter.durationInFrames;
    }
    expect(cursor).toBe(timeline.durationInFrames);
    expect(new Set(timeline.chapters.map((c) => c.id)).size).toBe(timeline.chapters.length);
  });

  it.each(ALL)("%s: captions ascend, never overlap and sit inside their chapter", (_name, timeline) => {
    let previousEnd = 0;
    for (const caption of timeline.captions) {
      const chapter = timeline.chapters.find((c) => c.id === caption.chapter);
      expect(chapter, caption.text).toBeDefined();
      expect(caption.from).toBeGreaterThanOrEqual(previousEnd);
      expect(caption.to).toBeGreaterThan(caption.from);
      expect(caption.from).toBeGreaterThanOrEqual(chapter!.from);
      expect(caption.to).toBeLessThanOrEqual(chapter!.from + chapter!.durationInFrames);
      expect(caption.to).toBeLessThanOrEqual(timeline.durationInFrames);
      // Long enough to read: at least a second and a half (a word needs ~0.25 s).
      const seconds = (caption.to - caption.from) / VIDEO_FPS;
      expect(seconds).toBeGreaterThanOrEqual(1.5);
      expect(seconds).toBeGreaterThanOrEqual(caption.text.split(" ").length * 0.2);
      previousEnd = caption.to;
    }
  });

  it.each(ALL)("%s: each chapter's midpoint shows a fully faded-in caption", (_name, timeline) => {
    for (const chapter of timeline.chapters) {
      const mid = chapter.from + Math.floor(chapter.durationInFrames / 2);
      const caption = timeline.captions.find((c) => mid >= c.from && mid < c.to);
      expect(caption, `${chapter.id} @ ${mid}`).toBeDefined();
      expect(mid - caption!.from, chapter.id).toBeGreaterThanOrEqual(7);
      expect(caption!.to - mid, chapter.id).toBeGreaterThan(6);
    }
  });

  it.each(ALL)("%s: every chapter has captions", (_name, timeline) => {
    for (const chapter of timeline.chapters) {
      expect(timeline.captions.some((c) => c.chapter === chapter.id), chapter.id).toBe(true);
    }
  });

  it("keeps the briefed durations", () => {
    expect(DEMO_TIMELINE.durationInFrames / VIDEO_FPS).toBe(30);
    expect(SOCIAL_TIMELINE.durationInFrames / VIDEO_FPS).toBe(15);
    expect(TOUR_TIMELINE.durationInFrames / VIDEO_FPS).toBe(60);
    expect(HERO_LOOP_FRAMES / VIDEO_FPS).toBeGreaterThanOrEqual(8);
    expect(HERO_LOOP_FRAMES / VIDEO_FPS).toBeLessThanOrEqual(10);
    expect(DEMO_TIMELINE.chapters.map((c) => c.id)).toEqual([...CORE_CHAPTERS]);
  });

  it("opens the social cut with the hook and ends every share cut on the offer", () => {
    expect(SOCIAL_TIMELINE.captions[0]).toMatchObject({ chapter: "hook", from: 0, text: "Quote the job before you leave the site." });
    expect(SOCIAL_TIMELINE.captions[0].to).toBeLessThanOrEqual(2 * VIDEO_FPS + 6);
    expect(SOCIAL_TIMELINE.captions.at(-1)?.text).toBe("tradies2quote.com · 7 days free");
    expect(TOUR_TIMELINE.captions.at(-1)?.text).toContain("tradies2quote.com");
    expect(TOUR_TIMELINE.chapters.map((c) => c.id)).toEqual(expect.arrayContaining(["request", "calculator", ...CORE_CHAPTERS]));
  });

  it("exposes the website chapter list in order with matching start times", () => {
    expect(DEMO_CHAPTERS.map((c) => c.label)).toEqual(["Talk", "Draft", "Check", "Send", "Invoice"]);
    DEMO_CHAPTERS.forEach((chapter, i) => {
      expect(chapter.startSec).toBe(DEMO_TIMELINE.chapters[i].from / VIDEO_FPS);
      if (i > 0) expect(chapter.startSec).toBeGreaterThan(DEMO_CHAPTERS[i - 1].startSec);
    });
    expect(demoChapterAt(0)).toBe("talk");
    expect(demoChapterAt(6)).toBe("draft");
    expect(demoChapterAt(29.9)).toBe("invoice");
    expect(DEMO_TRANSCRIPT.every((c) => c.text.length > 0)).toBe(true);
  });

  it("uses one consistent example whose numbers add up", () => {
    const [decking, labour] = EXAMPLE.lines;
    expect(decking.quantity * decking.unitPrice).toBe(decking.total);
    expect(labour.quantity * labour.unitPrice).toBe(labour.total);
    // The AI draft's labour line comes to the same total, so no video shows another total.
    expect(EXAMPLE.draftLabour.quantity * EXAMPLE.draftLabour.unitPrice).toBe(labour.total);
    expect(decking.total + labour.total).toBe(EXAMPLE.subtotal);
    expect(EXAMPLE.materialsSubtotal + EXAMPLE.markup + EXAMPLE.labourSubtotal).toBe(EXAMPLE.subtotal);
    expect(Math.round(EXAMPLE.subtotal * EXAMPLE.gstRate) / 100).toBe(EXAMPLE.gst);
    expect(EXAMPLE.subtotal + EXAMPLE.gst).toBe(EXAMPLE.total);
    expect(EXAMPLE.supplierLines.reduce((sum, l) => sum + l.total, 0)).toBe(EXAMPLE.materialsSubtotal);
    for (const l of EXAMPLE.supplierLines) expect(l.quantity * l.unitPrice).toBe(l.total);
    expect(formatMoney(EXAMPLE.total)).toBe("$4,830.00");
    expect(formatMoney(EXAMPLE.gst)).toBe("$630.00");
    expect(EXAMPLE.clientEmail.endsWith("@example.com")).toBe(true);
    expect(EXAMPLE).toMatchObject({ business: "Your Business", client: "Sam Taylor", quoteNumber: "Q-2026-A41C", invoiceNumber: "INV-0042" });
  });
});
