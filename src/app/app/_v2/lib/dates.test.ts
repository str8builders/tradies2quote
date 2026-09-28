import { describe, expect, it } from "vitest";
import {
  agoText,
  businessTimeZone,
  businessZoneFrom,
  countOf,
  dayKeyInZone,
  daysBetweenKeys,
  daysSince,
  greetingFor,
  isIanaZone,
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

  it("the business's own saved zone wins when it's real and in its country", () => {
    expect(businessTimeZone("AU", "AUD", "Australia/Perth")).toBe("Australia/Perth");
    expect(businessTimeZone("AU", null, "Australia/Brisbane")).toBe("Australia/Brisbane");
    expect(businessTimeZone("US", "USD", "America/Denver")).toBe("America/Denver");
    expect(businessTimeZone("US", null, "Pacific/Honolulu")).toBe("Pacific/Honolulu");
    expect(businessTimeZone(null, "CAD", "America/Vancouver")).toBe("America/Vancouver");
    expect(businessTimeZone("NZ", "NZD", "Pacific/Chatham")).toBe("Pacific/Chatham");
    expect(businessTimeZone("UK", "GBP", "Europe/London")).toBe("Europe/London");
  });

  it("a saved zone outside the country, made up, or blank: the country's zone", () => {
    // The country changed since (or a stray write): the country's zone.
    expect(businessTimeZone("NZ", "NZD", "Australia/Perth")).toBe("Pacific/Auckland");
    expect(businessTimeZone("AU", "AUD", "Pacific/Auckland")).toBe("Australia/Sydney");
    expect(businessTimeZone("CA", "CAD", "Pacific/Honolulu")).toBe("America/Toronto");
    expect(businessTimeZone("AU", "AUD", "Australia/Nowhere")).toBe("Australia/Sydney");
    expect(businessTimeZone("AU", "AUD", "+08:00")).toBe("Australia/Sydney");
    expect(businessTimeZone("AU", "AUD", "")).toBe("Australia/Sydney");
    expect(businessTimeZone("AU", "AUD", null)).toBe("Australia/Sydney");
  });

  it("a phone's zone is kept for the business only when it's in the business's country", () => {
    expect(businessZoneFrom("Australia/Adelaide", "AU", "AUD")).toBe("Australia/Adelaide");
    expect(businessZoneFrom("America/Los_Angeles", "US", "USD")).toBe("America/Los_Angeles");
    expect(businessZoneFrom("America/Edmonton", null, "CAD")).toBe("America/Edmonton");
    // On holiday: Bali isn't a Kiwi business's zone, and neither is Sydney.
    expect(businessZoneFrom("Asia/Makassar", "NZ", "NZD")).toBeNull();
    expect(businessZoneFrom("Australia/Sydney", "NZ", "NZD")).toBeNull();
    expect(businessZoneFrom("Europe/Paris", "UK", "GBP")).toBeNull();
    expect(businessZoneFrom("UTC", "NZ", "NZD")).toBeNull();
    expect(businessZoneFrom(undefined, "NZ", "NZD")).toBeNull();
  });

  it("zone names: real IANA ones only", () => {
    expect(isIanaZone("Pacific/Auckland")).toBe(true);
    expect(isIanaZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isIanaZone("America/Port-au-Prince")).toBe(true);
    expect(isIanaZone("Pacific/Nowhere")).toBe(false);
    expect(isIanaZone("UTC")).toBe(false);
    expect(isIanaZone("+13:00")).toBe(false);
    expect(isIanaZone("Pacific/Auckland; drop table")).toBe(false);
    expect(isIanaZone(42)).toBe(false);
    expect(isIanaZone(`Pacific/${"A".repeat(80)}`)).toBe(false);
  });

  it("Perth's day and hours are Perth's, not Sydney's", () => {
    // 1 am on Tuesday in Sydney (AEST) is still 11 pm on Monday in Perth;
    // 10 am in Perth is already noon in Sydney.
    const late = at("2026-09-28T15:00:00Z");
    expect(dayKeyInZone(late, businessTimeZone("AU", "AUD"))).toBe("2026-09-29");
    expect(dayKeyInZone(late, businessTimeZone("AU", "AUD", "Australia/Perth"))).toBe("2026-09-28");
    expect(greetingFor(at("2026-09-28T02:00:00Z"), businessTimeZone("AU", "AUD", "Australia/Perth"))).toBe("Good morning");
    expect(greetingFor(at("2026-09-28T02:00:00Z"), businessTimeZone("AU", "AUD"))).toBe("Good afternoon");
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
