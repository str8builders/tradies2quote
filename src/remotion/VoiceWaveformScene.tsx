"use client";
import { useCurrentFrame } from "remotion";
export type VoiceWaveformState = "idle" | "recording" | "processing" | "error";
export const WAVEFORM_FRAMES = 120;
export const WAVEFORM_FPS = 30;

/** Decorative recording-state motion, not a measurement of microphone volume. */
export function WaveformLines({ frame = 0, state = "idle" }: { frame?: number; state?: VoiceWaveformState }) {
  const phase = frame / WAVEFORM_FRAMES * Math.PI * 2;
  return <svg viewBox="0 0 720 180" width="100%" height="100%" fill="none" aria-hidden="true" focusable="false">
    {Array.from({ length: 37 }, (_, i) => {
      const marker = i % 8 === 0;
      const base = marker ? 17 : 55 + (i * 37 % 75);
      const wave = Math.sin(phase * (state === "recording" ? 3 : 1) + i * 0.8);
      const amplitude = state === "recording" ? 0.3 : state === "processing" ? 0.5 : 0.08;
      const height = state === "error" ? base * 0.55 : base * (1 + amplitude * wave);
      return <line key={i} x1={36 + i * 18} x2={36 + i * 18} y1={90 - height / 2} y2={90 + height / 2}
        stroke={marker ? "#ffe500" : "#ff651b"} strokeWidth={8} strokeLinecap="round" opacity={state === "error" ? 0.55 : 1} />;
    })}
  </svg>;
}
export function VoiceWaveformScene({ state }: { state: VoiceWaveformState }) {
  return <WaveformLines frame={useCurrentFrame()} state={state} />;
}
