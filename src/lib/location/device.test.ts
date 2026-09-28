// Stopping the iPhone app's location (signing out, the sign-in page): only
// inside the app, and never an error for the page.

import { beforeEach, describe, expect, it, vi } from "vitest";

const phone = vi.hoisted(() => ({
  inApp: true,
  available: true,
  stopAll: vi.fn(async () => {}),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isPluginAvailable: () => phone.available },
  registerPlugin: () => ({ stopAll: phone.stopAll }),
}));
vi.mock("@/lib/native-app", () => ({ isNativeIOSApp: () => phone.inApp }));

import { stopNativeTracking } from "./device";

beforeEach(() => {
  phone.inApp = true;
  phone.available = true;
  phone.stopAll.mockReset();
  phone.stopAll.mockResolvedValue(undefined);
});

describe("stopNativeTracking", () => {
  it("in the iPhone app: stops everything and forgets the key", async () => {
    await stopNativeTracking();
    expect(phone.stopAll).toHaveBeenCalledOnce();
  });

  it("in a browser, or an app build without the module: does nothing", async () => {
    phone.inApp = false;
    await stopNativeTracking();
    phone.inApp = true;
    phone.available = false;
    await stopNativeTracking();
    expect(phone.stopAll).not.toHaveBeenCalled();
  });

  it("a failure never reaches the page", async () => {
    phone.stopAll.mockRejectedValue(new Error("bridge busy"));
    await expect(stopNativeTracking()).resolves.toBeUndefined();
  });
});
