import { describe, expect, it } from "vitest";
import OgImage, { alt, contentType, size } from "./opengraph-image";

// The share card used to claim "Under 60 seconds" (never timed on a real
// quote — see src/app/_components/jobsite/story.ts) and "Built for NZ, AU,
// UK, US, CA" (the FAQ says the current launch is NZ only). Both claims
// live only in `alt` (and the card's own JSX, which isn't practical to
// inspect from a PNG in a test) — pin the text here so they can't drift
// back in.
describe("homepage share card — no claim the app can't back up", () => {
  it("does not claim an untimed speed, and matches the FAQ's NZ-only launch", () => {
    expect(alt).not.toMatch(/\d+\s*seconds?|under a minute/i);
    expect(alt).not.toMatch(/NZ,?\s*AU,?\s*UK,?\s*US,?\s*CA/i);
    expect(alt).toBe("tradies2Quote — Voice in. Quote out. Your final say.");
  });

  it("still renders an image response", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(OgImage()).toBeTruthy();
  });
});
