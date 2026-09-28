// LocationBridge's rules: whose upload key the phone has, what a saved
// arrival or departure does, when the phone may forget one, and which forms
// sign out.

import { describe, expect, it } from "vitest";
import {
  FRESH_DEPARTURE_MS,
  MAX_ARRIVAL_AGE_MS,
  eventOutcome,
  isSignOutAction,
  nativeApi,
  needsDeviceKey,
  planSiteEvent,
  zoneMark,
  type SiteEventState,
} from "./bridge-rules";

const NOW = Date.parse("2026-09-29T03:00:00.000Z");
const on: SiteEventState = { consent: { granted: true, autoClock: true }, open: null };
const autoAt = (clientId: string): SiteEventState => ({ ...on, open: { source: "auto", clientId } });

describe("the phone's upload key belongs to the signed-in person", () => {
  it("no key yet: make one", () => {
    expect(needsDeviceKey({ hasToken: false, api: 2 }, "u1")).toBe(true);
    expect(needsDeviceKey(null, "u1")).toBe(true);
  });

  it("a key for this person: keep it; for someone else on the same phone: a new one", () => {
    expect(needsDeviceKey({ hasToken: true, api: 2, userId: "u1" }, "u1")).toBe(false);
    expect(needsDeviceKey({ hasToken: true, api: 2, userId: "u0" }, "u1")).toBe(true);
    // A key from before keys were tied to anyone.
    expect(needsDeviceKey({ hasToken: true, api: 2 }, "u1")).toBe(true);
  });

  it("older app builds can't say whose key it is: only whether there is one", () => {
    expect(nativeApi({ hasToken: true })).toBe(1);
    expect(nativeApi(null)).toBe(1);
    expect(nativeApi({ api: 2 })).toBe(2);
    expect(needsDeviceKey({ hasToken: true }, "u1")).toBe(false);
  });
});

describe("arrivals and departures", () => {
  const enter = { id: "e1", type: "enter" as const, clientId: "c1", t: NOW - 60_000, lat: -37.68, lng: 176.16, acc: 12 };
  const exit = { id: "e2", type: "exit" as const, clientId: "c1", t: NOW - 60_000 };

  it("arriving when not clocked in clocks in at the time it happened, with where", () => {
    expect(planSiteEvent(enter, on, NOW)).toEqual({
      kind: "clockIn",
      at: enter.t,
      clientId: "c1",
      fix: { lat: -37.68, lng: 176.16, acc: 12 },
    });
  });

  it("arriving while clocked in, too long ago, or with automatic clock-in off does nothing", () => {
    expect(planSiteEvent(enter, autoAt("c2"), NOW).kind).toBe("skip");
    expect(planSiteEvent({ ...enter, t: NOW - MAX_ARRIVAL_AGE_MS - 1 }, on, NOW).kind).toBe("skip");
    expect(planSiteEvent(enter, { ...on, consent: { granted: true, autoClock: false } }, NOW).kind).toBe("skip");
    expect(planSiteEvent(enter, { ...on, consent: { granted: false, autoClock: true } }, NOW).kind).toBe("skip");
  });

  it("leaving ends an automatic clock-in at that job, whatever the time of day", () => {
    // 9:30 pm in NZ: after anyone's work hours, and it still clocks out.
    const late = { ...exit, t: Date.parse("2026-09-29T08:30:00.000Z") };
    const plan = planSiteEvent(late, autoAt("c1"), late.t + 30_000);
    expect(plan).toEqual({ kind: "clockOut", at: late.t, fix: null, askFix: true });
  });

  it("a departure handed over late doesn't take where the phone is now as the finish", () => {
    const plan = planSiteEvent(exit, autoAt("c1"), exit.t + FRESH_DEPARTURE_MS + 1);
    expect(plan).toEqual({ kind: "clockOut", at: exit.t, fix: null, askFix: false });
  });

  it("leaving a different job, or a clock-in you tapped, doesn't clock you out", () => {
    expect(planSiteEvent(exit, autoAt("c2"), NOW).kind).toBe("skip");
    expect(planSiteEvent(exit, { ...on, open: { source: "tap", clientId: "c1" } }, NOW).kind).toBe("skip");
    expect(planSiteEvent(exit, on, NOW).kind).toBe("skip");
  });
});

describe("when the phone may forget a saved arrival or departure", () => {
  it("only once the server has it, or it will never apply", () => {
    expect(eventOutcome({ ok: true })).toBe("ack");
    expect(eventOutcome({ ok: false })).toBe("ack"); // e.g. already clocked in
    expect(eventOutcome({ ok: false, retry: false })).toBe("ack");
  });

  it("kept for another go when there was no answer or a hiccup", () => {
    expect(eventOutcome(null)).toBe("retry");
    expect(eventOutcome(undefined)).toBe("retry");
    expect(eventOutcome({ ok: false, retry: true })).toBe("retry");
  });
});

describe("sign-out forms", () => {
  const page = "https://tradies2quote.com/app/more";

  it("the app's sign-out buttons post to /auth/signout", () => {
    expect(isSignOutAction("/auth/signout", page)).toBe(true);
    expect(isSignOutAction("https://tradies2quote.com/auth/signout", page)).toBe(true);
    expect(isSignOutAction("/auth/signout/", page)).toBe(true);
  });

  it("anything else isn't", () => {
    expect(isSignOutAction(null, page)).toBe(false);
    expect(isSignOutAction("", page)).toBe(false);
    expect(isSignOutAction("/app/timesheet", page)).toBe(false);
    expect(isSignOutAction("/auth/signout-help", page)).toBe(false);
    expect(isSignOutAction("https://elsewhere.example/auth/signout", page)).toBe(false);
  });
});

describe("the time zone is offered once per account and zone", () => {
  it("marks both", () => {
    expect(zoneMark("u1", "Australia/Perth")).toBe("u1 Australia/Perth");
    expect(zoneMark("u1", "Australia/Perth")).not.toBe(zoneMark("u2", "Australia/Perth"));
  });
});
