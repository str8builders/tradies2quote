interface WelcomePlayerControls {
  play: () => void;
  pause: () => void;
  seekTo: (frame: number) => void;
}

/** A failed intro must never trap entry. Only count time in a visible tab. */
export function createWelcomeDeadline(onElapsed: () => void, durationMs: number) {
  let remaining = durationMs;
  let started: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const pause = () => {
    if (started !== null) remaining = Math.max(0, remaining - (Date.now() - started));
    started = null;
    clearTimeout(timer);
  };
  return {
    visibility(hidden: boolean) {
      if (disposed) return;
      if (hidden) { pause(); return; }
      if (started !== null) return;
      started = Date.now();
      timer = setTimeout(() => {
        disposed = true;
        onElapsed();
      }, remaining);
    },
    dispose() { pause(); disposed = true; },
  };
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
