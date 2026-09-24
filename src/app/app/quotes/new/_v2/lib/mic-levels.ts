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

export type BarMode = "live" | "resting" | "silent";

/** Which bars to draw: moving with the voice, a still shape, or flat. */
export function barMode({
  listening,
  reducedMotion,
  pageVisible,
  hasStream,
}: {
  listening: boolean;
  reducedMotion: boolean;
  pageVisible: boolean;
  hasStream: boolean;
}): BarMode {
  if (!listening) return "silent";
  return !reducedMotion && pageVisible && hasStream ? "live" : "resting";
}
