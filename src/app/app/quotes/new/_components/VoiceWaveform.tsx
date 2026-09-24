"use client";
import dynamic from "next/dynamic";
import { useMotionPaused } from "@/app/_components/LiveWallpaper";
import { WaveformLines, type VoiceWaveformState } from "@/remotion/VoiceWaveformScene";

// Wave 46 perf — @remotion/player is a heavy dependency that was previously
// statically imported here, shipping on every /app/quotes/new load even
// before the mic is touched. Loaded on the client only, with the same
// lightweight <WaveformLines> SVG used for the paused/error states below as
// the loading fallback, so the waveform's footprint doesn't shift.
const VoiceWaveformPlayer = dynamic(() => import("./VoiceWaveformPlayer"), {
  ssr: false,
  loading: () => <WaveformLines />,
});

export function VoiceWaveform({ state, audioLevel = null }: { state: VoiceWaveformState; audioLevel?: number | null }) {
  const paused = useMotionPaused();
  const measured = state === "recording" && audioLevel !== null;
  return <span className="t2q-job-waveform" aria-hidden="true" data-state={state} data-live-level={measured}>
    {measured ? <WaveformLines state={state} audioLevel={audioLevel} /> : paused || state === "error" ? <WaveformLines state={state} /> : <VoiceWaveformPlayer state={state} />}
  </span>;
}
