import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ native: true, plugin: true, offer: vi.fn(async () => undefined) }));
vi.mock("@/lib/native-app", () => ({ isNativeIOSApp: () => state.native }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isPluginAvailable: () => state.plugin },
  registerPlugin: () => ({ offer: state.offer }),
}));

import { offerT2QCALSignIn } from "./T2QCALLauncher";

const fetchMock = vi.fn();
beforeEach(() => {
  Object.assign(state, { native: true, plugin: true });
  state.offer.mockClear();
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ code: "c".repeat(43), userId: "user-1", expiresIn: 60 })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("signing T2QCAL in from Tradies2Quote", () => {
  it("in the iPhone app: a one-time code goes to T2QCAL's private pasteboard, never the link", async () => {
    expect(await offerT2QCALSignIn()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/t2qcal/handoff", expect.objectContaining({ method: "POST" }));
    expect(state.offer).toHaveBeenCalledWith({ code: "c".repeat(43), userId: "user-1" });
  });

  it("does nothing in a browser, or in an older app without the module", async () => {
    state.native = false;
    expect(await offerT2QCALSignIn()).toBe(false);
    state.native = true;
    state.plugin = false;
    expect(await offerT2QCALSignIn()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never stops T2QCAL opening: a failed request just skips the sign-in", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    expect(await offerT2QCALSignIn()).toBe(false);
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await offerT2QCALSignIn()).toBe(false);
    expect(state.offer).not.toHaveBeenCalled();
  });
});
