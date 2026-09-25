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
    if (shared.state === "suspended") void shared.resume().catch(() => {});
  } catch {
    shared = null;
  }
}

/** If the audio hasn't started by then, say so (null) rather than sit silent. */
export const METER_START_TIMEOUT_MS = 1500;

export function startMicrophoneMeter(stream: MediaStream, onLevel: (level: number | null) => void): () => void {
  let context: AudioContext | undefined;
  let owned = false;
  let source: MediaStreamAudioSourceNode | undefined;
  let analyser: AnalyserNode | undefined;
  let frame = 0;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (startTimer !== undefined) clearTimeout(startTimer);
    cancelAnimationFrame(frame);
    source?.disconnect();
    analyser?.disconnect();
    // The primed context is kept for the next recording; only our own closes.
    if (owned) void context?.close().catch(() => {});
  };
  try {
    const AudioContextClass = audioContextClass();
    if (!AudioContextClass) return stop;
    if (shared && shared.state !== "closed") {
      context = shared;
    } else {
      context = new AudioContextClass();
      owned = true;
    }
    analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let lastFrame = -Infinity;
    let level = 0;
    const tick = (time: number) => {
      if (stopped) return;
      if (time - lastFrame >= 32) {
        lastFrame = time;
        analyser!.getFloatTimeDomainData(samples);
        const next = microphoneLevel(samples);
        level += (next - level) * (next > level ? 0.65 : 0.25);
        onLevel(level);
      }
      frame = requestAnimationFrame(tick);
    };
    startTimer = setTimeout(() => {
      startTimer = undefined;
      if (!stopped) onLevel(null);
    }, METER_START_TIMEOUT_MS);
    void context.resume().then(() => {
      if (startTimer !== undefined) clearTimeout(startTimer);
      startTimer = undefined;
      if (!stopped) frame = requestAnimationFrame(tick);
    }).catch(() => {
      if (!stopped) { onLevel(null); stop(); }
    });
  } catch {
    stop();
    onLevel(null);
  }
  return stop;
}
