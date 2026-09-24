"use client";
import { useEffect, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { VoiceWaveformScene, WaveformLines, WAVEFORM_FPS, WAVEFORM_FRAMES, type VoiceWaveformState } from "@/remotion/VoiceWaveformScene";

/**
 * The live remotion-driven waveform. Split out of VoiceWaveform.tsx and
 * loaded via `next/dynamic({ ssr: false })` (Wave 46 perf pass) so
 * `@remotion/player` — a heavy dependency — is never in the initial JS for
 * /app/quotes/new. VoiceWaveform.tsx renders the static `<WaveformLines>`
 * SVG (same markup used here for the paused/error states) as the fallback
 * while this chunk loads, so there's no layout shift.
 */
export default function VoiceWaveformPlayer({ state }: { state: VoiceWaveformState }) {
  const player = useRef<PlayerRef>(null);
  useEffect(() => {
    if (state === "error") player.current?.pause();
    else player.current?.play();
  }, [state]);
  return (
    <Player ref={player}
      component={VoiceWaveformScene} inputProps={{ state }} durationInFrames={WAVEFORM_FRAMES} fps={WAVEFORM_FPS}
      compositionWidth={720} compositionHeight={180} style={{ width: "100%", aspectRatio: "4 / 1" }}
      autoPlay loop initiallyMuted numberOfSharedAudioTags={0} controls={false} clickToPlay={false} doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false} showVolumeControls={false} acknowledgeRemotionLicense
      errorFallback={() => <WaveformLines state={state} />} />
  );
}
