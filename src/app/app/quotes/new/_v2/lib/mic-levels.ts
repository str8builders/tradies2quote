/**
 * Level bars for the talk screen. The microphone's loudness (RMS of the
 * analyser's samples, from `microphoneLevel` in @/lib/microphone-level)
 * arrives about 30 times a second as a 0–1 level. The newest level sits in
 * the middle two bars and older ones move outwards, so the bars ripple out
 * from the centre as you speak and lie flat in silence. Values are
 * vertical scales for CSS `transform: scaleY()`, so drawing them moves
 * nothing but transforms.
 *
 * Pure: no DOM, no timers.
 */

export const BAR_COUNT = 24;

/** A silent bar is a short rounded dash, never zero height. */
export const MIN_BAR = 0.12;

/** How many recent levels are shown (each appears twice, mirrored). */
export const HISTORY_SIZE = Math.ceil(BAR_COUNT / 2);

/** The outermost bars reach this share of the middle ones. */
const EDGE_TAPER = 0.6;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** A level as a number from 0 to 1 (anything else, NaN or missing is silence). */
export function clampLevel(level: number | null | undefined): number {
  if (typeof level !== "number" || !Number.isFinite(level)) return 0;
  return Math.min(1, Math.max(0, level));
}

/** Newest first, keeping the last `size` levels. */
export function pushLevel(
  history: readonly number[],
  level: number | null | undefined,
  size: number = HISTORY_SIZE,
): number[] {
  return [clampLevel(level), ...history].slice(0, Math.max(0, size));
}

/** Bar scales from recent levels, mirrored around the middle. */
export function barScales(history: readonly number[], count: number = BAR_COUNT): number[] {
  const bars = Array.from({ length: Math.max(0, count) }, () => MIN_BAR);
  const half = Math.ceil(bars.length / 2);
  for (let i = 0; i < half; i++) {
    const taper = half > 1 ? 1 - ((1 - EDGE_TAPER) * i) / (half - 1) : 1;
    const scale = round3(MIN_BAR + (1 - MIN_BAR) * clampLevel(history[i]) * taper);
    bars[half - 1 - i] = scale;
    bars[bars.length - half + i] = scale;
  }
  return bars;
}

/** Flat: not recording, or paused. */
export const SILENT_BARS: readonly number[] = barScales([]);

/**
 * A still, calm shape shown while recording when the bars can't move: the
 * phone asks for reduced motion, the page is hidden, or the level meter
 * couldn't start. Deterministic, so the server and the phone draw the same.
 */
export const RESTING_BARS: readonly number[] = Array.from({ length: BAR_COUNT }, (_, i) =>
  round3(0.3 + 0.45 * Math.abs(Math.sin((i - (BAR_COUNT - 1) / 2) * 0.55))),
);

export type BarMode = "live" | "wave" | "resting" | "silent";

/**
 * Which bars to draw:
 *   - live: recording, moving with the real voice. Also with Reduce Motion:
 *     the bars are how you know you're being heard (feedback, not
 *     decoration). Only their idle wobble stops for Reduce Motion.
 *   - wave: a steady wave. Before recording (the mic is ready), unless
 *     Reduce Motion is on; and while recording whenever the phone gives no
 *     sound level (the meter can't start, or only hears silence), whatever
 *     the setting, so recording never looks frozen.
 *   - resting: a still shape while recording on a hidden page.
 *   - silent: flat, for paused, writing it down, done or an error.
 */
export function barMode({
  listening,
  inviting = false,
  meterFailed = false,
  reducedMotion,
  pageVisible,
  hasStream,
}: {
  listening: boolean;
  /** Not recording yet: idle or getting the mic ready. */
  inviting?: boolean;
  /** Recording, but no sound level came through. */
  meterFailed?: boolean;
  reducedMotion: boolean;
  pageVisible: boolean;
  hasStream: boolean;
}): BarMode {
  if (listening) {
    if (!pageVisible) return "resting";
    return hasStream && !meterFailed ? "live" : "wave";
  }
  return inviting && !reducedMotion && pageVisible ? "wave" : "silent";
}

/** Wave timing per bar (s): a steady spread so it ripples instead of pulsing together. */
export function waveTiming(i: number): { duration: number; delay: number } {
  return {
    duration: round3(0.7 + ((i * 37) % 60) / 100),
    delay: -round3(((i * 53) % 90) / 100),
  };
}

/** The wave at a moment (ms): each bar swings between 0.18 and 1 on its own timing. */
export function waveScales(timeMs: number, count: number = BAR_COUNT, low = 0.18): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const { duration, delay } = waveTiming(i);
    const phase = ((timeMs / 1000 - delay) / duration) * Math.PI;
    return round3(low + (1 - low) * Math.abs(Math.sin(phase)));
  });
}

/**
 * A small, slow ripple under the live bars so they read as "listening" in a
 * quiet room; the voice lifts them well above it. Off for Reduce Motion.
 */
export function idleRipple(timeMs: number, count: number = BAR_COUNT): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    round3(MIN_BAR + 0.1 * (0.5 + 0.5 * Math.sin(timeMs / 420 + i * 0.7))),
  );
}

/** Each bar the taller of the voice and the ripple. */
export function withRipple(voice: readonly number[], ripple: readonly number[]): number[] {
  return voice.map((v, i) => Math.max(v, ripple[i] ?? MIN_BAR));
}
