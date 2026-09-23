import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOTION_CHANGE_EVENT,
  MOTION_STORAGE_KEY,
  resolveMotionPaused,
  wallpaperModeFor,
} from "./motion";

/** Minimal browser: EventTarget window + matchMedia + (optionally broken) localStorage. */
function stubWindow({ reduced = false, blocked = false } = {}) {
  const stored = new Map<string, string>();
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const win = Object.assign(new EventTarget(), {
    matchMedia: () => media,
    localStorage: {
      getItem(key: string) {
        if (blocked) throw new Error("SecurityError");
        return stored.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (blocked) throw new Error("QuotaExceededError");
        stored.set(key, value);
      },
    },
  });
  vi.stubGlobal("window", win);
  return { win, media, stored };
}

/** A fresh module per test, so the in-memory session choice never leaks. */
async function freshStore() {
  vi.resetModules();
  return import("./motion");
}

function storageEvent(key: string | null) {
  return Object.assign(new Event("storage"), { key });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("motion preference", () => {
  it("lets the OS setting win, then this tab's choice, then storage", () => {
    const base = { reducedMotion: false, sessionChoice: undefined, stored: null };
    expect(resolveMotionPaused(base)).toBe(false);
    expect(resolveMotionPaused({ ...base, stored: "true" })).toBe(true);
    expect(resolveMotionPaused({ ...base, stored: "false" })).toBe(false);
    expect(resolveMotionPaused({ ...base, stored: "true", sessionChoice: false })).toBe(false);
    expect(resolveMotionPaused({ ...base, sessionChoice: true })).toBe(true);
    expect(resolveMotionPaused({ ...base, reducedMotion: true, sessionChoice: false })).toBe(true);
  });

  it("persists the choice under the shared key and notifies subscribers", async () => {
    const { win, stored } = stubWindow();
    const motion = await freshStore();
    const seen = vi.fn();
    const events = vi.fn();
    win.addEventListener(MOTION_CHANGE_EVENT, events);
    const unsubscribe = motion.subscribeMotionPaused(seen);

    expect(motion.readMotionPaused()).toBe(false);
    motion.setMotionPaused(true);
    expect(stored.get(MOTION_STORAGE_KEY)).toBe("true");
    expect(motion.readMotionPaused()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(events).toHaveBeenCalledTimes(1);

    motion.setMotionPaused(false);
    expect(stored.get(MOTION_STORAGE_KEY)).toBe("false");
    expect(motion.readMotionPaused()).toBe(false);

    unsubscribe();
    motion.setMotionPaused(true);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("still honours the toggle for this tab when storage is blocked", async () => {
    stubWindow({ blocked: true });
    const motion = await freshStore();
    expect(motion.readMotionPaused()).toBe(false);
    expect(() => motion.setMotionPaused(true)).not.toThrow();
    expect(motion.readMotionPaused()).toBe(true);
  });

  it("stays paused under reduced motion whatever the toggle says", async () => {
    stubWindow({ reduced: true });
    const motion = await freshStore();
    motion.setMotionPaused(false);
    expect(motion.readMotionPaused()).toBe(true);
  });

  it("follows another tab's choice, even after a local toggle", async () => {
    const { win, stored } = stubWindow();
    const motion = await freshStore();
    const seen = vi.fn();
    motion.subscribeMotionPaused(seen);
    motion.setMotionPaused(true);
    seen.mockClear();

    win.dispatchEvent(storageEvent("unrelated"));
    expect(seen).not.toHaveBeenCalled();

    stored.set(MOTION_STORAGE_KEY, "false"); // written by the other tab
    win.dispatchEvent(storageEvent(MOTION_STORAGE_KEY));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(motion.readMotionPaused()).toBe(false);
  });

  it("re-reads when the OS reduced-motion setting changes", async () => {
    const { media } = stubWindow();
    const motion = await freshStore();
    const seen = vi.fn();
    motion.subscribeMotionPaused(seen);
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(motion.readMotionPaused()).toBe(true);
  });
});

describe("wallpaper route policy", () => {
  it.each([
    ["/", "live"],
    ["/pricing", "live"],
    ["/calculator", "live"],
    ["/login", "live"],
    ["/application", "live"],
    ["/app", "still"],
    ["/app/quotes/new", "still"],
    ["/print/request-poster", "still"],
    ["/quote/abc123", "none"],
    ["/app/quotes/42/pdf", "none"],
  ] as const)("%s → %s", (path, mode) => {
    expect(wallpaperModeFor(path)).toBe(mode);
  });
});
