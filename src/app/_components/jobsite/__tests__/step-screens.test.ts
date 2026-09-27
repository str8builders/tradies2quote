import { describe, expect, it } from "vitest";
import { CLIP_VERSION, clipSrc, firstFrameSrc, lastFrameSrc } from "../canvas/step-screens";
import { FEATURES, ROOMS, T2QCAL_STOP } from "../story";

describe("clip addresses", () => {
  it("a re-rendered clip gets a new address, so a day-old cached copy isn't played", () => {
    expect(clipSrc("request", 600)).toBe("/jobsite/screens/request-600.mp4?v=2");
    expect(firstFrameSrc("request")).toBe("/jobsite/screens/request-first.webp?v=2");
    expect(lastFrameSrc("request")).toBe("/jobsite/screens/request.webp?v=2");
  });

  it("the others keep their plain file names", () => {
    expect(clipSrc("talk", 420)).toBe("/jobsite/screens/talk-420.mp4");
    expect(firstFrameSrc("supplier")).toBe("/jobsite/screens/supplier-first.webp");
  });

  it("only versions clips the site still plays", () => {
    const clips = new Set<string>([...ROOMS.map((r) => r.id), ...FEATURES.map((f) => f.id), T2QCAL_STOP.id]);
    for (const id of Object.keys(CLIP_VERSION)) expect(clips.has(id), id).toBe(true);
  });
});
