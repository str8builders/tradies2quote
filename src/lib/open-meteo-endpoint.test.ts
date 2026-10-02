// Open-Meteo's free hosts are for non-commercial use only; the paid plan's key
// moves every request to the "customer-" hosts. The key stays on the server.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OPEN_METEO_CREDIT, openMeteoCommercial, openMeteoUrl } from "./open-meteo-endpoint";

const params = () => new URLSearchParams({ latitude: "-37.69", longitude: "176.17" });

describe("openMeteoUrl", () => {
  it("without a key: the free hosts, as before", () => {
    expect(openMeteoUrl("forecast", params(), {})).toBe("https://api.open-meteo.com/v1/forecast?latitude=-37.69&longitude=176.17");
    expect(openMeteoUrl("geocoding", new URLSearchParams({ name: "Tauranga" }), {})).toBe(
      "https://geocoding-api.open-meteo.com/v1/search?name=Tauranga",
    );
    expect(openMeteoCommercial({})).toBe(false);
    expect(openMeteoCommercial({ OPEN_METEO_API_KEY: "   " })).toBe(false);
  });

  it("with the paid plan's key: the customer hosts, with the key", () => {
    const env = { OPEN_METEO_API_KEY: " k3y " };
    expect(openMeteoUrl("forecast", params(), env)).toBe(
      "https://customer-api.open-meteo.com/v1/forecast?latitude=-37.69&longitude=176.17&apikey=k3y",
    );
    expect(openMeteoUrl("geocoding", new URLSearchParams({ name: "Tauranga" }), env)).toBe(
      "https://customer-geocoding-api.open-meteo.com/v1/search?name=Tauranga&apikey=k3y",
    );
    expect(openMeteoCommercial(env)).toBe(true);
  });

  it("never changes the caller's parameters", () => {
    const p = params();
    openMeteoUrl("forecast", p, { OPEN_METEO_API_KEY: "k3y" });
    expect(p.has("apikey")).toBe(false);
  });
});

describe("every Open-Meteo request goes through it", () => {
  it("no other file names an Open-Meteo host", () => {
    for (const file of ["src/lib/weather-impact/open-meteo.ts", "src/lib/weather-planning/provider.ts", "src/lib/weather-planning/geocode.ts"]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).toContain("openMeteoUrl(");
      expect(source, file).not.toMatch(/https:\/\/[a-z-]*api\.open-meteo\.com/);
    }
  });

  it("the weather sheet shows the CC BY 4.0 credit", () => {
    expect(OPEN_METEO_CREDIT).toMatch(/Open-Meteo\.com/);
    expect(OPEN_METEO_CREDIT).toMatch(/CC BY 4\.0/);
    const sheet = readFileSync(join(process.cwd(), "src/app/app/_v2/shell/WeatherSheet.tsx"), "utf8");
    expect(sheet).toContain("{OPEN_METEO_CREDIT}");
  });
});
