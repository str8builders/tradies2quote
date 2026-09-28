// Before Finish, the route still waiting on the device is sent first, but a
// bad signal never holds Finish up.

import { afterEach, describe, expect, it, vi } from "vitest";
import { flushRoutePoints, registerRouteFlusher } from "./route-flush";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  vi.useRealTimers();
});

describe("flushRoutePoints", () => {
  it("nothing registered: returns straight away", async () => {
    await expect(flushRoutePoints(10)).resolves.toBeUndefined();
  });

  it("waits for every sender", async () => {
    const sent: string[] = [];
    cleanups.push(registerRouteFlusher(async () => void sent.push("web")));
    cleanups.push(
      registerRouteFlusher(
        () => new Promise<void>((resolve) => setTimeout(() => (sent.push("phone"), resolve()), 5)),
      ),
    );
    await flushRoutePoints(1000);
    expect(sent.sort()).toEqual(["phone", "web"]);
  });

  it("a sender that fails doesn't stop the others or throw", async () => {
    const sent: string[] = [];
    cleanups.push(registerRouteFlusher(async () => Promise.reject(new Error("no signal"))));
    cleanups.push(registerRouteFlusher(() => Promise.reject(new Error("worse"))));
    cleanups.push(registerRouteFlusher(async () => void sent.push("ok")));
    await expect(flushRoutePoints(1000)).resolves.toBeUndefined();
    expect(sent).toEqual(["ok"]);
  });

  it("gives up after the timeout so Finish carries on", async () => {
    vi.useFakeTimers();
    cleanups.push(registerRouteFlusher(() => new Promise<void>(() => {})));
    const done = vi.fn();
    const flushing = flushRoutePoints(5000).then(done);
    await vi.advanceTimersByTimeAsync(4999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flushing;
    expect(done).toHaveBeenCalledOnce();
  });

  it("a removed sender isn't called", async () => {
    const send = vi.fn(async () => {});
    registerRouteFlusher(send)();
    await flushRoutePoints(10);
    expect(send).not.toHaveBeenCalled();
  });
});
