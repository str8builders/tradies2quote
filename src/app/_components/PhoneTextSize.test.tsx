// The iPhone app following the phone's own text size (the reading itself is
// followPhoneTextSize in src/lib/ui/text-size.ts): on open, whenever the app
// comes back or gets focus again, and once more a second later in case iOS
// hands the new size over late; never in a browser or while hidden.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const follow = vi.hoisted(() => vi.fn());
const native = vi.hoisted(() => ({ on: true }));
const cleanups = vi.hoisted(() => [] as Array<() => void>);

// Run effects straight away (no browser here) and keep their cleanups.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    },
  };
});
vi.mock("@/lib/native-app", () => ({ isNativeIOSApp: () => native.on }));
vi.mock("@/lib/ui/text-size", () => ({ followPhoneTextSize: follow }));

import { PhoneTextSize } from "./PhoneTextSize";

type Listener = () => void;

function eventTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, fn: Listener) {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
    fire(type: string) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    count() {
      let n = 0;
      for (const set of listeners.values()) n += set.size;
      return n;
    },
  };
}

let doc: ReturnType<typeof eventTarget> & { visibilityState: string };
let win: ReturnType<typeof eventTarget>;

beforeEach(() => {
  vi.useFakeTimers();
  follow.mockClear();
  native.on = true;
  doc = Object.assign(eventTarget(), { visibilityState: "visible" });
  win = eventTarget();
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
});

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PhoneTextSize", () => {
  it("does nothing in a browser", () => {
    native.on = false;
    expect(PhoneTextSize()).toBeNull();
    expect(follow).not.toHaveBeenCalled();
    expect(doc.count() + win.count()).toBe(0);
  });

  it("in the iPhone app: follows the phone's size on open", () => {
    expect(PhoneTextSize()).toBeNull();
    expect(follow).toHaveBeenCalledOnce();
  });

  it.each([
    ["coming back to the app", () => doc.fire("visibilitychange")],
    ["focus again (after Control Center)", () => win.fire("focus")],
    ["the page shown again", () => win.fire("pageshow")],
  ])("%s: checks again, and once more a second later", (_, fire) => {
    PhoneTextSize();
    follow.mockClear();
    fire();
    expect(follow).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(999);
    expect(follow).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(follow).toHaveBeenCalledTimes(2);
  });

  it("not while hidden", () => {
    PhoneTextSize();
    follow.mockClear();
    doc.visibilityState = "hidden";
    doc.fire("visibilitychange");
    vi.runAllTimers();
    expect(follow).not.toHaveBeenCalled();
  });

  it("events close together: each checks, then one late check", () => {
    PhoneTextSize();
    follow.mockClear();
    doc.fire("visibilitychange");
    win.fire("focus");
    vi.runAllTimers();
    expect(follow).toHaveBeenCalledTimes(3);
  });

  it("stops listening when it goes, and drops a late check still waiting", () => {
    PhoneTextSize();
    expect(doc.count() + win.count()).toBe(3);
    win.fire("focus");
    follow.mockClear();
    cleanups.pop()?.();
    expect(doc.count() + win.count()).toBe(0);
    vi.runAllTimers();
    expect(follow).not.toHaveBeenCalled();
  });
});
