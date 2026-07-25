"use client";

import { Player, type PlayerRef } from "@remotion/player";
import {
  QuoteDemo,
  QUOTE_DEMO_DURATION,
  QUOTE_DEMO_FPS,
  QUOTE_DEMO_HEIGHT,
  QUOTE_DEMO_WIDTH,
} from "@/remotion/QuoteDemo";

/**
 * Thin wrapper around @remotion/player for the landing DemoReel.
 *
 * Exists for exactly one reason: DemoReel loads the player through
 * next/dynamic (to keep Remotion out of the landing route's initial
 * bundle), and next/dynamic does NOT forward refs — so `ref` on the
 * dynamic component silently never attaches and the play/pause-on-
 * scroll control goes dead. The PlayerRef is therefore passed down as
 * a regular prop (`playerRef`) and pinned to the real <Player> here.
 */
export default function DemoReelPlayer({
  playerRef,
  autoPlay,
  controls,
}: {
  playerRef: (ref: PlayerRef | null) => void;
  autoPlay: boolean;
  controls: boolean;
}) {
  return (
    <Player
      ref={playerRef}
      component={QuoteDemo}
      durationInFrames={QUOTE_DEMO_DURATION}
      fps={QUOTE_DEMO_FPS}
      compositionWidth={QUOTE_DEMO_WIDTH}
      compositionHeight={QUOTE_DEMO_HEIGHT}
      style={{ width: "100%", aspectRatio: "16 / 9" }}
      autoPlay={autoPlay}
      loop
      controls={controls}
      clickToPlay={false}
      acknowledgeRemotionLicense
    />
  );
}
