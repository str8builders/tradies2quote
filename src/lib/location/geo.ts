/**
 * Location maths for the timesheet: distances, kilometres driven from a
 * route, the nearest job site, and the hours automatic clock-in may run in.
 * Pure (shared by the server, the web page and the tests).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TrackPoint extends LatLng {
  /** ms since the epoch */
  t: number;
  /** horizontal accuracy in metres */
  acc?: number | null;
}

export interface JobSite extends LatLng {
  clientId: string;
  name: string;
  address: string | null;
  radiusM: number;
}

const EARTH_M = 6371008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

/** Fixes worse than this are too rough to count towards a route. */
export const MAX_TRACK_ACCURACY_M = 50;
/** Moves shorter than this are GPS jitter while standing still. */
export const MIN_STEP_M = 25;
/** Faster than this (~200 km/h) between two fixes is a GPS jump. */
export const MAX_SPEED_MS = 55;

/**
 * Kilometres travelled along a route (earliest first), to 0.1 km. Rough
 * fixes, jitter and impossible jumps are left out, so a day on one site
 * reads 0 km, not the wobble of the GPS.
 */
export function routeKm(points: readonly TrackPoint[]): number {
  const good = points
    .filter((p) => isValidLatLng(p) && Number.isFinite(p.t) && (p.acc == null || p.acc <= MAX_TRACK_ACCURACY_M))
    .slice()
    .sort((a, b) => a.t - b.t);
  let metres = 0;
  let last: TrackPoint | null = null;
  for (const p of good) {
    if (!last) {
      last = p;
      continue;
    }
    const step = distanceM(last, p);
    if (step < MIN_STEP_M) continue;
    const seconds = Math.max(1, (p.t - last.t) / 1000);
    if (step / seconds > MAX_SPEED_MS) continue;
    metres += step;
    last = p;
  }
  return Math.round(metres / 100) / 10;
}

/** The closest site the point is inside (its radius plus the fix's accuracy, up to 100 m), or null. */
export function siteAt(point: LatLng & { acc?: number | null }, sites: readonly JobSite[]): JobSite | null {
  if (!isValidLatLng(point)) return null;
  let best: { site: JobSite; d: number } | null = null;
  const slack = Math.min(100, Math.max(0, point.acc ?? 0));
  for (const site of sites) {
    const d = distanceM(point, site);
    if (d <= site.radiusM + slack && (!best || d < best.d)) best = { site, d };
  }
  return best?.site ?? null;
}

/** The nearest site and how far, for "Not at a job site (Hemi Walker's is 2.3 km away)". */
export function nearestSite(point: LatLng, sites: readonly JobSite[]): { site: JobSite; metres: number } | null {
  if (!isValidLatLng(point)) return null;
  let best: { site: JobSite; metres: number } | null = null;
  for (const site of sites) {
    const metres = distanceM(point, site);
    if (!best || metres < best.metres) best = { site, metres };
  }
  return best;
}

/** 850 → "850 m", 2300 → "2.3 km", 12400 → "12 km". */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "";
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  const km = metres / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** The words for where a pin is: "At the Hemi Walker job" or "Not at a job site". */
export function placeLabel(point: LatLng & { acc?: number | null }, sites: readonly JobSite[]): { text: string; site: JobSite | null } {
  const site = siteAt(point, sites);
  if (site) return { text: `At the ${site.name} job`, site };
  const near = nearestSite(point, sites);
  return {
    text: near ? `Not at a job site (the ${near.site.name} job is ${formatDistance(near.metres)} away)` : "Not at a job site",
    site: null,
  };
}

export interface WorkWindow {
  /** "05:00" */
  start: string;
  /** "19:00" */
  end: string;
  /** 0 = Sunday … 6 = Saturday */
  days: readonly number[];
}

/**
 * Inside the hours automatic clock-in may run (the person's own setting), for
 * a local weekday and minutes after midnight in the business's time zone.
 */
export function inWorkWindow(window: WorkWindow, weekday: number, minutes: number): boolean {
  const toMin = (v: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(v);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  const start = toMin(window.start);
  const end = toMin(window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  return window.days.includes(weekday) && minutes >= start && minutes < end;
}
