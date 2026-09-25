"use client";

import { useCallback, useEffect, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { createWelcomePlayback } from "@/lib/welcome-playback";
import {
  NEW_WELCOME_FPS,
  NEW_WELCOME_FRAMES,
  NEW_WELCOME_HEIGHT,
  NEW_WELCOME_WIDTH,
  NewWelcomeScene,
  type NewWelcomeProps,
} from "@/remotion/NewWelcomeScene";

/**
 * Plays the new welcome once, full screen (letterboxed on the page colour),
 * no controls, muted. It starts when the scene is on screen (never while a
 * slow download eats the time), pauses while the app is in the background,
 * and says when it has ended.
 */
export default function NewWelcomePlayer({ onEnded, ...scene }: NewWelcomeProps & { onEnded: () => void }) {
  const player = useRef<PlayerRef | null>(null);
  const playback = useRef<ReturnType<typeof createWelcomePlayback> | null>(null);
  const sceneReady = useRef(false);

  const ready = useCallback(() => {
    sceneReady.current = true;
    if (player.current) playback.current?.ready(document.hidden);
  }, []);
  const ended = useCallback(() => {
    playback.current?.finish();
    onEnded();
  }, [onEnded]);

  const attach = useCallback(
    (current: PlayerRef | null) => {
      player.current?.removeEventListener("ended", ended);
      player.current = current;
      current?.addEventListener("ended", ended);
      if (current && sceneReady.current) playback.current?.ready(document.hidden);
    },
    [ended],
  );

  useEffect(() => {
    const controller = createWelcomePlayback({
      play: () => player.current?.play(),
      pause: () => player.current?.pause(),
      seekTo: (frame) => player.current?.seekTo(frame),
    });
    playback.current = controller;
    if (sceneReady.current && player.current) controller.ready(document.hidden);
    const visibility = () => controller.visibility(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      controller.dispose();
      playback.current = null;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return (
    <Player
      ref={attach}
      component={NewWelcomeScene}
      inputProps={{ ...scene, onReady: ready }}
      durationInFrames={NEW_WELCOME_FRAMES}
      fps={NEW_WELCOME_FPS}
      compositionWidth={NEW_WELCOME_WIDTH}
      compositionHeight={NEW_WELCOME_HEIGHT}
      style={{ width: "100%", height: "100%" }}
      autoPlay={false}
      initiallyMuted
      numberOfSharedAudioTags={0}
      moveToBeginningWhenEnded={false}
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      showVolumeControls={false}
      acknowledgeRemotionLicense
    />
  );
}
