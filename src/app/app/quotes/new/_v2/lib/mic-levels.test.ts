import { describe, expect, it } from "vitest";
import { microphoneLevel } from "@/lib/microphone-level";
import {
  BAR_COUNT,
  HISTORY_SIZE,
  MIN_BAR,
  RESTING_BARS,
  SILENT_BARS,
  barMode,
  barScales,
  waveTiming,
  clampLevel,
  pushLevel,
} from "./mic-levels";

/** One analyser frame: a sine wave at this peak amplitude. */
function frame(amplitude: number, size = 512): Float32Array {
  return Float32Array.from({ length: size }, (_, i) => amplitude * Math.sin((2 * Math.PI * i) / 32));
}

/** Feed frames through the real RMS level, the way the meter does, and draw the bars. */
function barsFor(amplitudes: number[]): number[] {
  let history: number[] = [];
  for (const amplitude of amplitudes) history = pushLevel(history, microphoneLevel(frame(amplitude)));
  return barScales(history);
}

describe("microphone level → bar heights", () => {
  it("lies flat in silence and for background hiss", () => {
    expect(barsFor([0, 0, 0])).toEqual(SILENT_BARS);
    expect(barsFor([0.005, 0.004])).toEqual(SILENT_BARS);
    expect(SILENT_BARS).toHaveLength(BAR_COUNT);
    expect(SILENT_BARS.every((bar) => bar === MIN_BAR)).toBe(true);
  });

  it("grows with a louder voice, and never past full height", () => {
    const quiet = barsFor([0.03]);
    const loud = barsFor([0.3]);
    const shouting = barsFor([5]);
    const middle = BAR_COUNT / 2;
    expect(quiet[middle]).toBeGreaterThan(MIN_BAR);
    expect(loud[middle]).toBeGreaterThan(quiet[middle]);
    expect(shouting[middle]).toBe(1);
    for (const bars of [quiet, loud, shouting]) {
      expect(Math.min(...bars)).toBeGreaterThanOrEqual(MIN_BAR);
      expect(Math.max(...bars)).toBeLessThanOrEqual(1);
    }
  });

  it("puts the newest sound in the middle and moves older sound outwards, mirrored", () => {
    const bars = barsFor([0.4, 0, 0]);
    const middle = BAR_COUNT / 2;
    // The loud frame is now two steps old: two bars out from the middle on both sides.
    expect(bars[middle - 1 - 2]).toBeGreaterThan(MIN_BAR);
    expect(bars[middle + 2]).toBe(bars[middle - 1 - 2]);
    expect(bars[middle - 1]).toBe(MIN_BAR);
    expect(bars[middle]).toBe(MIN_BAR);
    for (let i = 0; i < middle; i++) expect(bars[i]).toBe(bars[BAR_COUNT - 1 - i]);
  });

  it("tapers towards the edges so a steady voice looks like a voice", () => {
    let history: number[] = [];
    for (let i = 0; i < HISTORY_SIZE; i++) history = pushLevel(history, 1);
    const bars = barScales(history);
    expect(bars[BAR_COUNT / 2]).toBe(1);
    expect(bars[0]).toBeCloseTo(MIN_BAR + (1 - MIN_BAR) * 0.6, 3);
    expect(bars[0]).toBeLessThan(bars[BAR_COUNT / 2]);
  });
});

describe("level history", () => {
  it("clamps anything that isn't a 0–1 level", () => {
    expect(clampLevel(0.5)).toBe(0.5);
    expect(clampLevel(-1)).toBe(0);
    expect(clampLevel(7)).toBe(1);
    expect(clampLevel(Number.NaN)).toBe(0);
    expect(clampLevel(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampLevel(null)).toBe(0);
    expect(clampLevel(undefined)).toBe(0);
  });

  it("keeps the newest levels first, only as many as there are bars to show", () => {
    let history: number[] = [];
    for (let i = 1; i <= HISTORY_SIZE + 5; i++) history = pushLevel(history, i / 100);
    expect(history).toHaveLength(HISTORY_SIZE);
    expect(history[0]).toBe((HISTORY_SIZE + 5) / 100);
    expect(pushLevel([0.2], 3, 2)).toEqual([1, 0.2]);
    expect(pushLevel([0.2], 0.5, 0)).toEqual([]);
  });

  it("handles odd bar counts and no bars", () => {
    expect(barScales([1], 5)).toEqual([MIN_BAR, MIN_BAR, 1, MIN_BAR, MIN_BAR]);
    expect(barScales([1], 1)).toEqual([1]);
    expect(barScales([1], 0)).toEqual([]);
  });
});

describe("which bars to draw", () => {
  const base = { listening: true, reducedMotion: false, pageVisible: true, hasStream: true };

  it("moves with the voice only while listening on a visible page, motion allowed", () => {
    expect(barMode(base)).toBe("live");
  });

  it("waves while recording when no sound level comes through (never frozen)", () => {
    expect(barMode({ ...base, hasStream: false })).toBe("wave");
    expect(barMode({ ...base, meterFailed: true })).toBe("wave");
  });

  it("waves before recording to show the mic is ready, unless motion is reduced", () => {
    expect(barMode({ ...base, listening: false, inviting: true })).toBe("wave");
    expect(barMode({ ...base, listening: false, inviting: true, reducedMotion: true })).toBe("silent");
    expect(barMode({ ...base, listening: false, inviting: true, pageVisible: false })).toBe("silent");
  });

  it("wave timings spread out and stay in range", () => {
    const timings = Array.from({ length: BAR_COUNT }, (_, i) => waveTiming(i));
    for (const t of timings) {
      expect(t.duration).toBeGreaterThanOrEqual(0.7);
      expect(t.duration).toBeLessThan(1.3);
      expect(t.delay).toBeLessThanOrEqual(0);
      expect(t.delay).toBeGreaterThan(-0.9);
    }
    expect(new Set(timings.map((t) => t.duration)).size).toBeGreaterThan(5);
  });

  it("holds a still shape for reduced motion or a hidden page", () => {
    expect(barMode({ ...base, reducedMotion: true })).toBe("resting");
    expect(barMode({ ...base, pageVisible: false })).toBe("resting");
    expect(barMode({ ...base, reducedMotion: true, meterFailed: true })).toBe("resting");
    expect(RESTING_BARS).toHaveLength(BAR_COUNT);
    expect(new Set(RESTING_BARS).size).toBeGreaterThan(3);
    for (let i = 0; i < BAR_COUNT / 2; i++) expect(RESTING_BARS[i]).toBe(RESTING_BARS[BAR_COUNT - 1 - i]);
  });

  it("lies flat when not listening (idle, paused, stopped)", () => {
    expect(barMode({ ...base, listening: false })).toBe("silent");
    expect(barMode({ ...base, listening: false, reducedMotion: true })).toBe("silent");
  });
});
