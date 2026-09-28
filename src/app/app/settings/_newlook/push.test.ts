import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pushCanToggle,
  pushStatusText,
  syncNativePushOnLaunch,
  watchNotificationTaps,
  type PushState,
} from "./push";

const STATES: PushState[] = ["checking", "unsupported", "off", "working", "on", "denied", "error"];

describe("quote notifications wording", () => {
  it("every state has one plain sentence", () => {
    for (const state of STATES) {
      const text = pushStatusText(state);
      expect(text.length, state).toBeGreaterThan(5);
      expect(text).not.toMatch(/\/\/|VAPID|APNs|service worker/i);
    }
  });

  it("covers every event a push can be about, not just a quote being accepted (audit finding 6)", () => {
    for (const state of ["on", "off"] as const) {
      const text = pushStatusText(state);
      expect(text).toMatch(/requests? a quote/);
      expect(text).toMatch(/opens? it/);
      expect(text).toMatch(/sends? a message|messages?/);
      expect(text).toMatch(/accepts? it/);
    }
  });

  it("the switch works only where the phone lets us ask", () => {
    expect(STATES.filter(pushCanToggle)).toEqual(["off", "on", "error"]);
  });

  it("never hard-codes its own VAPID key — it must fetch the server's, or the two can drift apart again (audit finding 3)", () => {
    const source = readFileSync(join(process.cwd(), "src/app/app/settings/_newlook/push.ts"), "utf8");
    expect(source).not.toMatch(/"B[A-Za-z0-9_-]{80,}"/);
    expect(source).toContain("/api/push/public-key");
  });
});

const state = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  register: vi.fn(),
  addListener: vi.fn(),
}));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: (...a: unknown[]) => state.checkPermissions(...a),
    requestPermissions: (...a: unknown[]) => state.requestPermissions(...a),
    register: (...a: unknown[]) => state.register(...a),
    addListener: (...a: unknown[]) => state.addListener(...a),
  },
}));

type Listener = (arg: unknown) => void;

function wireRegistration(token: string | null) {
  const listeners: Record<string, Listener> = {};
  state.addListener.mockImplementation(async (event: string, cb: Listener) => {
    listeners[event] = cb;
    return { remove: vi.fn() };
  });
  state.register.mockImplementation(async () => {
    queueMicrotask(() => {
      if (token) listeners.registration?.({ value: token });
      else listeners.registrationError?.({});
    });
  });
}

const fetchMock = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  state.checkPermissions.mockReset();
  state.requestPermissions.mockReset();
  state.register.mockReset();
  state.addListener.mockReset();
  fetchMock.mockReset();
});

describe("syncNativePushOnLaunch", () => {
  it("never prompts, and does nothing when permission isn't already granted", async () => {
    state.checkPermissions.mockResolvedValue({ receive: "prompt" });
    vi.stubGlobal("fetch", fetchMock);
    await syncNativePushOnLaunch();
    expect(state.requestPermissions).not.toHaveBeenCalled();
    expect(state.register).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-registers and re-sends the token when the phone already granted permission (a reinstall or a rotated token)", async () => {
    state.checkPermissions.mockResolvedValue({ receive: "granted" });
    wireRegistration("fresh-token-123");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const store = new Map<string, string>();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    await syncNativePushOnLaunch();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ platform: "ios", token: "fresh-token-123" }) }),
    );
    expect(store.get("t2q-apns-token")).toBe("fresh-token-123");
  });

  it("never throws when the plugin or the network fails", async () => {
    state.checkPermissions.mockRejectedValue(new Error("bridge unavailable"));
    await expect(syncNativePushOnLaunch()).resolves.toBeUndefined();
  });
});

describe("watchNotificationTaps", () => {
  it("calls back with the payload's url when a notification is tapped", async () => {
    const handlers: Record<string, Listener> = {};
    state.addListener.mockImplementation(async (event: string, cb: Listener) => {
      handlers[event] = cb;
      return { remove: vi.fn() };
    });
    const onUrl = vi.fn();
    await watchNotificationTaps(onUrl);
    handlers.pushNotificationActionPerformed({ notification: { data: { url: "/app/quotes/preview/123" } } });
    expect(onUrl).toHaveBeenCalledWith("/app/quotes/preview/123");
  });

  it("ignores a tap with no url in the payload", async () => {
    const handlers: Record<string, Listener> = {};
    state.addListener.mockImplementation(async (event: string, cb: Listener) => {
      handlers[event] = cb;
      return { remove: vi.fn() };
    });
    const onUrl = vi.fn();
    await watchNotificationTaps(onUrl);
    handlers.pushNotificationActionPerformed({ notification: { data: {} } });
    handlers.pushNotificationActionPerformed({ notification: {} });
    expect(onUrl).not.toHaveBeenCalled();
  });

  it("never follows a url that would leave the app", async () => {
    const handlers: Record<string, Listener> = {};
    state.addListener.mockImplementation(async (event: string, cb: Listener) => {
      handlers[event] = cb;
      return { remove: vi.fn() };
    });
    const onUrl = vi.fn();
    await watchNotificationTaps(onUrl);
    for (const url of ["https://evil.example/phish", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      handlers.pushNotificationActionPerformed({ notification: { data: { url } } });
    }
    expect(onUrl).not.toHaveBeenCalled();
  });

  it("never throws, and returns a working no-op cleanup, when the plugin is unavailable", async () => {
    state.addListener.mockRejectedValue(new Error("bridge unavailable"));
    const remove = await watchNotificationTaps(vi.fn());
    expect(() => remove()).not.toThrow();
  });
});
