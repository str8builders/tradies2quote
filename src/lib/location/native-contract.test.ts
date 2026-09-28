// The iPhone app's location module (ios/App/App/T2QLocationPlugin.swift)
// against the page's side (device.ts, LocationBridge, ClockCard). Swift
// can't run here, so these read the sources: every method the page calls
// exists natively, and the audited rules stay in place.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const swift = read("ios/App/App/T2QLocationPlugin.swift");
const device = read("src/lib/location/device.ts");
const bridge = read("src/app/app/_v2/shell/LocationBridge.tsx");
const clockCard = read("src/app/app/timesheet/_components/ClockCard.tsx");

/** A Swift method, from its signature to the next method at the same indent. */
function swiftFunc(signature: string): string {
  const start = swift.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  const ends = ["\n    func ", "\n    private func ", "\n    @objc func ", "\n    // MARK:"]
    .map((marker) => swift.indexOf(marker, start + signature.length))
    .filter((i) => i > 0);
  return swift.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe("the page's T2QLocation methods all exist in the app", () => {
  const block = device.slice(device.indexOf("interface T2QLocationPlugin {"), device.indexOf("const T2QLocation = registerPlugin"));
  const jsMethods = [...block.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]).filter((name) => name !== "addListener");
  const nativeMethods = [...swift.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map((m) => m[1]);

  it("listed and implemented natively", () => {
    expect(jsMethods).toEqual(
      expect.arrayContaining(["status", "configure", "pendingEvents", "ackEvents", "drainEvents", "flush", "stopAll"]),
    );
    for (const name of jsMethods) {
      expect(nativeMethods, name).toContain(name);
      expect(swift, name).toContain(`@objc func ${name}(_ call: CAPPluginCall)`);
    }
  });

  it("the app says what it can do (api 2) and whose key it has", () => {
    expect(swift).toMatch(/private let api = 2\b/);
    expect(swiftFunc("@objc func status(")).toContain('"api": self.api');
    expect(swiftFunc("@objc func status(")).toContain('result["userId"] = user');
  });
});

describe("the audited rules", () => {
  it("work hours only gate arrivals: leaving always ends an automatic clock-in", () => {
    const siteEvent = swiftFunc("private func siteEvent(");
    const firstGuard = siteEvent.slice(siteEvent.indexOf("guard "), siteEvent.indexOf("\n", siteEvent.indexOf("guard ")));
    expect(firstGuard).not.toContain("inWorkWindow");
    expect(siteEvent).toMatch(/if type == "enter", !inWorkWindow\(Date\(\)\) \{ return \}/);
  });

  it("events carry an id and are only forgotten when the page acknowledges them", () => {
    expect(swiftFunc("private func siteEvent(")).toContain('"id": UUID().uuidString');
    const pending = swiftFunc("func pendingEvents(for userId: String?)");
    expect(pending).not.toContain("removeObject");
    expect(swiftFunc("func ackEvents(")).toContain("done.contains(id)");
  });

  it("another person signing in on the phone starts from nothing", () => {
    const configure = swiftFunc("func configure(userId: String?");
    expect(configure).toMatch(/store\.string\(forKey: Key\.user\) != userId \{\s*forget\(\)/);
    const forget = swiftFunc("private func forget()");
    for (const key of ["Key.user", "Key.buffer", "Key.events", "Key.pendingEnter", "Keychain.delete()"]) expect(forget).toContain(key);
    expect(swiftFunc("func pendingEvents(for userId: String?)")).toContain("bound != userId");
  });

  it("a refused upload key (401/403) turns tracking off", () => {
    expect(swift).toMatch(/code == 401 \|\| code == 403 \{[\s\S]{0,200}?self\.stopAll\(\)/);
  });

  it("the page ties the phone to the account, and stops it on sign-out", () => {
    expect(bridge).toMatch(/configure\(\{\s*userId: next\.userId/);
    expect(bridge).toMatch(/document\.addEventListener\("submit", onSubmit, true\)/);
    expect(bridge).toMatch(/isSignOutAction\([\s\S]{0,200}?stopNativeTracking\(\)/);
  });

  it("the route is sent before any finish (the tap, and an automatic clock-out)", () => {
    const finish = clockCard.slice(clockCard.indexOf("const finish = () =>"));
    expect(finish.indexOf("await flushRoutePoints()")).toBeGreaterThan(0);
    expect(finish.indexOf("await flushRoutePoints()")).toBeLessThan(finish.indexOf("await clockOut("));
    const auto = bridge.slice(bridge.indexOf('plan.kind === "clockOut"'));
    expect(auto.indexOf("await flushRoutePoints()")).toBeGreaterThan(0);
    expect(auto.indexOf("await flushRoutePoints()")).toBeLessThan(auto.indexOf("await clockOut("));
  });
});
