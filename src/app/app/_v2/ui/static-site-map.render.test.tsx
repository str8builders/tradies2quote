// The shared small map as static HTML (node): tiles, pins, the credit.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaticSiteMap, type MapPoint } from "./StaticSiteMap";

const site: MapPoint = { key: "site", lat: -37.6868, lng: 176.1654 };
const clockedIn: MapPoint = { key: "start", lat: -37.6875, lng: 176.1661, tone: "info" };

describe("StaticSiteMap", () => {
  it("one pin: street-level tiles around it, the pin, and the OpenStreetMap credit", () => {
    const out = renderToStaticMarkup(<StaticSiteMap points={[site]} height={140} testId="the-map" label="Map of the Hemi Walker job" />);
    expect(out).toContain('data-testid="the-map"');
    expect(out).toContain("height:140px");
    const tiles = out.match(/<img [^>]*src="https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png"/g) ?? [];
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    expect(out.match(/data-pin="/g)).toHaveLength(1);
    expect(out).toContain('data-pin="brand"');
    expect(out).toContain("text-ui-brand-text");
    expect(out).toContain('role="img" aria-label="Map of the Hemi Walker job"');
    expect(out).toContain('href="https://www.openstreetmap.org/copyright"');
    expect(out).toContain("OpenStreetMap contributors");
  });

  it("several pins, each in its colour, with a name over the pin when given", () => {
    const out = renderToStaticMarkup(
      <StaticSiteMap
        points={[clockedIn, { key: "end", lat: -37.69, lng: 176.17, tone: "ok" }, { ...site, label: "Sione" }]}
        height={300}
      />,
    );
    expect(out.match(/data-pin="/g)).toHaveLength(3);
    expect(out).toContain("text-ui-info");
    expect(out).toContain("text-ui-ok");
    expect(out).toMatch(/shadow-ui-raised">Sione<\/span>/);
    // No label, no role: just a picture beside the words that say where.
    expect(out).not.toContain('role="img"');
  });

  it("nothing to show: the words instead, and no tiles", () => {
    const out = renderToStaticMarkup(<StaticSiteMap points={[]} height={200} empty="No locations yet." />);
    expect(out).toContain("No locations yet.");
    expect(out).not.toContain("tile.openstreetmap.org");
  });
});
