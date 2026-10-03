import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEMO_TIMELINE, SOCIAL_TIMELINE, TOUR_TIMELINE, VIDEO_FPS, type Timeline } from "./demo-script";
import { NARRATIONS, VOICE, VOICE_PACING, minChapterSeconds, type VoiceoverId } from "./demo-voiceover";
import { VOICEOVER_TIMINGS } from "./demo-voiceover-timing";

/** Same recipe as scriptHash() in scripts/make-demo-voiceover.mjs. */
function scriptHash(video: VoiceoverId) {
  const chapters = NARRATIONS[video];
  const h = createHash("sha256");
  h.update(
    JSON.stringify({
      VOICE,
      pacing: VOICE_PACING[video],
      min: chapters.map((c) => minChapterSeconds(video, c.id)),
      say: chapters.map((c) => [c.id, c.lines.map((l) => l.say)]),
    }),
  );
  return h.digest("hex").slice(0, 16);
}

const TIMELINES: Record<VoiceoverId, Timeline> = { demo: DEMO_TIMELINE, social: SOCIAL_TIMELINE, tour: TOUR_TIMELINE };

it("only uses a voice that may be used commercially", () => {
  // Kokoro-82M is Apache-2.0. OmniVoice and F5-TTS weights are non-commercial.
  expect(VOICE.engine).toBe("kokoro");
});

describe.each(["demo", "social", "tour"] as const)("the %s voiceover", (video) => {
  const narration = NARRATIONS[video];
  const timing = VOICEOVER_TIMINGS[video];
  const timeline = TIMELINES[video];

  it("was generated from the current script (re-run scripts/make-demo-voiceover.mjs after any edit)", () => {
    expect(timing.scriptHash).toBe(scriptHash(video));
  });

  it("drives the timeline: every chapter lasts as long as its narration", () => {
    expect(timeline.chapters.map((c) => c.id)).toEqual(narration.map((c) => c.id));
    for (const chapter of timeline.chapters) {
      const measured = timing.chapters.find((c) => c.id === chapter.id)!;
      expect(chapter.durationInFrames).toBe(Math.round(measured.seconds * VIDEO_FPS));
      expect(measured.seconds).toBeGreaterThanOrEqual(measured.lines[measured.lines.length - 1][1]);
    }
    expect(timeline.durationInFrames / VIDEO_FPS).toBeCloseTo(timing.totalSeconds, 1);
  });

  it("captions show exactly what is said, one line at a time, in order", () => {
    const captions = timeline.captions;
    expect(captions.map((c) => c.text)).toEqual(narration.flatMap((c) => c.lines.map((l) => l.show)));
    for (let i = 1; i < captions.length; i++) expect(captions[i].from).toBeGreaterThanOrEqual(captions[i - 1].to);
    for (const c of captions) expect(c.to).toBeGreaterThan(c.from);
  });

  it("speaks the same words it shows (only numbers, letters and the brand are spelled out)", () => {
    const normalise = (s: string) =>
      s
        .toLowerCase()
        .replace(/tradies ?2 ?quote( dot com)?/g, (_m, dotCom) => (dotCom ? "tradies2quote.com" : "tradies2quote"))
        .replace("15%", "fifteen percent")
        .replace("7 days", "seven days")
        .replace("g s t", "gst")
        .replace("q r", "qr")
        .replace(/[.,]+$/, "")
        .replace(/^at /, "");
    for (const chapter of narration) for (const line of chapter.lines) expect(normalise(line.say)).toBe(normalise(line.show));
  });
});
