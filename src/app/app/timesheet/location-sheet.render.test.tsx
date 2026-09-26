// The location sheet: plain words, what iOS will ask, and what happens after.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ on: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("./location-actions", () => ({ saveLocationConsent: vi.fn() }));
vi.mock("@/lib/location/device", () => ({
  hasNativeLocation: () => native.on,
  nativeLocation: { requestAlways: vi.fn(), requestWhenInUse: vi.fn(), openSettings: vi.fn() },
}));

import { LocationForm, permissionOutcome } from "./_components/LocationSheet";
import { DEFAULT_CONSENT } from "./_lib/location-types";

const form = (over: Partial<typeof DEFAULT_CONSENT>, canInvoice = true) =>
  renderToStaticMarkup(<LocationForm consent={{ ...DEFAULT_CONSENT, ...over }} canInvoice={canInvoice} onDone={() => {}} />);

describe("permissionOutcome", () => {
  it("location on without automatic clock-in: while-using is enough", () => {
    expect(permissionOutcome(false, "whenInUse")).toBe("done");
    expect(permissionOutcome(false, "always")).toBe("done");
  });
  it("automatic clock-in needs Always, or it shows the Settings steps", () => {
    expect(permissionOutcome(true, "always")).toBe("done");
    expect(permissionOutcome(true, "whenInUse")).toBe("always");
    expect(permissionOutcome(true, "notDetermined")).toBe("always");
  });
  it("location refused in iOS: the Settings steps, whatever was asked", () => {
    expect(permissionOutcome(false, "denied")).toBe("off");
    expect(permissionOutcome(true, "restricted")).toBe("off");
  });
});

describe("LocationForm", () => {
  it("says what's kept and who sees it, with no talk of bosses", () => {
    const owner = form({ granted: true });
    expect(owner).toContain("to work out kilometres for travel");
    expect(owner).toContain("You see where your team is while they&#x27;re clocked in");
    const member = form({ granted: true }, false);
    expect(member).toContain("the business owner sees your hours and where you are while you&#x27;re clocked in");
    expect(`${owner}${member}`).not.toMatch(/boss/i);
  });

  it("in the iPhone app, location on asks for While using; automatic clock-in explains Always", () => {
    native.on = true;
    expect(form({ granted: true })).toContain("iPhone will ask to use your location while you&#x27;re using the app.");
    const auto = form({ granted: true, autoClock: true });
    expect(auto).toContain("allow location \u201CAlways\u201D");
    expect(auto).toContain("spot when you arrive at and leave a job with");
  });

  it("in a browser there's no iOS note and automatic clock-in points to the iPhone app", () => {
    native.on = false;
    const out = form({ granted: true });
    expect(out).not.toContain('data-testid="location-ios-note"');
    expect(out).toContain("In the Tradies2Quote iPhone app.");
    native.on = true;
  });
});
