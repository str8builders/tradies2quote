import { describe, expect, it } from "vitest";
import { fitView, mapsLink, placeOnView, project, tilesFor } from "./tiles";

const tauranga = { lat: -37.6868, lng: 176.1654 };
const mount = { lat: -37.6389, lng: 176.1856 };

describe("tile map", () => {
  it("projects like Web Mercator (0,0 is the middle of the world)", () => {
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 });
    const p = project({ lat: 0, lng: 180 }, 1);
    expect(p.x).toBe(512);
  });
  it("one person: street level, centred", () => {
    const view = fitView([tauranga], 360, 300)!;
    expect(view.zoom).toBe(16);
    const at = placeOnView(tauranga, view);
    expect(Math.abs(at.left - 180)).toBeLessThanOrEqual(1);
    expect(Math.abs(at.top - 150)).toBeLessThanOrEqual(1);
  });
  it("two people 5 km apart: zoomed out until both fit with a margin", () => {
    const view = fitView([tauranga, mount], 360, 300)!;
    expect(view.zoom).toBeLessThan(16);
    for (const p of [tauranga, mount]) {
      const at = placeOnView(p, view);
      expect(at.left).toBeGreaterThanOrEqual(36);
      expect(at.left).toBeLessThanOrEqual(324);
      expect(at.top).toBeGreaterThanOrEqual(36);
      expect(at.top).toBeLessThanOrEqual(264);
    }
  });
  it("covers the box with tiles and nothing else", () => {
    const view = fitView([tauranga], 360, 300)!;
    const tiles = tilesFor(view);
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    expect(tiles.length).toBeLessThanOrEqual(6);
    for (const t of tiles) {
      expect(t.src).toMatch(/^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/);
      expect(t.left).toBeGreaterThan(-256);
      expect(t.left).toBeLessThan(360);
    }
    expect(fitView([], 360, 300)).toBeNull();
  });
  it("opens a spot in Maps", () => {
    expect(mapsLink(tauranga, "Sione")).toBe("https://maps.apple.com/?ll=-37.686800%2C176.165400&q=Sione");
  });
});
