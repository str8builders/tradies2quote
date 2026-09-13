import { afterEach, describe, expect, it, vi } from "vitest";
import { microphoneLevel, startMicrophoneMeter } from "./microphone-level";

afterEach(() => vi.unstubAllGlobals());

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
});
