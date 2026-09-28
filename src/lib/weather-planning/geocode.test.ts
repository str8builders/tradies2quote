import { describe, expect, it } from "vitest";
import { candidateQueries, geocodeAddress, openMeteoCountryCode } from "./geocode";

describe("candidateQueries", () => {
  it("drops the street segment and strips NZ postcodes glued to the locality", () => {
    // The real-world shape that broke the weather sweep: open-meteo's
    // place-name search returns nothing for "Mount Maunganui 3116".
    expect(candidateQueries("12 Beach Rd, Mount Maunganui 3116")).toEqual([
      "Mount Maunganui",
    ]);
  });

  it("keeps locality, region pairs coarsest-first", () => {
    expect(
      candidateQueries("12 Example Street, Upper Hutt, Wellington, NZ"),
    ).toEqual(["Upper Hutt, Wellington", "Upper Hutt", "Wellington"]);
  });

  it("survives an address that is only a locality", () => {
    expect(candidateQueries("Tauranga")).toEqual(["Tauranga"]);
  });

  it("does not strip digits that are part of the place name itself", () => {
    // A trailing 4-digit token is a postcode; an embedded number is not.
    expect(candidateQueries("1 Main St, Palmerston North 4410")).toEqual([
      "Palmerston North",
    ]);
  });
});

describe("openMeteoCountryCode", () => {
  it("maps the app's UK to Open-Meteo's ISO code GB", () => {
    expect(openMeteoCountryCode("UK")).toBe("GB");
    expect(openMeteoCountryCode("uk")).toBe("GB");
  });

  it("passes the app's other country codes through unchanged", () => {
    expect(openMeteoCountryCode("NZ")).toBe("NZ");
    expect(openMeteoCountryCode("au")).toBe("AU");
    expect(openMeteoCountryCode("US")).toBe("US");
    expect(openMeteoCountryCode("CA")).toBe("CA");
  });

  it("ignores anything that isn't a plausible 2-letter code, rather than sending it", () => {
    expect(openMeteoCountryCode(null)).toBeNull();
    expect(openMeteoCountryCode(undefined)).toBeNull();
    expect(openMeteoCountryCode("")).toBeNull();
    expect(openMeteoCountryCode("  ")).toBeNull();
    expect(openMeteoCountryCode("New Zealand")).toBeNull();
    expect(openMeteoCountryCode("NZL")).toBeNull();
  });
});

// The bug this closes: a town name that exists in more than one of our
// markets ("Richmond" is in NZ, the UK, the US and Canada) could resolve to
// the wrong country when the business's own country was never passed to the
// geocoder. Mocked fetchImpl: only returns a countryCode-scoped hit when the
// request actually carries that filter, so these tests fail if the country
// hint stops being sent.
describe("geocodeAddress: prefers a match in the business's own country", () => {
  const hit = (name: string, country: string, lat: number, lon: number) => ({
    latitude: lat,
    longitude: lon,
    timezone: "UTC",
    name,
    country,
  });

  function fakeGeocoder(calls: string[]): typeof fetch {
    return async (url) => {
      const href = String(url);
      calls.push(href);
      const params = new URL(href).searchParams;
      const name = params.get("name");
      const countryCode = params.get("countryCode");
      let results: unknown[] = [];
      if (name === "Richmond" && countryCode === "NZ") {
        results = [hit("Richmond", "New Zealand", -41.34, 173.18)];
      } else if (name === "Richmond" && countryCode === "GB") {
        results = [hit("Richmond", "United Kingdom", 51.46, -0.3)];
      } else if (name === "Richmond" && !countryCode) {
        // Unfiltered: the geocoder's own top (population-ranked) hit happens
        // to be the US one — the exact ambiguity this fix resolves.
        results = [hit("Richmond", "United States", 37.55, -77.46)];
      }
      return new Response(JSON.stringify({ results }), { status: 200 });
    };
  }

  it("a same-country match wins over the geocoder's own top (unfiltered) hit", async () => {
    const calls: string[] = [];
    const geo = await geocodeAddress({ address: "Richmond", country: "NZ", fetchImpl: fakeGeocoder(calls) });
    expect(geo?.matchedName).toBe("Richmond, New Zealand");
    expect(calls[0]).toContain("countryCode=NZ");
  });

  it("the app's UK sends Open-Meteo's GB and finds the UK Richmond, not the US one", async () => {
    const calls: string[] = [];
    const geo = await geocodeAddress({ address: "Richmond", country: "UK", fetchImpl: fakeGeocoder(calls) });
    expect(geo?.matchedName).toBe("Richmond, United Kingdom");
    expect(calls[0]).toContain("countryCode=GB");
  });

  it("no country hint: unchanged behaviour — no countryCode param is sent", async () => {
    const calls: string[] = [];
    const geo = await geocodeAddress({ address: "Richmond", fetchImpl: fakeGeocoder(calls) });
    expect(geo?.matchedName).toBe("Richmond, United States");
    expect(calls[0]).not.toContain("countryCode");
  });

  it("a country hint with no match there still falls back, rather than reporting unknown", async () => {
    const calls: string[] = [];
    // No seeded "AU" hit above, so the filtered pass finds nothing for every
    // candidate before the unfiltered fallback pass runs.
    const geo = await geocodeAddress({ address: "Richmond", country: "AU", fetchImpl: fakeGeocoder(calls) });
    expect(geo?.matchedName).toBe("Richmond, United States");
    expect(calls.some((c) => c.includes("countryCode=AU"))).toBe(true);
    expect(calls.some((c) => !c.includes("countryCode"))).toBe(true);
  });
});
