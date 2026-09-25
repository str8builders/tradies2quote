/** A local volume meter over the recorder's existing stream. No playback or upload. */
export function microphoneLevel(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let energy = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = Number.isFinite(samples[i]) ? samples[i] : 0;
    energy += value * value;
  }
  const rms = Math.sqrt(energy / samples.length);
  return Math.min(1, Math.sqrt(Math.max(0, rms - 0.006) * 6));
}

type AudioContextCtor = typeof AudioContext;

function audioContextClass(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
}

/**
 * One audio context for the meter, made and resumed inside a tap. iPhones
 * (Safari and the app's web view) only let audio start from a user gesture:
 * a context made later, from an effect, can stay "suspended" for good and
 * the bars never move. Call this first thing in the mic button's click
 * handler. Safe to call again; never throws.
 */
let shared: AudioContext | null = null;

export function primeMicrophoneMeter(): void {
  try {
    const AudioContextClass = audioContextClass();
    if (!AudioContextClass) return;
    if (!shared || shared.state === "closed") shared = new AudioContextClass();
    // "suspended", or WebKit's own "interrupted" (a call, Siri, another app's audio).
    if (shared.state !== "running") void shared.resume().catch(() => {});
  } catch {
    shared = null;
  }
}

/** Close the primed context (leaving the Talk screen; between tests). */
export function releasePrimedMeter(): void {
  const context = shared;
  shared = null;
  if (context && context.state !== "closed") void context.close().catch(() => {});
}

/** If the audio hasn't started by then, say so (null) rather than sit silent. */
export const METER_START_TIMEOUT_MS = 1500;

/**
 * About a second of frames (at ~32 ms each) of PURE digital silence (every
 * sample exactly 0) with nothing heard yet. A real microphone in a quiet
 * room still hisses; exact zeros mean the audio context isn't getting the
 * microphone (on iPhones: one made before recording started can go deaf).
 */
export const SILENT_FRAMES_LIMIT = 30;

/** Every sample exactly zero: the meter hears nothing at all, not quiet. */
export function isDigitalSilence(samples: ArrayLike<number>): boolean {
  for (let i = 0; i < samples.length; i++) if (samples[i] !== 0) return false;
  return true;
}

/**
 * The level of the recording's own stream, about 30 times a second (0–1),
 * or null when the meter can't work (no Web Audio, the audio never starts,
 * or it only ever hears digital silence, even on a fresh context). Never
 * stops or changes the stream.
 */
export function startMicrophoneMeter(stream: MediaStream, onLevel: (level: number | null) => void): () => void {
  let context: AudioContext | undefined;
  let owned = false;
  let source: MediaStreamAudioSourceNode | undefined;
  let analyser: AnalyserNode | undefined;
  let frame = 0;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let rebuilt = false;

  const detach = () => {
    if (startTimer !== undefined) clearTimeout(startTimer);
    startTimer = undefined;
    cancelAnimationFrame(frame);
    source?.disconnect();
    analyser?.disconnect();
    source = undefined;
    analyser = undefined;
    // The primed context is kept for the next recording; only our own closes.
    if (owned) void context?.close().catch(() => {});
    context = undefined;
    owned = false;
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    detach();
  };
  const fail = () => {
    if (stopped) return;
    onLevel(null);
    stop();
  };

  const attach = (fresh: boolean): void => {
    try {
      const AudioContextClass = audioContextClass();
      if (!AudioContextClass) return;
      if (!fresh && shared && shared.state !== "closed") {
        context = shared;
      } else {
        context = new AudioContextClass();
        owned = true;
      }
      const ctx = context;
      const node = ctx.createAnalyser();
      node.fftSize = 512;
      analyser = node;
      source = ctx.createMediaStreamSource(stream);
      source.connect(node);
      const samples = new Float32Array(node.fftSize);
      let lastFrame = -Infinity;
      let level = 0;
      let silentFrames = 0;
      let heard = false;
      const tick = (time: number) => {
        if (stopped || context !== ctx) return;
        if (time - lastFrame >= 32) {
          lastFrame = time;
          node.getFloatTimeDomainData(samples);
          if (!heard) {
            if (isDigitalSilence(samples)) silentFrames += 1;
            else heard = true;
            if (!heard && silentFrames >= SILENT_FRAMES_LIMIT) {
              // Deaf context. Once: drop it (and the primed one if it was
              // that) and listen again on a fresh one made from the live
              // stream; iOS lets audio start while it is recording.
              if (!rebuilt) {
                rebuilt = true;
                const wasShared = !owned;
                detach();
                if (wasShared && shared) {
                  void shared.close().catch(() => {});
                  shared = null;
                }
                attach(true);
              } else {
                fail();
              }
              return;
            }
          }
          const next = microphoneLevel(samples);
          level += (next - level) * (next > level ? 0.65 : 0.25);
          onLevel(level);
        }
        frame = requestAnimationFrame(tick);
      };
      startTimer = setTimeout(() => {
        startTimer = undefined;
        if (!stopped && context === ctx) onLevel(null);
      }, METER_START_TIMEOUT_MS);
      void ctx.resume().then(() => {
        if (stopped || context !== ctx) return;
        if (startTimer !== undefined) clearTimeout(startTimer);
        startTimer = undefined;
        frame = requestAnimationFrame(tick);
      }).catch(() => {
        if (context === ctx) fail();
      });
    } catch {
      fail();
    }
  };

  attach(false);
  return stop;
}
