import { describe, expect, it } from "vitest";
import { chooseLevel, type LevelInput } from "../level";

const desktop: LevelInput = {
  webgl: true,
  reducedMotion: false,
  motionPaused: false,
  saveData: false,
  effectiveType: "4g",
  deviceMemory: 8,
  cores: 8,
  coarsePointer: false,
  viewportWidth: 1440,
};

describe("chooseLevel — how much 3D a device gets", () => {
  it("a good computer gets the full world", () => {
    expect(chooseLevel(desktop)).toBe("full");
  });

  it("phones and small screens get the lighter version", () => {
    expect(chooseLevel({ ...desktop, coarsePointer: true })).toBe("lite");
    expect(chooseLevel({ ...desktop, viewportWidth: 390 })).toBe("lite");
    expect(chooseLevel({ ...desktop, effectiveType: "3g" })).toBe("lite");
    expect(chooseLevel({ ...desktop, deviceMemory: 4 })).toBe("lite");
  });

  it("an iPhone (no memory or network hints) gets the lighter version", () => {
    expect(chooseLevel({ ...desktop, deviceMemory: undefined, effectiveType: undefined, coarsePointer: true, viewportWidth: 393 })).toBe("lite");
  });

  it("stills when motion is unwanted, data is precious, 3D is off or the device is low-end", () => {
    expect(chooseLevel({ ...desktop, reducedMotion: true })).toBe("still");
    expect(chooseLevel({ ...desktop, motionPaused: true })).toBe("still");
    expect(chooseLevel({ ...desktop, saveData: true })).toBe("still");
    expect(chooseLevel({ ...desktop, webgl: false })).toBe("still");
    expect(chooseLevel({ ...desktop, effectiveType: "2g" })).toBe("still");
    expect(chooseLevel({ ...desktop, effectiveType: "slow-2g" })).toBe("still");
    expect(chooseLevel({ ...desktop, deviceMemory: 2 })).toBe("still");
    expect(chooseLevel({ ...desktop, cores: 2 })).toBe("still");
  });
});
