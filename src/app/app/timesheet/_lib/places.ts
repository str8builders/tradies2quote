/**
 * Where an entry's hours were: the job on the map (its site), where you
 * clocked in and finished, the address, and a way to open it in Maps.
 * Pure (the row, the sheet and the tests share it).
 */

import { addressMapsLink, mapsLink } from "@/lib/location/tiles";
import type { MapPoint } from "../../_v2/ui/StaticSiteMap";
import type { TimesheetEntry } from "./types";

export interface EntryPlace {
  /** The row's button: "Job location", or "Where you clocked in" when there's no job to show. */
  label: string;
  /** The sheet's title: "The Hemi Walker job". */
  title: string;
  /** Pins: the job site, where you clocked in, where you finished. Empty for an address alone. */
  points: MapPoint[];
  /** Which pins there are, for the key under the map. */
  kinds: { site: boolean; start: boolean; end: boolean };
  address: string | null;
  /** Opens the job (or where you clocked in) in Maps. */
  mapsHref: string;
}

/** An entry's place, or null when nothing's known about where it was. */
export function entryPlace(entry: TimesheetEntry): EntryPlace | null {
  const site = entry.site ?? null;
  const address = (site ? site.address : entry.address)?.trim() || null;
  const start = entry.clockPoints?.start ?? null;
  const end = entry.clockPoints?.end ?? null;
  const clocked = start ?? end;
  const mapsHref = site
    ? mapsLink(site, entry.clientName ?? address ?? "Job site")
    : address
      ? addressMapsLink(address)
      : clocked
        ? mapsLink(clocked, "Where you clocked in")
        : null;
  if (!mapsHref) return null;

  const job = Boolean(site || address);
  const points: MapPoint[] = [];
  if (start) points.push({ key: "start", lat: start.lat, lng: start.lng, tone: "info" });
  if (end) points.push({ key: "end", lat: end.lat, lng: end.lng, tone: "ok" });
  // The job's pin goes on top.
  if (site) points.push({ key: "site", lat: site.lat, lng: site.lng, tone: "brand" });

  const name = entry.clientName ? `The ${entry.clientName} job` : "Job location";
  return {
    label: job ? "Job location" : "Where you clocked in",
    title: job ? name : "Where you clocked in",
    points,
    kinds: { site: Boolean(site), start: Boolean(start), end: Boolean(end) },
    address,
    mapsHref,
  };
}
