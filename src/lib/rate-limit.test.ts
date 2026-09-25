import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeFixedWindow } from "./rate-limit";

describe("consumeFixedWindow — short fixed-window per-key throttle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to `limit` hits, then blocks within the window", () => {
    const key = `t1:${Math.random()}`;
    const r1 = consumeFixedWindow(key, 3, 1000);
    const r2 = consumeFixedWindow(key, 3, 1000);
    const r3 = consumeFixedWindow(key, 3, 1000);
    const r4 = consumeFixedWindow(key, 3, 1000);
    expect([r1.ok, r2.ok, r3.ok]).toEqual([true, true, true]);
    expect(r1.remaining).toBe(2);
    expect(r3.remaining).toBe(0);
    expect(r4.ok).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("resets after the window elapses", () => {
    const key = `t2:${Math.random()}`;
    consumeFixedWindow(key, 2, 1000);
    consumeFixedWindow(key, 2, 1000);
    expect(consumeFixedWindow(key, 2, 1000).ok).toBe(false); // blocked

    vi.advanceTimersByTime(1001); // window elapses
    const after = consumeFixedWindow(key, 2, 1000);
    expect(after.ok).toBe(true);
    expect(after.remaining).toBe(1);
  });

  it("a blocked call does not extend / reset the window", () => {
    const key = `t3:${Math.random()}`;
    consumeFixedWindow(key, 1, 1000); // ok, window opens at t0, resets t0+1000
    vi.advanceTimersByTime(600);
    expect(consumeFixedWindow(key, 1, 1000).ok).toBe(false); // blocked at t0+600
    vi.advanceTimersByTime(401); // now t0+1001 → original window expired
    expect(consumeFixedWindow(key, 1, 1000).ok).toBe(true); // fresh window, not pushed out
  });

  it("keys are independent", () => {
    const a = `t4a:${Math.random()}`;
    const b = `t4b:${Math.random()}`;
    expect(consumeFixedWindow(a, 1, 1000).ok).toBe(true);
    expect(consumeFixedWindow(a, 1, 1000).ok).toBe(false);
    expect(consumeFixedWindow(b, 1, 1000).ok).toBe(true); // unaffected by a
  });
});

describe("refundDailyQuota — give back a counted request that never ran the model", () => {
  it("returns one unit so a wait-and-ask-again doesn't use up the day", async () => {
    const { consumeDailyQuota, refundDailyQuota } = await import("./rate-limit");
    const key = `refund-test:${Math.random()}`;
    expect(consumeDailyQuota(key, 2).remaining).toBe(1);
    expect(consumeDailyQuota(key, 2).remaining).toBe(0);
    expect(consumeDailyQuota(key, 2).ok).toBe(false);
    refundDailyQuota(key);
    const again = consumeDailyQuota(key, 2);
    expect(again.ok).toBe(true);
    expect(again.remaining).toBe(0);
  });

  it("never goes below zero and ignores unknown keys", async () => {
    const { consumeDailyQuota, refundDailyQuota } = await import("./rate-limit");
    const key = `refund-floor:${Math.random()}`;
    refundDailyQuota(key); // no bucket yet: no-op
    consumeDailyQuota(key, 3);
    refundDailyQuota(key);
    refundDailyQuota(key); // already back at zero
    expect(consumeDailyQuota(key, 3).remaining).toBe(2);
  });
});
