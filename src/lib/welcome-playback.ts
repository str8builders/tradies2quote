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

/**
 * Minimum time the entry tape takes to fill on a first visit. The intro video
 * is only 4.2 s and used to close 350 ms after its last frame, which read as
 * a flash; the tape now follows the slower of the video and this clock.
 */
export const MIN_ENTRY_MS = 6500;

/** What the tape shows: never ahead of the video, never faster than the clock; once the intro ends, the clock alone. */
export function entryTapeProgress({ video, clock, introDone, reduce }: { video: number; clock: number; introDone: boolean; reduce: boolean }) {
  const v = Math.max(0, Math.min(1, video)), c = Math.max(0, Math.min(1, clock));
  if (reduce) return v;
  return introDone ? c : Math.min(v, c);
}

/** Entry is complete only when the intro has finished AND the minimum time has passed (reduced motion skips the wait). */
export function entryComplete({ introDone, clock, reduce }: { introDone: boolean; clock: number; reduce: boolean }) {
  return introDone && (reduce || clock >= 1);
}
