// The iPhone app's own native modules (quick actions, calendar, contacts, haptics): the page asks first, uses
// them only inside the app and only in a build that has them, and a failure never reaches the person.

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

type Fn = Mock<(...args: unknown[]) => unknown>;
const phone = vi.hoisted(() => ({
  inApp: true,
  has: new Set<string>(),
  plugins: {} as Record<string, Record<string, Fn>>,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isPluginAvailable: (name: string) => phone.has.has(name) },
  registerPlugin: (name: string) => new Proxy({}, { get: (_t, method: string) => (...args: unknown[]) => phone.plugins[name][method](...args) }),
}));
vi.mock("@/lib/native-app", () => ({ isNativeIOSApp: () => phone.inApp }));

import { addJobToCalendar } from "./calendar";
import { pickContact } from "./contacts";
import { haptic } from "./haptics";
import { hasNativeModule } from "./plugins";
import { SHORTCUT_PATHS, connectShortcuts, isShortcutPath, takeShortcutPath, watchShortcuts } from "./shortcuts";

beforeEach(() => {
  phone.inApp = true;
  phone.has = new Set(["T2QShortcuts", "T2QCalendar", "T2QContacts", "T2QHaptics"]);
  phone.plugins = {
    T2QShortcuts: { consume: vi.fn(async () => ({})), addListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })) },
    T2QCalendar: { addEvent: vi.fn(async () => ({ saved: true })) },
    T2QContacts: { pick: vi.fn(async () => ({ name: "Sam Taylor", company: "", phone: "021 555 0199", email: "sam@example.com", address: "14 Rata St, Tauranga" })) },
    T2QHaptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  };
});

describe("hasNativeModule", () => {
  it("is yes only inside the iPhone app, and only for a module this build has", () => {
    expect(hasNativeModule("T2QCalendar")).toBe(true);
    phone.has.delete("T2QCalendar");
    expect(hasNativeModule("T2QCalendar")).toBe(false);
    phone.has.add("T2QCalendar");
    phone.inApp = false;
    expect(hasNativeModule("T2QCalendar")).toBe(false);
  });
});

describe("quick actions", () => {
  it("only these four pages can be opened", () => {
    expect([...SHORTCUT_PATHS]).toEqual(["/app/quotes/new", "/app/timesheet", "/app/jobs", "/app/materials/capture"]);
    for (const ok of SHORTCUT_PATHS) expect(isShortcutPath(ok)).toBe(true);
    for (const bad of ["/app/settings", "/app/jobs/../settings", "https://example.com/app/jobs", "//evil.example", "app/jobs", "", null, undefined, 5]) expect(isShortcutPath(bad)).toBe(false);
  });

  it("collects the page an action asked for, once", async () => {
    phone.plugins.T2QShortcuts.consume.mockResolvedValueOnce({ path: "/app/quotes/new" });
    expect(await takeShortcutPath()).toBe("/app/quotes/new");
    expect(await takeShortcutPath()).toBeNull();
  });

  it("ignores a page that isn't on the list, and any failure", async () => {
    phone.plugins.T2QShortcuts.consume.mockResolvedValueOnce({ path: "/app/settings" });
    expect(await takeShortcutPath()).toBeNull();
    phone.plugins.T2QShortcuts.consume.mockRejectedValueOnce(new Error("bridge busy"));
    expect(await takeShortcutPath()).toBeNull();
  });

  it("does nothing outside the app or in a build without the module", async () => {
    phone.inApp = false;
    expect(await takeShortcutPath()).toBeNull();
    const stop = await watchShortcuts(() => {});
    stop();
    phone.inApp = true;
    phone.has.delete("T2QShortcuts");
    expect(await takeShortcutPath()).toBeNull();
    expect(phone.plugins.T2QShortcuts.consume).not.toHaveBeenCalled();
    expect(phone.plugins.T2QShortcuts.addListener).not.toHaveBeenCalled();
  });

  it("an action that arrives while the app is open opens its page; stopping removes the listener", async () => {
    const remove = vi.fn(async () => {});
    let nudge: () => void = () => {};
    phone.plugins.T2QShortcuts.addListener.mockImplementation(async (...args: unknown[]) => {
      nudge = args[1] as () => void;
      return { remove };
    });
    const seen: string[] = [];
    const stop = await watchShortcuts((path) => seen.push(path));
    phone.plugins.T2QShortcuts.consume.mockResolvedValueOnce({ path: "/app/timesheet" });
    nudge();
    await vi.waitFor(() => expect(seen).toEqual(["/app/timesheet"]));
    phone.plugins.T2QShortcuts.consume.mockResolvedValueOnce({});
    nudge();
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(["/app/timesheet"]);
    stop();
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe("connectShortcuts", () => {
  it("opens the page that launched the app", async () => {
    phone.plugins.T2QShortcuts.consume.mockResolvedValueOnce({ path: "/app/quotes/new" });
    const open = vi.fn();
    connectShortcuts(open);
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("/app/quotes/new"));
    expect(open).toHaveBeenCalledOnce();
  });

  it("still opens an action collected after the screen that asked was cleaned up (the phone hands it over once)", async () => {
    let hand: (v: { path?: string }) => void = () => {};
    phone.plugins.T2QShortcuts.consume.mockImplementationOnce(() => new Promise((resolve) => (hand = resolve)));
    const open = vi.fn();
    const stop = connectShortcuts(open);
    stop(); // React's second effect run in development, or a screen replaced mid-flight
    hand({ path: "/app/jobs" });
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("/app/jobs"));
  });

  it("stops listening when stopped, even before the listener has finished registering", async () => {
    const remove = vi.fn(async () => {});
    phone.plugins.T2QShortcuts.addListener.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({ remove }), 5)));
    const stop = connectShortcuts(vi.fn());
    stop();
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
  });

  it("does nothing outside the app", () => {
    phone.inApp = false;
    const stop = connectShortcuts(vi.fn());
    stop();
    expect(phone.plugins.T2QShortcuts.consume).not.toHaveBeenCalled();
  });
});

describe("addJobToCalendar", () => {
  const job = { title: "New kwila deck", date: "2026-10-05", location: " 14 Rata St ", notes: "For Sam Taylor\nQuote Q-2026-AB12" };

  it("opens the sheet with the job, trimmed, and says whether it was saved", async () => {
    expect(await addJobToCalendar(job)).toEqual({ ok: true, saved: true });
    expect(phone.plugins.T2QCalendar.addEvent).toHaveBeenCalledWith({ title: "New kwila deck", date: "2026-10-05", location: "14 Rata St", notes: "For Sam Taylor\nQuote Q-2026-AB12" });
    phone.plugins.T2QCalendar.addEvent.mockResolvedValueOnce({ saved: false });
    expect(await addJobToCalendar({ title: "x", date: "2026-10-05" })).toEqual({ ok: true, saved: false });
    expect(phone.plugins.T2QCalendar.addEvent).toHaveBeenLastCalledWith({ title: "x", date: "2026-10-05" });
  });

  it("won't open for a job with no title or no real day", async () => {
    for (const bad of [{ ...job, title: "  " }, { ...job, date: "" }, { ...job, date: "5 Oct 2026" }, { ...job, date: "2026-10-5" }]) {
      expect(await addJobToCalendar(bad)).toMatchObject({ ok: false });
    }
    expect(phone.plugins.T2QCalendar.addEvent).not.toHaveBeenCalled();
  });

  it("says so when the calendar isn't there, and passes on what the phone said when it couldn't open", async () => {
    phone.inApp = false;
    expect(await addJobToCalendar(job)).toEqual({ ok: false, message: "The calendar isn't available on this phone." });
    phone.inApp = true;
    phone.plugins.T2QCalendar.addEvent.mockRejectedValueOnce(new Error("Calendar access was turned off for Tradies2Quote."));
    expect(await addJobToCalendar(job)).toEqual({ ok: false, message: "Calendar access was turned off for Tradies2Quote." });
    phone.plugins.T2QCalendar.addEvent.mockRejectedValueOnce({ message: "The calendar is already open." });
    expect(await addJobToCalendar(job)).toEqual({ ok: false, message: "The calendar is already open." });
    phone.plugins.T2QCalendar.addEvent.mockRejectedValueOnce("odd");
    expect(await addJobToCalendar(job)).toEqual({ ok: false, message: "The calendar didn't open. Try again." });
  });
});

describe("pickContact", () => {
  it("gives the contact the person tapped, tidied", async () => {
    phone.plugins.T2QContacts.pick.mockResolvedValueOnce({ name: " Sam Taylor ", company: "", phone: " 021 555 0199 ", email: "sam@example.com", address: "" });
    expect(await pickContact()).toEqual({ name: "Sam Taylor", company: "", phone: "021 555 0199", email: "sam@example.com", address: "" });
  });

  it("is null when they back out, pick an empty contact, or it isn't available", async () => {
    phone.plugins.T2QContacts.pick.mockResolvedValueOnce({ cancelled: true });
    expect(await pickContact()).toBeNull();
    phone.plugins.T2QContacts.pick.mockResolvedValueOnce({ name: "", company: "", phone: "", email: "", address: "" });
    expect(await pickContact()).toBeNull();
    phone.plugins.T2QContacts.pick.mockRejectedValueOnce(new Error("The contacts are already open."));
    expect(await pickContact()).toBeNull();
    phone.inApp = false;
    expect(await pickContact()).toBeNull();
    expect(phone.plugins.T2QContacts.pick).toHaveBeenCalledTimes(3);
  });

  it("reads only strings from what the phone returns", async () => {
    phone.plugins.T2QContacts.pick.mockResolvedValueOnce({ name: 5, company: null, phone: { x: 1 }, email: "a@b.co", address: undefined } as never);
    expect(await pickContact()).toEqual({ name: "", company: "", phone: "", email: "a@b.co", address: "" });
  });
});

describe("haptic", () => {
  it("taps the right way for each kind", () => {
    haptic("tap");
    haptic("heavy");
    haptic("success");
    haptic("warning");
    expect(phone.plugins.T2QHaptics.impact.mock.calls).toEqual([[{ style: "light" }], [{ style: "heavy" }]]);
    expect(phone.plugins.T2QHaptics.notification.mock.calls).toEqual([[{ type: "success" }], [{ type: "warning" }]]);
  });

  it("does nothing outside the app or without the module, and never throws", async () => {
    phone.inApp = false;
    haptic("success");
    phone.inApp = true;
    phone.has.delete("T2QHaptics");
    haptic("success");
    expect(phone.plugins.T2QHaptics.notification).not.toHaveBeenCalled();
    phone.has.add("T2QHaptics");
    phone.plugins.T2QHaptics.notification.mockRejectedValueOnce(new Error("no"));
    expect(() => haptic("success")).not.toThrow();
    phone.plugins.T2QHaptics.impact.mockImplementationOnce(() => {
      throw new Error("sync");
    });
    expect(() => haptic("tap")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
