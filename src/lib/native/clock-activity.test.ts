// The clock-in Live Activity (Dynamic Island and Lock Screen): the page only
// says what the open time entry is, and only inside the iPhone app. A failure
// never reaches the person.

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

type Fn = Mock<(...args: unknown[]) => unknown>;
const phone = vi.hoisted(() => ({
  inApp: true,
  has: new Set<string>(),
  plugin: {} as Record<string, Fn>,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isPluginAvailable: (name: string) => phone.has.has(name) },
  registerPlugin: () => new Proxy({}, { get: (_t, method: string) => (...args: unknown[]) => phone.plugin[method](...args) }),
}));
vi.mock("@/lib/native-app", () => ({ isNativeIOSApp: () => phone.inApp }));

import { MAX_ACTIVITY_AGE_MS, clockActivityStatus, endClockActivity, planClockActivity, syncClockActivity } from "./clock-activity";

const NOW = Date.parse("2026-10-03T02:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

beforeEach(() => {
  phone.inApp = true;
  phone.has = new Set(["T2QClockActivity"]);
  phone.plugin = {
    sync: vi.fn(async () => ({ result: "started" })),
    end: vi.fn(async () => ({ ended: 1 })),
    status: vi.fn(async () => ({ supported: true, enabled: true, active: true, count: 1 })),
  };
});

describe("planClockActivity", () => {
  it("clocked in: start from the exact moment work began", () => {
    expect(planClockActivity({ id: "e1", startedAt: ago(2 * HOUR) }, NOW)).toEqual({ kind: "start", entryId: "e1", startedAt: ago(2 * HOUR) });
  });

  it("not clocked in: end", () => {
    expect(planClockActivity(null, NOW)).toEqual({ kind: "end" });
    expect(planClockActivity(undefined, NOW)).toEqual({ kind: "end" });
  });

  it("an entry with no id or a start that can't be read: end", () => {
    expect(planClockActivity({ id: "", startedAt: ago(HOUR) }, NOW)).toEqual({ kind: "end" });
    expect(planClockActivity({ id: "e1", startedAt: "yesterday-ish" }, NOW)).toEqual({ kind: "end" });
  });

  it("a clock left running since yesterday is a forgotten one, not a shift: end", () => {
    expect(planClockActivity({ id: "e1", startedAt: ago(MAX_ACTIVITY_AGE_MS) }, NOW).kind).toBe("start");
    expect(planClockActivity({ id: "e1", startedAt: ago(MAX_ACTIVITY_AGE_MS + 1000) }, NOW)).toEqual({ kind: "end" });
  });

  it("a start a little in the future (a skewed clock) counts from now", () => {
    expect(planClockActivity({ id: "e1", startedAt: new Date(NOW + 5 * 60 * 1000).toISOString() }, NOW)).toEqual({
      kind: "start",
      entryId: "e1",
      startedAt: new Date(NOW).toISOString(),
    });
  });
});

describe("syncClockActivity", () => {
  it("starts it for an open entry, with only the entry and the start time, and says what the phone did", async () => {
    expect(await syncClockActivity({ id: "e1", startedAt: ago(HOUR) }, NOW)).toBe("started");
    expect(phone.plugin.sync).toHaveBeenCalledWith({ entryId: "e1", startedAt: ago(HOUR) });
    expect(phone.plugin.end).not.toHaveBeenCalled();
  });

  it("ends it when there is no open entry", async () => {
    expect(await syncClockActivity(null, NOW)).toBe("ended");
    expect(phone.plugin.end).toHaveBeenCalledTimes(1);
    expect(phone.plugin.sync).not.toHaveBeenCalled();
  });

  it("ends it for a clock left running since yesterday", async () => {
    expect(await syncClockActivity({ id: "e1", startedAt: ago(MAX_ACTIVITY_AGE_MS + HOUR) }, NOW)).toBe("ended");
    expect(phone.plugin.sync).not.toHaveBeenCalled();
  });

  it("does nothing outside the app, or in a build without the module", async () => {
    phone.inApp = false;
    expect(await syncClockActivity({ id: "e1", startedAt: ago(HOUR) }, NOW)).toBeNull();
    phone.inApp = true;
    phone.has.clear();
    expect(await syncClockActivity({ id: "e1", startedAt: ago(HOUR) }, NOW)).toBeNull();
    await endClockActivity();
    expect(await clockActivityStatus()).toBeNull();
    expect(phone.plugin.sync).not.toHaveBeenCalled();
    expect(phone.plugin.end).not.toHaveBeenCalled();
    expect(phone.plugin.status).not.toHaveBeenCalled();
  });

  it("never throws when the phone says no", async () => {
    phone.plugin.sync.mockRejectedValueOnce(new Error("Live Activities are off"));
    phone.plugin.end.mockRejectedValue(new Error("nothing to end"));
    phone.plugin.status.mockRejectedValueOnce(new Error("no"));
    await expect(syncClockActivity({ id: "e1", startedAt: ago(HOUR) }, NOW)).resolves.toBeNull();
    await expect(syncClockActivity(null, NOW)).resolves.toBeNull();
    await expect(endClockActivity()).resolves.toBeUndefined();
    await expect(clockActivityStatus()).resolves.toBeNull();
  });
});

describe("endClockActivity and status", () => {
  it("ends it on sign-out", async () => {
    await endClockActivity();
    expect(phone.plugin.end).toHaveBeenCalledTimes(1);
  });

  it("reads what the phone says about Live Activities", async () => {
    expect(await clockActivityStatus()).toEqual({ supported: true, enabled: true, active: true, count: 1 });
  });
});
