// The sign-in page's stop for the iPhone app: shown, it stops location
// tracking, forgets the last person's upload key and ends the "Clocked in"
// Live Activity (an expired session or a deleted account lands here without
// the sign-out button); it renders nothing.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const stop = vi.hoisted(() => vi.fn(async () => {}));
const endIsland = vi.hoisted(() => vi.fn(async () => {}));

// Run effects straight away (no browser here) to see what the component does when shown.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useEffect: (effect: () => void) => void effect() };
});
vi.mock("@/lib/location/device", () => ({ stopNativeTracking: stop }));
vi.mock("@/lib/native/clock-activity", () => ({ endClockActivity: endIsland }));

import { NativeTrackingStop } from "./NativeTrackingStop";

describe("NativeTrackingStop", () => {
  it("stops location on the phone when shown", () => {
    stop.mockClear();
    expect(NativeTrackingStop()).toBeNull();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("ends the Clocked in timer on the Lock Screen and Dynamic Island", () => {
    endIsland.mockClear();
    NativeTrackingStop();
    expect(endIsland).toHaveBeenCalledOnce();
  });

  it("renders nothing", () => {
    expect(renderToStaticMarkup(<NativeTrackingStop />)).toBe("");
  });
});
