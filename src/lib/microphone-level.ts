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

export function startMicrophoneMeter(stream: MediaStream, onLevel: (level: number | null) => void): () => void {
  let context: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let analyser: AnalyserNode | undefined;
  let frame = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    source?.disconnect();
    analyser?.disconnect();
    void context?.close().catch(() => {});
  };
  try {
    const AudioContextClass = window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return stop;
    context = new AudioContextClass();
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
    void context.resume().then(() => {
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
