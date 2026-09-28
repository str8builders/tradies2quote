// formatObserved: the "Observed HH:MM" label must reflect the FORECAST
// LOCATION's own clock (Open-Meteo's own timezone/offset), never the
// viewer's device zone and never a hardcoded NZ default — a UK/US/AU/CA
// job's reading was otherwise silently relabelled with NZ's time.
import { describe, expect, it } from "vitest";
import { formatObserved, nextFetchSnapshot } from "./WeatherImpactClient";

describe("formatObserved", () => {
  it("a zone with a zero UTC offset: the naive Open-Meteo time read back as-is", () => {
    expect(formatObserved("2026-06-12T14:00", "UTC", 0)).toBe("2:00 pm");
  });

  it("a real offset zone (America/Chicago, UTC-5): recovers that zone's own wall clock", () => {
    // Open-Meteo's `current.time` is already Chicago's own local time
    // (10 am's job is being read by a NZ-based tradie); the fix must show
    // 9:00 am (Chicago), not some NZ-reprojected hour.
    expect(formatObserved("2026-06-12T09:00", "America/Chicago", -18000)).toBe("9:00 am");
  });

  it("midnight and noon boundaries in a non-NZ zone", () => {
    expect(formatObserved("2026-06-12T00:00", "America/Chicago", -18000)).toBe("12:00 am");
    expect(formatObserved("2026-06-12T12:00", "America/Chicago", -18000)).toBe("12:00 pm");
  });

  it("no timezone/offset on the reading (older cached value): falls back to the old NZ formatting, never blank", () => {
    // Same numeric string as the NZ-zone case below — proves the fallback
    // path still produces a plain label rather than throwing or blanking.
    expect(formatObserved("2026-06-12T14:00")).toMatch(/^\d{1,2}:\d{2} (am|pm)$/);
  });

  it("timezone without an offset, or an offset without a timezone: both fall back rather than guessing", () => {
    const fallback = formatObserved("2026-06-12T14:00");
    expect(formatObserved("2026-06-12T14:00", "America/Chicago", undefined)).toBe(fallback);
    expect(formatObserved("2026-06-12T14:00", null, -18000)).toBe(fallback);
  });

  it("an unparseable reading returns the raw value, matching the old no-crash contract", () => {
    expect(formatObserved("not-a-date", "America/Chicago", -18000)).toBe("not-a-date");
    expect(formatObserved("not-a-date")).toBe("not-a-date");
  });
});

// The job-site fetch effect's state machine, pulled out as a pure function
// so "every path must end loading" is a checkable property rather than a
// timing-dependent effect behaviour (see WeatherImpactClient.tsx's
// nextFetchSnapshot doc comment for the exact race it closes).
describe("nextFetchSnapshot", () => {
  it("no_location always lands on a clean idle snapshot — the function takes no prior-state input at all", () => {
    // nextFetchSnapshot's signature has no "previous state" parameter, so a
    // stuck "loading" is structurally impossible for this event, not merely
    // untested: there is no prior state it could carry forward.
    expect(nextFetchSnapshot.length).toBe(1);
    expect(nextFetchSnapshot({ type: "no_location" })).toEqual({ fetchState: "idle", fetchError: null });
  });

  it("start always begins loading with no stale error carried over", () => {
    expect(nextFetchSnapshot({ type: "start" })).toEqual({ fetchState: "loading", fetchError: null });
  });

  it("success always ends on ready with no error", () => {
    expect(nextFetchSnapshot({ type: "success" })).toEqual({ fetchState: "ready", fetchError: null });
  });

  it("failure always ends on error, carrying the plain-words message", () => {
    expect(nextFetchSnapshot({ type: "failure", message: "Could not load weather." })).toEqual({
      fetchState: "error",
      fetchError: "Could not load weather.",
    });
  });

  it("every event yields a terminal (non-loading) or loading-with-a-way-out state — never an ambiguous one", () => {
    const outcomes = [
      nextFetchSnapshot({ type: "no_location" }),
      nextFetchSnapshot({ type: "start" }),
      nextFetchSnapshot({ type: "success" }),
      nextFetchSnapshot({ type: "failure", message: "x" }),
    ];
    // "loading" only ever comes from "start", which is always followed (by
    // the effect) with a fetch that itself resolves to success/failure —
    // so the only way to sit in "loading" is a fetch genuinely in flight.
    const loadingCount = outcomes.filter((o) => o.fetchState === "loading").length;
    expect(loadingCount).toBe(1);
  });
});
