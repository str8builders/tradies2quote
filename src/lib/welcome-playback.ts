interface WelcomePlayerControls {
  play: () => void;
  pause: () => void;
  seekTo: (frame: number) => void;
}

/** The intro clock starts at canvas readiness, never at page/chunk load. */
export function createWelcomePlayback(player: WelcomePlayerControls) {
  let ready = false;
  let finished = false;
  let disposed = false;
  return {
    ready(hidden: boolean) {
      if (ready || disposed) return;
      ready = true;
      player.seekTo(0);
      if (!hidden) player.play();
    },
    visibility(hidden: boolean) {
      if (!ready || finished || disposed) return;
      if (hidden) player.pause();
      else player.play();
    },
    finish() { finished = true; },
    dispose() { disposed = true; player.pause(); },
  };
}
