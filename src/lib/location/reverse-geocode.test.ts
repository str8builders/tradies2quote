import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { townAt, townFromAddress } from "./reverse-geocode";

describe("naming the town for the weather", () => {
  it("prefers the town people use over the suburb or county", () => {
    expect(townFromAddress({ suburb: "Mount Maunganui", city: "Tauranga" })).toBe("Tauranga");
    expect(townFromAddress({ town: "Te Puke", county: "Western Bay of Plenty District" })).toBe("Te Puke");
    expect(townFromAddress({ suburb: "Ponsonby" })).toBe("Ponsonby");
    expect(townFromAddress({})).toBeNull();
    expect(townFromAddress(null)).toBeNull();
  });

  it("sends only the rounded spot and says who's asking", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ address: { city: "Tauranga" } }), { status: 200 }));
    expect(await townAt(-37.6861234, 176.1654321, fetchImpl as unknown as typeof fetch)).toBe("Tauranga");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("lat=-37.69");
    expect(url).toContain("lon=176.17");
    expect(url).not.toContain("37.686");
    expect(new Headers(init.headers).get("User-Agent")).toContain("Tradies2Quote");
  });

  it("never fails the weather: errors and bad spots give no town", async () => {
    const down = vi.fn(async () => new Response("", { status: 503 }));
    expect(await townAt(-37.69, 176.17, down as unknown as typeof fetch)).toBeNull();
    const throws = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await townAt(-37.69, 176.17, throws as unknown as typeof fetch)).toBeNull();
    expect(await townAt(200, 0, down as unknown as typeof fetch)).toBeNull();
  });
});
