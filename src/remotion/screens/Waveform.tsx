/**
 * The record control's waveform, drawn like the app's `WaveformLines`
 * (`src/remotion/VoiceWaveformScene.tsx`): 37 round-capped bars in a 720×180
 * box, every eighth a hi-vis marker, the rest orange. In the app a live mic
 * level drives the bars; here a deterministic speech-like envelope does.
 */
import { hash01 } from "../marketing/anim";

const BARS = 37;
/** Idle motion repeats every 90 frames so a 270-frame loop closes cleanly. */
const IDLE_PERIOD = 90;

export function Waveform({
  frame,
  speaking,
  idleMotion = 1,
}: {
  frame: number;
  /** 0 = idle shimmer, 1 = full speech. */
  speaking: number;
  /** Scales the idle shimmer; 0 freezes the bars (static loop holds). */
  idleMotion?: number;
}) {
  const phase = (frame / IDLE_PERIOD) * Math.PI * 2;
  return (
    <svg viewBox="0 0 720 180" width="100%" height="100%" fill="none" aria-hidden>
      {Array.from({ length: BARS }, (_, i) => {
        const marker = i % 8 === 0;
        const base = marker ? 17 : 55 + ((i * 37) % 75);
        const idle = base * (1 + 0.08 * idleMotion * Math.sin(phase + i * 0.8));
        // Speech: syllable-rate envelope plus per-bar jitter that changes every 3 frames.
        const step = Math.floor(frame / 3);
        const syllable = 0.45 + 0.55 * Math.abs(Math.sin(frame * 0.21 + Math.sin(frame * 0.05) * 2));
        const jitter = 0.35 + 0.65 * hash01(step * 41 + i * 7);
        const speech = marker ? base * (1 + 0.5 * syllable) : 10 + base * 1.35 * syllable * jitter;
        const height = Math.min(170, idle + (speech - idle) * speaking);
        return (
          <line
            key={i}
            x1={36 + i * 18}
            x2={36 + i * 18}
            y1={90 - height / 2}
            y2={90 + height / 2}
            stroke={marker ? "#ffe500" : "#ff651b"}
            strokeWidth={8}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
