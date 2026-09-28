// The sign-in page's stop for the iPhone app's location: shown, it stops
// tracking and forgets the last person's upload key; it renders nothing.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const stop = vi.hoisted(() => vi.fn(async () => {}));

// Run effects straight away (no browser here) to see what the component does when shown.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useEffect: (effect: () => void) => void effect() };
});
vi.mock("@/lib/location/device", () => ({ stopNativeTracking: stop }));

import { NativeTrackingStop } from "./NativeTrackingStop";

describe("NativeTrackingStop", () => {
  it("stops location on the phone when shown", () => {
    stop.mockClear();
    expect(NativeTrackingStop()).toBeNull();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("renders nothing", () => {
    expect(renderToStaticMarkup(<NativeTrackingStop />)).toBe("");
  });
});
