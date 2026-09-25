import { afterEach, describe, expect, it, vi } from "vitest";
import {
  METER_START_TIMEOUT_MS,
  SILENT_FRAMES_LIMIT,
  isDigitalSilence,
  microphoneLevel,
  primeMicrophoneMeter,
  releasePrimedMeter,
  startMicrophoneMeter,
} from "./microphone-level";

afterEach(() => {
  releasePrimedMeter();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("microphone volume feedback", () => {
  it("keeps silence still, grows with speech and bounds loud or malformed samples", () => {
    expect(microphoneLevel(new Float32Array(512))).toBe(0);
    expect(microphoneLevel([0.005, -0.005])).toBe(0);
    expect(microphoneLevel([0.02, -0.02])).toBeGreaterThan(0);
    expect(microphoneLevel([0.1, -0.1])).toBeGreaterThan(microphoneLevel([0.02, -0.02]));
    expect(microphoneLevel([2, -2])).toBe(1);
    expect(microphoneLevel([NaN, Infinity])).toBe(0);
    expect(microphoneLevel([])).toBe(0);
  });

  function browser(resume = Promise.resolve()) {
    let amplitude = 0;
    let tick: FrameRequestCallback | undefined;
    const analyser = { fftSize: 512, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(amplitude), disconnect: vi.fn() };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const close = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn((callback: FrameRequestCallback) => { tick = callback; return 5; });
    const cancel = vi.fn();
    const stream = { getTracks: vi.fn() } as unknown as MediaStream;
    const createSource = vi.fn(() => source);
    vi.stubGlobal("window", { AudioContext: class {
      createAnalyser = () => analyser;
      createMediaStreamSource = createSource;
      resume = () => resume;
      close = close;
    } });
    vi.stubGlobal("requestAnimationFrame", request);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    return { stream, close, source, analyser, request, cancel, createSource,
      sample: (value: number, time: number) => { amplitude = value; tick?.(time); } };
  }

  it("reads the existing recording stream and releases the meter without stopping that stream", async () => {
    const b = browser();
    const updates = vi.fn();
    const stop = startMicrophoneMeter(b.stream, updates);
    await Promise.resolve();
    b.sample(0, 0);
    b.sample(0.1, 40);
    expect(updates.mock.calls[0][0]).toBe(0);
    expect(updates.mock.calls[1][0]).toBeGreaterThan(0.4);
    expect(b.createSource).toHaveBeenCalledWith(b.stream);
    expect(b.source.connect).toHaveBeenCalledWith(b.analyser);
    stop(); stop();
    const count = updates.mock.calls.length;
    b.sample(0.4, 80);
    expect(updates).toHaveBeenCalledTimes(count);
    expect(b.cancel).toHaveBeenCalledWith(5);
    expect(b.close).toHaveBeenCalledTimes(1);
    expect(b.source.disconnect).toHaveBeenCalledOnce();
    expect(b.stream.getTracks).not.toHaveBeenCalled();
  });

  it("cannot start an animation after the recording is closed during audio startup", async () => {
    let resume!: () => void;
    const b = browser(new Promise<void>(resolve => { resume = resolve; }));
    const updates = vi.fn();
    const stop = startMicrophoneMeter(b.stream, updates);
    stop(); resume();
    await Promise.resolve();
    expect(b.request).not.toHaveBeenCalled();
    expect(updates).not.toHaveBeenCalled();
    expect(b.close).toHaveBeenCalledOnce();
  });

  it("a failed audio meter does not stop or reject the recording", async () => {
    const b = browser(Promise.reject(new Error("Audio context unavailable")));
    const updates = vi.fn();
    expect(() => startMicrophoneMeter(b.stream, updates)).not.toThrow();
    await Promise.resolve(); await Promise.resolve();
    expect(updates).toHaveBeenCalledWith(null);
    expect(b.close).toHaveBeenCalledOnce();
    expect(b.stream.getTracks).not.toHaveBeenCalled();
  });

  it("says so (null) when the audio never starts, instead of sitting silent", async () => {
    vi.useFakeTimers();
    const b = browser(new Promise<void>(() => {}));
    const updates = vi.fn();
    const stop = startMicrophoneMeter(b.stream, updates);
    await vi.advanceTimersByTimeAsync(METER_START_TIMEOUT_MS - 1);
    expect(updates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(updates).toHaveBeenCalledWith(null);
    stop();
  });

  it("uses the context primed in the tap, and keeps it for the next recording", async () => {
    let made = 0;
    const close = vi.fn().mockResolvedValue(undefined);
    const resume = vi.fn(() => Promise.resolve());
    const analyser = { fftSize: 512, getFloatTimeDomainData: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal("window", { AudioContext: class {
      state = "suspended";
      constructor() { made++; }
      createAnalyser = () => analyser;
      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
      resume = resume;
      close = close;
    } });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    primeMicrophoneMeter();
    expect(made).toBe(1);
    expect(resume).toHaveBeenCalledTimes(1);
    const stream = {} as MediaStream;
    const stop = startMicrophoneMeter(stream, vi.fn());
    stop();
    startMicrophoneMeter(stream, vi.fn())();
    expect(made).toBe(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("tells digital silence (nothing at all) from a quiet room", () => {
    expect(isDigitalSilence(new Float32Array(8))).toBe(true);
    expect(isDigitalSilence(Float32Array.from([0, 0, 0.0001, 0]))).toBe(false);
  });

  /** A browser whose contexts are deaf (all zeros) for the first `deaf` contexts made. */
  function deafBrowser(deaf: number) {
    let made = 0;
    const ticks: FrameRequestCallback[] = [];
    const closes: Array<ReturnType<typeof vi.fn>> = [];
    vi.stubGlobal("window", { AudioContext: class {
      id = ++made;
      state = "running";
      close = vi.fn().mockResolvedValue(undefined);
      constructor() { closes.push(this.close); }
      resume = () => Promise.resolve();
      createAnalyser = () => {
        const id = this.id;
        return { fftSize: 512, disconnect: vi.fn(), getFloatTimeDomainData: (samples: Float32Array) => samples.fill(id <= deaf ? 0 : 0.1) };
      };
      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    } });
    vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => { ticks.push(cb); return ticks.length; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const run = (frames: number) => { for (let i = 0; i < frames; i++) ticks.shift()?.(i * 40 + 1000 * made); };
    return { run, made: () => made, closes };
  }

  it("a deaf audio context is rebuilt once from the live stream, and then the bars move", async () => {
    const b = deafBrowser(1);
    const updates = vi.fn();
    const stop = startMicrophoneMeter({} as MediaStream, updates);
    await Promise.resolve();
    b.run(SILENT_FRAMES_LIMIT);
    expect(b.made()).toBe(2);
    expect(b.closes[0]).toHaveBeenCalledOnce();
    await Promise.resolve();
    b.run(3);
    expect(updates).not.toHaveBeenCalledWith(null);
    expect(updates.mock.calls.at(-1)?.[0]).toBeGreaterThan(0.3);
    stop();
  });

  it("still deaf after the rebuild: says so (null) so the bars fall back to the wave", async () => {
    const b = deafBrowser(2);
    const updates = vi.fn();
    startMicrophoneMeter({} as MediaStream, updates);
    await Promise.resolve();
    b.run(SILENT_FRAMES_LIMIT);
    await Promise.resolve();
    b.run(SILENT_FRAMES_LIMIT);
    expect(updates).toHaveBeenLastCalledWith(null);
    expect(b.made()).toBe(2);
  });
});
