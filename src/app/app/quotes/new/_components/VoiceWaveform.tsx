"use client";
import { useEffect, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { useMotionPaused } from "@/app/_components/LiveWallpaper";
import { VoiceWaveformScene, WaveformLines, WAVEFORM_FPS, WAVEFORM_FRAMES, type VoiceWaveformState } from "@/remotion/VoiceWaveformScene";

export function VoiceWaveform({ state }: { state: VoiceWaveformState }) {
  const paused = useMotionPaused();
  const player = useRef<PlayerRef>(null);
  useEffect(() => {
    if (paused || state === "error") player.current?.pause();
    else player.current?.play();
  }, [paused, state]);
  return <span className="t2q-job-waveform" aria-hidden="true" data-state={state}>
    {paused || state === "error" ? <WaveformLines state={state} /> : <Player ref={player}
      component={VoiceWaveformScene} inputProps={{ state }} durationInFrames={WAVEFORM_FRAMES} fps={WAVEFORM_FPS}
      compositionWidth={720} compositionHeight={180} style={{ width: "100%", aspectRatio: "4 / 1" }}
      autoPlay loop initiallyMuted numberOfSharedAudioTags={0} controls={false} clickToPlay={false} doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false} showVolumeControls={false} acknowledgeRemotionLicense
      errorFallback={() => <WaveformLines state={state} />} />}
  </span>;
}
