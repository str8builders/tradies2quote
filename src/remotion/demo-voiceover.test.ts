import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEMO_TIMELINE, VIDEO_FPS } from "./demo-script";
import { MIN_CHAPTER_SECONDS, NARRATION, VOICE, VOICE_PACING } from "./demo-voiceover";
import { VOICEOVER_TIMING } from "./demo-voiceover-timing";

/** Same recipe as scriptHash() in scripts/make-demo-voiceover.mjs. */
function scriptHash() {
  const h = createHash("sha256");
  h.update(JSON.stringify({ VOICE, VOICE_PACING, MIN_CHAPTER_SECONDS, say: NARRATION.map((c) => [c.id, c.lines.map((l) => l.say)]) }));
  return h.digest("hex").slice(0, 16);
}

describe("the demo's voiceover", () => {
  it("was generated from the current script (re-run scripts/make-demo-voiceover.mjs after any edit)", () => {
    expect(VOICEOVER_TIMING.scriptHash).toBe(scriptHash());
  });

  it("only uses a voice that may be used commercially", () => {
    // Kokoro-82M is Apache-2.0. OmniVoice and F5-TTS weights are non-commercial.
    expect(VOICE.engine).toBe("kokoro");
  });

  it("drives the demo timeline: every chapter lasts as long as its narration", () => {
    expect(DEMO_TIMELINE.chapters.map((c) => c.id)).toEqual(NARRATION.map((c) => c.id));
    for (const chapter of DEMO_TIMELINE.chapters) {
      const timing = VOICEOVER_TIMING.chapters.find((c) => c.id === chapter.id)!;
      expect(chapter.durationInFrames).toBe(Math.round(timing.seconds * VIDEO_FPS));
      const lastLineEnds = timing.lines[timing.lines.length - 1][1];
      expect(timing.seconds).toBeGreaterThanOrEqual(lastLineEnds);
    }
    expect(DEMO_TIMELINE.durationInFrames / VIDEO_FPS).toBeCloseTo(VOICEOVER_TIMING.totalSeconds, 1);
  });

  it("captions show exactly what is said, one line at a time, in order", () => {
    const captions = DEMO_TIMELINE.captions;
    expect(captions.map((c) => c.text)).toEqual(NARRATION.flatMap((c) => c.lines.map((l) => l.show)));
    for (let i = 1; i < captions.length; i++) expect(captions[i].from).toBeGreaterThanOrEqual(captions[i - 1].to);
    for (const c of captions) expect(c.to).toBeGreaterThan(c.from);
  });

  it("speaks the same words it shows (only numbers and the brand are spelled out)", () => {
    const normalise = (s: string) =>
      s
        .replace(/Tradies ?2 ?Quote/g, "Tradies2Quote")
        .replace("15%", "fifteen percent")
        .replace("7 days", "seven days")
        .replace("G S T", "GST");
    for (const chapter of NARRATION) for (const line of chapter.lines) expect(normalise(line.say)).toBe(normalise(line.show));
  });
});
