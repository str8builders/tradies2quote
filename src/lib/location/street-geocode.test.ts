// The street lookup says why nothing came back: no street-level match
// (left for a week) or the service's trouble (tried again sooner).

import { describe, expect, it } from "vitest";
import { geocodeStreet, lookUpStreet } from "./street-geocode";

const answer = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

describe("lookUpStreet", () => {
  it("a street-level match: the point", async () => {
    const fetchImpl = answer(200, [{ lat: "-37.6868", lon: "176.1654", place_rank: 30 }]);
    expect(await lookUpStreet("14 Kauri Street, Tauranga", { country: "NZ", fetchImpl })).toEqual({
      point: { lat: -37.6868, lng: 176.1654 },
    });
    expect(await geocodeStreet("14 Kauri Street, Tauranga", { fetchImpl })).toEqual({ lat: -37.6868, lng: 176.1654 });
  });

  it("nothing, or only a town: not found", async () => {
    expect(await lookUpStreet("14 Kauri Street, Tauranga", { fetchImpl: answer(200, []) })).toEqual({ miss: "not_found" });
    const town = answer(200, [{ lat: "-37.68", lon: "176.16", place_rank: 16 }]);
    expect(await lookUpStreet("Tauranga, New Zealand", { fetchImpl: town })).toEqual({ miss: "not_found" });
    expect(await lookUpStreet("  Tga ", { fetchImpl: town })).toEqual({ miss: "not_found" });
    expect(await geocodeStreet("Tauranga, New Zealand", { fetchImpl: town })).toBeNull();
  });

  it("the service refusing or failing: an error, not a verdict on the address", async () => {
    expect(await lookUpStreet("14 Kauri Street, Tauranga", { fetchImpl: answer(429, {}) })).toEqual({ miss: "error" });
    expect(await lookUpStreet("14 Kauri Street, Tauranga", { fetchImpl: answer(503, {}) })).toEqual({ miss: "error" });
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await lookUpStreet("14 Kauri Street, Tauranga", { fetchImpl: offline })).toEqual({ miss: "error" });
  });
});
