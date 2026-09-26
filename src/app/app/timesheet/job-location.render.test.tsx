// Seeing the job's location from the Timesheet, as static HTML (node): the
// row's "Job location" button, its sheet, the clock card's map while
// clocked in at a site, and the team map on the shared map.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/timesheet",
}));
vi.mock("./actions", () => ({ saveTimeEntry: vi.fn(), deleteTimeEntry: vi.fn(), createTimesheetInvoice: vi.fn() }));
vi.mock("./location-actions", () => ({
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  pinJobSite: vi.fn(),
  saveLocationConsent: vi.fn(),
  getLocationState: vi.fn(),
  issueDeviceKey: vi.fn(),
  sendRoutePoints: vi.fn(),
}));

import { mapsLink } from "@/lib/location/tiles";
import { ClockCard } from "./_components/ClockCard";
import { JobLocationSheet } from "./_components/JobLocationSheet";
import { TimesheetView } from "./_components/TimesheetView";
import { DEFAULT_CONSENT, type LocationState } from "./_lib/location-types";
import { entryPlace } from "./_lib/places";
import type { TimesheetData, TimesheetEntry } from "./_lib/types";
import { TeamMapView } from "./team/TeamMapView";

const HEMI = { lat: -37.6868, lng: 176.1654 };

const entry = (over: Partial<TimesheetEntry>): TimesheetEntry => ({
  id: "e1",
  workDate: "2026-09-21",
  start: "07:00",
  finish: "15:30",
  breakMinutes: 30,
  hours: 8,
  note: null,
  clientId: "c1",
  clientName: "Hemi Walker",
  userId: "me",
  person: "You",
  mine: true,
  invoice: null,
  pins: null,
  km: null,
  site: null,
  address: null,
  clockPoints: null,
  ...over,
});

const withSite = entry({
  site: { ...HEMI, address: "14 Kauri Street, Mount Maunganui" },
  clockPoints: { start: { lat: -37.6871, lng: 176.1659 }, end: { lat: -37.6866, lng: 176.165 } },
  pins: { start: "At the Hemi Walker job", end: "At the Hemi Walker job" },
});
const addressOnly = entry({ id: "e2", clientId: "c2", clientName: "K. Patel", address: "22 Totara Rd, Tauranga" });
const clockedOnly = entry({ id: "e3", clientId: null, clientName: null, clockPoints: { start: { lat: -37.7, lng: 176.2 }, end: null } });
const nowhere = entry({ id: "e4", clientId: "c3", clientName: "No Address Ltd" });

const data = (entries: TimesheetEntry[]): TimesheetData => ({
  weekStart: "2026-09-21",
  today: "2026-09-23",
  entries,
  clients: [{ id: "c1", name: "Hemi Walker", email: null, address: null, phone: null }],
  canInvoice: true,
  people: [{ userId: "me", name: "You" }],
  labourRate: 80,
  currency: "NZD",
  taxLabel: "GST",
  taxRate: 15,
  failed: false,
  travelRate: null,
});

const view = (entries: TimesheetEntry[]) => renderToStaticMarkup(<TimesheetView data={data(entries)} />);
const sheet = (e: TimesheetEntry | null) => renderToStaticMarkup(<JobLocationSheet entry={e} onClose={() => {}} />);

describe("a row's Job location", () => {
  it("a job on the map: its own button beside the row, never inside the edit button", () => {
    const out = view([withSite]);
    expect(out).toMatch(/<button[^>]*data-entry="e1"/);
    const place = out.match(/<button[^>]*data-testid="entry-place"[^>]*>/)?.[0] ?? "";
    expect(place).toContain('aria-label="Job location: Hemi Walker, Mon 21 Sept"');
    expect(place).toContain('aria-haspopup="dialog"');
    expect(place).toContain("min-h-11");
    // The edit button closes before the location button starts.
    const edit = out.indexOf('data-entry="e1"');
    expect(out.indexOf("</button>", edit)).toBeLessThan(out.indexOf('data-testid="entry-place"'));
    // The pins' words stay on the row, as before.
    expect(out).toContain("At the Hemi Walker job");
  });

  it("no map tiles until it's opened", () => {
    expect(view([withSite, addressOnly, clockedOnly])).not.toContain("tile.openstreetmap.org");
  });

  it("an address only, and clocked in without a client: still a way to see where", () => {
    const out = view([addressOnly, clockedOnly]);
    expect(out).toContain('aria-label="Job location: K. Patel, Mon 21 Sept"');
    expect(out).toContain('aria-label="Where you clocked in: no client, Mon 21 Sept"');
  });

  it("nothing known about where: no button", () => {
    expect(view([nowhere])).not.toContain("entry-place");
  });

  it("someone else's or invoiced hours can't be edited but can still be found", () => {
    const out = view([entry({ ...withSite, id: "e5", mine: false, person: "Sione", userId: "sione" })]);
    expect(out).toMatch(/<div data-entry="e5"/);
    expect(out).toContain('data-place="e5"');
  });
});

describe("the Job location sheet", () => {
  it("the job's pin, where you clocked in and finished, the address and Open in Maps", () => {
    const out = sheet(withSite);
    expect(out).toContain(">The Hemi Walker job</h2>");
    expect(out).toContain("Mon 21 Sept · 7:00am to 3:30pm · You");
    expect(out).toMatch(/src="https:\/\/tile\.openstreetmap\.org\/1\d\//);
    expect(out).toContain('aria-label="Map of the job site, where you clocked in and where you finished"');
    expect(out).toContain('data-pin="brand"');
    expect(out).toContain('data-pin="info"');
    expect(out).toContain('data-pin="ok"');
    for (const word of ["Job site", "Clocked in", "Finished"]) expect(out).toContain(word);
    expect(out).toContain("14 Kauri Street, Mount Maunganui");
    expect(out).not.toContain("isn&#x27;t on the map yet");
    const link = out.match(/<a [^>]*data-testid="open-in-maps"[^>]*>/)?.[0] ?? "";
    expect(link).toContain(`href="${mapsLink(HEMI, "Hemi Walker").replace(/&/g, "&amp;")}"`);
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
  });

  it("an address only: no map, the address, and Maps finds it from the words", () => {
    const out = sheet(addressOnly);
    expect(out).toContain(">The K. Patel job</h2>");
    expect(out).not.toContain("tile.openstreetmap.org");
    expect(out).toContain("22 Totara Rd, Tauranga");
    expect(out).toContain("isn&#x27;t on the map yet");
    expect(out).toContain('href="https://maps.apple.com/?q=22+Totara+Rd%2C+Tauranga"');
  });

  it("clocked in without a client: where you clocked in", () => {
    const out = sheet(clockedOnly);
    expect(out).toContain(">Where you clocked in</h2>");
    expect(out).toContain('data-pin="info"');
    expect(out).not.toContain('data-pin="brand"');
    expect(out).toContain('href="https://maps.apple.com/?ll=-37.700000%2C176.200000&amp;q=Where+you+clocked+in"');
  });

  it("closed: nothing drawn", () => {
    expect(sheet(null)).not.toContain("job-location");
    expect(sheet(nowhere)).not.toContain("job-location");
  });

  it("entryPlace: the right pins, labels and links", () => {
    expect(entryPlace(nowhere)).toBeNull();
    expect(entryPlace(withSite)?.points.map((p) => [p.key, p.tone])).toEqual([
      ["start", "info"],
      ["end", "ok"],
      ["site", "brand"],
    ]);
    expect(entryPlace(addressOnly)).toMatchObject({ label: "Job location", points: [], kinds: { site: false, start: false, end: false } });
    expect(entryPlace(clockedOnly)).toMatchObject({ label: "Where you clocked in", title: "Where you clocked in" });
  });
});

describe("ClockCard: the job's map while you're clocked in there", () => {
  const site = { clientId: "c1", name: "Hemi Walker", address: "14 Kauri St", lat: HEMI.lat, lng: HEMI.lng, radiusM: 150 };
  const state = (over: Partial<LocationState> = {}): LocationState => ({
    consent: { ...DEFAULT_CONSENT, granted: true },
    open: null,
    sites: [site],
    geofences: [site],
    timeZone: "Pacific/Auckland",
    ...over,
  });
  const card = (s: LocationState) =>
    renderToStaticMarkup(<ClockCard state={s} clients={[{ id: "c1", name: "Hemi Walker", email: null, address: null, phone: null }]} canInvoice />);
  const open = (clientId: string | null) => ({
    id: "s1",
    startedAt: "2026-09-20T19:02:00.000Z",
    place: clientId ? "At the Hemi Walker job" : "Not at a job site",
    clientId,
    clientName: clientId ? "Hemi Walker" : null,
    source: "auto" as const,
  });

  it("clocked in at a site: its small map, the address and Open in Maps", () => {
    const out = card(state({ open: open("c1") }));
    const map = out.slice(out.indexOf('data-testid="clock-site"'));
    expect(map).toMatch(/src="https:\/\/tile\.openstreetmap\.org\/16\//);
    expect(map).toContain('aria-label="Map of the Hemi Walker job"');
    expect(map).toContain("14 Kauri St");
    expect(map).toContain(`href="${mapsLink(HEMI, "Hemi Walker").replace(/&/g, "&amp;")}"`);
    expect(out).toContain('data-testid="clock-finish"');
    expect(out).not.toContain("Save this spot as a job site");
  });

  it("not clocked in, or clocked in away from a site: no map", () => {
    expect(card(state())).not.toContain("clock-site");
    expect(card(state({ open: open(null) }))).not.toContain("clock-site");
    expect(card(state({ open: open("c9") }))).not.toContain("clock-site");
  });
});

describe("TeamMapView on the shared map", () => {
  const member = (over = {}) => ({
    userId: "u1",
    name: "Sione",
    startedAt: "2026-09-27T19:00:00.000Z",
    at: { lat: HEMI.lat, lng: HEMI.lng, time: new Date().toISOString(), place: "At the Hemi Walker job" },
    ...over,
  });

  it("the same map: a named pin per person with a spot, the credit, 300 px tall", () => {
    const out = renderToStaticMarkup(<TeamMapView members={[member(), member({ userId: "u2", name: "Mere", at: null })]} />);
    const box = out.match(/<div[^>]*data-testid="team-map"[^>]*>/)?.[0] ?? "";
    expect(box).toContain("height:300px");
    expect(box).toContain("rounded-ui-lg border border-ui-line bg-ui-surface-2");
    expect(out.match(/data-pin="brand"/g)).toHaveLength(1);
    expect(out).toMatch(/shadow-ui-raised">Sione<\/span>/);
    expect(out).toContain("OpenStreetMap contributors");
  });

  it("clocked in but nobody's location is on: says so on the map", () => {
    const out = renderToStaticMarkup(<TeamMapView members={[member({ at: null })]} />);
    expect(out).toContain("No locations yet. People show on the map once they&#x27;ve turned location on.");
    expect(out).not.toContain("tile.openstreetmap.org");
  });
});
