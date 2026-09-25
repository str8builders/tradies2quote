// The clock card and the team map as static HTML (node).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("./location-actions", () => ({
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  pinJobSite: vi.fn(),
  saveLocationConsent: vi.fn(),
  getLocationState: vi.fn(),
  issueDeviceKey: vi.fn(),
  sendRoutePoints: vi.fn(),
}));

import { ClockCard, clockTime, elapsed } from "./_components/ClockCard";
import { DEFAULT_CONSENT, type LocationState } from "./_lib/location-types";
import { TeamMapView, ago } from "./team/TeamMapView";

const site = { clientId: "c1", name: "Hemi Walker", address: "14 Kauri St", lat: -37.6868, lng: 176.1654, radiusM: 150 };
const state = (over: Partial<LocationState> = {}): LocationState => ({
  consent: DEFAULT_CONSENT,
  open: null,
  sites: [site],
  geofences: [site],
  timeZone: "Pacific/Auckland",
  ...over,
});
const clients = [{ id: "c1", name: "Hemi Walker", email: null, address: null, phone: null }];
const card = (s: LocationState) => renderToStaticMarkup(<ClockCard state={s} clients={clients} canInvoice />);

describe("ClockCard", () => {
  it("not clocked in, location off: Start work and a way to turn location on", () => {
    const out = card(state());
    expect(out).toContain("Not clocked in");
    expect(out).toContain("Location off");
    expect(out).toContain('data-testid="clock-start"');
    expect(out).toContain("Turn on location to pin where you start and finish");
  });

  it("clocked in automatically at a site: since when, where, Finish work, no pin offer", () => {
    const out = card(
      state({
        consent: { ...DEFAULT_CONSENT, granted: true, autoClock: true },
        open: { id: "s1", startedAt: "2026-09-20T19:02:00.000Z", place: "At the Hemi Walker job", clientId: "c1", clientName: "Hemi Walker", source: "auto" },
      }),
    );
    expect(out).toContain("Working since 7:02am");
    expect(out).toContain("At the Hemi Walker job");
    expect(out).toContain("Started automatically");
    expect(out).toContain('data-testid="clock-finish"');
    expect(out).not.toContain("Save this spot as a job site");
  });

  it("clocked in away from any site with location on: offers to save the spot", () => {
    const out = card(
      state({
        consent: { ...DEFAULT_CONSENT, granted: true },
        open: { id: "s1", startedAt: "2026-09-20T19:02:00.000Z", place: "Not at a job site", clientId: null, clientName: null, source: "tap" },
      }),
    );
    expect(out).toContain("Save this spot as a job site");
    expect(out).not.toContain("Started automatically");
  });

  it("times in the business's time zone, and how long", () => {
    expect(clockTime("2026-09-20T19:02:00.000Z", "Pacific/Auckland")).toBe("7:02am");
    expect(clockTime("2026-09-21T04:30:00.000Z", "Pacific/Auckland")).toBe("4:30pm");
    // Daylight saving (NZDT, +13) from 27 September 2026.
    expect(clockTime("2026-09-27T19:02:00.000Z", "Pacific/Auckland")).toBe("8:02am");
    expect(elapsed("2026-09-20T19:02:00.000Z", Date.parse("2026-09-20T21:16:00.000Z"))).toBe("2 h 14 min");
    expect(elapsed("2026-09-20T19:02:00.000Z", Date.parse("2026-09-20T19:09:30.000Z"))).toBe("7 min");
  });
});

describe("TeamMapView", () => {
  const member = (over = {}) => ({
    userId: "u1",
    name: "Sione",
    startedAt: "2026-09-27T19:00:00.000Z",
    at: { lat: -37.6868, lng: 176.1654, time: new Date().toISOString(), place: "At the Hemi Walker job" },
    ...over,
  });

  it("nobody clocked in: says so", () => {
    expect(renderToStaticMarkup(<TeamMapView members={[]} />)).toContain("Nobody&#x27;s clocked in");
  });

  it("people on the map with their place, tiles, attribution and a Maps link", () => {
    const out = renderToStaticMarkup(<TeamMapView members={[member(), member({ userId: "u2", name: "Mere", at: null })]} />);
    expect(out).toContain('data-testid="team-map"');
    expect(out).toMatch(/src="https:\/\/tile\.openstreetmap\.org\/16\//);
    expect(out).toContain("OpenStreetMap contributors");
    expect(out).toContain("At the Hemi Walker job");
    expect(out).toContain("Location off");
    expect(out).toContain('href="https://maps.apple.com/?ll=-37.686800%2C176.165400&amp;q=Sione"');
  });

  it("how long ago, in plain words", () => {
    const now = Date.parse("2026-09-27T21:00:00.000Z");
    expect(ago("2026-09-27T20:59:40.000Z", now)).toBe("just now");
    expect(ago("2026-09-27T20:57:00.000Z", now)).toBe("3 min ago");
    expect(ago("2026-09-27T19:30:00.000Z", now)).toBe("1 h 30 min ago");
  });
});
