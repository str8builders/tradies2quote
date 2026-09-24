import { describe, expect, it } from "vitest";
import {
  agoText,
  businessTimeZone,
  countOf,
  dayKeyInZone,
  daysBetweenKeys,
  daysSince,
  greetingFor,
  monthKeyInZone,
  shortDay,
} from "./dates";

const at = (iso: string) => new Date(iso);

describe("dates for the new-look board", () => {
  it("time zone from the business country (or its currency), NZ by default", () => {
    expect(businessTimeZone("NZ")).toBe("Pacific/Auckland");
    expect(businessTimeZone("AU")).toBe("Australia/Sydney");
    expect(businessTimeZone("GB")).toBe("Europe/London");
    expect(businessTimeZone(null, "CAD")).toBe("America/Toronto");
    expect(businessTimeZone(null, null)).toBe("Pacific/Auckland");
  });

  it("daysSince counts whole days and never goes negative", () => {
    const now = at("2026-09-25T00:00:00Z");
    expect(daysSince("2026-09-22T00:00:00Z", now)).toBe(3);
    expect(daysSince("2026-09-24T01:00:00Z", now)).toBe(0);
    expect(daysSince("2026-09-26T00:00:00Z", now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("not a date", now)).toBeNull();
  });

  it("day and month keys follow the zone, not the server clock", () => {
    const lateUtc = at("2026-09-30T13:00:00Z"); // 2 am on 1 October in NZ (NZDT)
    expect(dayKeyInZone(lateUtc, "Pacific/Auckland")).toBe("2026-10-01");
    expect(dayKeyInZone(lateUtc, "Europe/London")).toBe("2026-09-30");
    expect(monthKeyInZone(lateUtc, "Pacific/Auckland")).toBe("2026-10");
  });

  it("calendar days between keys", () => {
    expect(daysBetweenKeys("2026-09-02", "2026-09-25")).toBe(23);
    expect(daysBetweenKeys("2026-09-25", "2026-09-25")).toBe(0);
    expect(daysBetweenKeys("2026-09-26", "2026-09-25")).toBe(-1);
    expect(daysBetweenKeys(null, "2026-09-25")).toBeNull();
  });

  it("short day names the app already uses (en-NZ 'Sept')", () => {
    expect(shortDay("2026-09-29")).toBe("Tue 29 Sept");
    expect(shortDay("2026-10-12T00:00:00+00:00")).toBe("Mon 12 Oct");
    expect(shortDay("")).toBeNull();
    expect(shortDay("2026-02-30")).toBeNull();
  });

  it("greeting by the hour where the business is", () => {
    // 22:00 UTC on 24 Sept is 10 am on 25 Sept in NZ.
    expect(greetingFor(at("2026-09-24T22:00:00Z"), "Pacific/Auckland")).toBe("Good morning");
    expect(greetingFor(at("2026-09-25T02:00:00Z"), "Pacific/Auckland")).toBe("Good afternoon");
    expect(greetingFor(at("2026-09-25T07:00:00Z"), "Pacific/Auckland")).toBe("Good evening");
    expect(greetingFor(at("2026-09-24T14:00:00Z"), "Pacific/Auckland")).toBe("Good evening");
  });

  it("plain counts", () => {
    expect(countOf(1, "day")).toBe("1 day");
    expect(countOf(4, "day")).toBe("4 days");
    expect(countOf(2, "invoice")).toBe("2 invoices");
    expect(agoText(0)).toBe("today");
    expect(agoText(1)).toBe("yesterday");
    expect(agoText(6)).toBe("6 days ago");
  });
});
