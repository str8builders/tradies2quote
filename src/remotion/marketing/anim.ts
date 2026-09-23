/** Small, deterministic animation helpers shared by the marketing scenes. */
import { Easing } from "remotion";

export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** Linear 0..1 progress of `t` between `a` and `b`, clamped. */
export function seg(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

/** Eased 0..1 progress of `t` between `a` and `b`. */
export function eseg(t: number, a: number, b: number, easing: (x: number) => number = easeOut): number {
  return easing(seg(t, a, b));
}

export function mix(from: number, to: number, p: number): number {
  return from + (to - from) * p;
}

/** Number of words of `text` revealed at progress `p` (0..1). */
export function wordsShown(text: string, p: number): number {
  const total = text.split(/\s+/).filter(Boolean).length;
  return Math.min(total, Math.floor(p * total + 1e-6));
}

/** Timer text for a recording, e.g. 41 -> "00:41". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Deterministic pseudo-random in [0, 1) for decoration (never Math.random). */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
