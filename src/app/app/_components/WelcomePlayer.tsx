"use client";
import { useCallback, useEffect, useRef } from "react";
import { Player, type PlayerRef, type CallbackListener } from "@remotion/player";
import { WelcomeScene, WELCOME_FPS, WELCOME_FRAMES } from "@/remotion/WelcomeScene";
import { createWelcomePlayback } from "@/lib/welcome-playback";
import { WelcomePoster } from "./WelcomePoster";

export default function WelcomePlayer({ onComplete, onProgress }: {
  onComplete: () => void;
  onProgress: (progress: number) => void;
}) {
  const player = useRef<PlayerRef | null>(null);
  const playback = useRef<ReturnType<typeof createWelcomePlayback> | null>(null);
  const canvasReady = useRef(false);
  const ready = useCallback(() => {
    canvasReady.current = true;
    if (player.current) playback.current?.ready(document.hidden);
  }, []);
  const ended = useCallback(() => { playback.current?.finish(); onComplete(); }, [onComplete]);
  const frameUpdated = useCallback<CallbackListener<"frameupdate">>((event) => {
    onProgress(event.detail.frame / (WELCOME_FRAMES - 1));
  }, [onProgress]);
  // Remotion may replace its imperative handle while playing. Keep one
  // controller per mount; replacing a ref must never pause/reset the intro.
  const attachPlayer = useCallback((current: PlayerRef | null) => {
    player.current?.removeEventListener("ended", ended);
    player.current?.removeEventListener("frameupdate", frameUpdated);
    player.current = current;
    current?.addEventListener("ended", ended);
    current?.addEventListener("frameupdate", frameUpdated);
    if (current && canvasReady.current) playback.current?.ready(document.hidden);
  }, [ended, frameUpdated]);
  useEffect(() => {
    const controller = createWelcomePlayback({
      play: () => player.current?.play(),
      pause: () => player.current?.pause(),
      seekTo: (frame) => player.current?.seekTo(frame),
    });
    playback.current = controller;
    if (canvasReady.current && player.current) controller.ready(document.hidden);
    const visibility = () => controller.visibility(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      controller.dispose();
      playback.current = null;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return <Player ref={attachPlayer} component={WelcomeScene} inputProps={{ onReady: ready }}
    durationInFrames={WELCOME_FRAMES} fps={WELCOME_FPS}
    compositionWidth={720} compositionHeight={520} style={{ width: "100%", aspectRatio: "720 / 520" }}
    autoPlay={false} initiallyMuted numberOfSharedAudioTags={0} moveToBeginningWhenEnded={false} controls={false} clickToPlay={false} doubleClickToFullscreen={false}
    spaceKeyToPlayOrPause={false} showVolumeControls={false} acknowledgeRemotionLicense
    errorFallback={() => <WelcomePoster />} />;
}
