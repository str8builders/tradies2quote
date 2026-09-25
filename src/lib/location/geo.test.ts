import { describe, expect, it } from "vitest";
import {
  distanceM,
  formatDistance,
  inWorkWindow,
  isValidLatLng,
  nearestSite,
  placeLabel,
  routeKm,
  siteAt,
  type JobSite,
  type TrackPoint,
} from "./geo";

const kauri: JobSite = { clientId: "c1", name: "Hemi Walker", address: "14 Kauri St", lat: -37.6868, lng: 176.1654, radiusM: 150 };
const patel: JobSite = { clientId: "c2", name: "K. Patel", address: null, lat: -37.7, lng: 176.25, radiusM: 150 };

describe("distance", () => {
  it("matches known distances", () => {
    // Tauranga CBD to Mount Maunganui: about 5.1 km as the crow flies.
    const d = distanceM({ lat: -37.6861, lng: 176.1667 }, { lat: -37.6389, lng: 176.1856 });
    expect(d).toBeGreaterThan(5000);
    expect(d).toBeLessThan(5600);
    expect(distanceM(kauri, kauri)).toBe(0);
  });
  it("rejects nonsense coordinates", () => {
    expect(isValidLatLng({ lat: 0, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: NaN, lng: 1 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
    expect(isValidLatLng({ lat: -37.6, lng: 176.1 })).toBe(true);
  });
});

describe("route km", () => {
  const at = (i: number, lat: number, lng: number, acc = 8): TrackPoint => ({ t: 1_000_000 + i * 60_000, lat, lng, acc });
  it("adds up a drive", () => {
    // ~1.11 km per 0.01 degree of latitude.
    const drive = [at(0, -37.68, 176.16), at(1, -37.69, 176.16), at(2, -37.70, 176.16), at(3, -37.71, 176.16)];
    expect(routeKm(drive)).toBeCloseTo(3.3, 1);
  });
  it("a day on one site is 0 km, not GPS wobble", () => {
    const wobble = Array.from({ length: 60 }, (_, i) => at(i, -37.6868 + (i % 2 ? 0.0001 : -0.0001), 176.1654));
    expect(routeKm(wobble)).toBe(0);
  });
  it("drops rough fixes and impossible jumps", () => {
    const pts = [at(0, -37.68, 176.16), { t: 1_000_000 + 10_000, lat: -36.8, lng: 174.7, acc: 8 }, at(1, -37.69, 176.16), at(2, -37.70, 176.16, 400)];
    expect(routeKm(pts)).toBeCloseTo(1.1, 1);
    expect(routeKm([])).toBe(0);
  });
  it("sorts by time first", () => {
    const drive = [at(2, -37.70, 176.16), at(0, -37.68, 176.16), at(1, -37.69, 176.16)];
    expect(routeKm(drive)).toBeCloseTo(2.2, 1);
  });
});

describe("job sites", () => {
  it("inside a site's radius (with some GPS slack)", () => {
    expect(siteAt({ lat: -37.6868, lng: 176.1654 }, [kauri, patel])?.clientId).toBe("c1");
    expect(siteAt({ lat: -37.6868 + 0.0015, lng: 176.1654 }, [kauri])).toBeNull(); // ~167 m
    expect(siteAt({ lat: -37.6868 + 0.0015, lng: 176.1654, acc: 30 }, [kauri])?.clientId).toBe("c1");
    expect(siteAt({ lat: -37.6868 + 0.0015, lng: 176.1654, acc: 5000 }, [kauri])?.clientId).toBe("c1"); // slack capped at 100 m
    expect(siteAt({ lat: -37.6868 + 0.003, lng: 176.1654, acc: 5000 }, [kauri])).toBeNull();
  });
  it("labels a pin in plain words", () => {
    expect(placeLabel({ lat: -37.6868, lng: 176.1654 }, [kauri]).text).toBe("At the Hemi Walker job");
    expect(placeLabel({ lat: -37.70, lng: 176.1654 }, [kauri]).text).toBe("Not at a job site (the Hemi Walker job is 1.5 km away)");
    expect(placeLabel({ lat: -37.70, lng: 176.1654 }, []).text).toBe("Not at a job site");
    expect(nearestSite({ lat: -37.7, lng: 176.25 }, [kauri, patel])?.site.clientId).toBe("c2");
  });
  it("writes distances simply", () => {
    expect(formatDistance(847)).toBe("850 m");
    expect(formatDistance(2300)).toBe("2.3 km");
    expect(formatDistance(12400)).toBe("12 km");
  });
});

describe("work window", () => {
  const w = { start: "05:00", end: "19:00", days: [1, 2, 3, 4, 5, 6] };
  it("Monday to Saturday, 5 am to 7 pm", () => {
    expect(inWorkWindow(w, 1, 7 * 60)).toBe(true);
    expect(inWorkWindow(w, 0, 7 * 60)).toBe(false);
    expect(inWorkWindow(w, 1, 4 * 60 + 59)).toBe(false);
    expect(inWorkWindow(w, 1, 19 * 60)).toBe(false);
    expect(inWorkWindow({ ...w, end: "04:00" }, 1, 7 * 60)).toBe(false);
  });
});
