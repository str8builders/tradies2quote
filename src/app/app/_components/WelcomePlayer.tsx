"use client";
import { useEffect, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { WelcomeScene, WELCOME_FPS, WELCOME_FRAMES } from "@/remotion/WelcomeScene";
export default function WelcomePlayer({ onComplete }: { onComplete: () => void }) {
  const player = useRef<PlayerRef>(null);
  useEffect(() => {
    const current = player.current;
    current?.addEventListener("ended", onComplete);
    return () => current?.removeEventListener("ended", onComplete);
  }, [onComplete]);
  return <Player ref={player} component={WelcomeScene} durationInFrames={WELCOME_FRAMES} fps={WELCOME_FPS}
    compositionWidth={720} compositionHeight={520} style={{ width: "100%", aspectRatio: "720 / 520" }}
    autoPlay controls={false} clickToPlay={false} doubleClickToFullscreen={false}
    spaceKeyToPlayOrPause={false} showVolumeControls={false} acknowledgeRemotionLicense
    errorFallback={() => <div className="grid h-full place-items-center text-7xl font-bold text-brand">T2Q</div>} />;
}
