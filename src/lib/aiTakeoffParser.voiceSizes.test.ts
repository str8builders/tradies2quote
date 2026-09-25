import { describe, expect, it } from "vitest";
import { parseTakeoffDescription, voiceTakeoffSizesNeeded } from "./aiTakeoffParser";

// Audit item 2 — which voice/typed jobs get a blocked "size needed" line
// instead of the AI's own material counts, and what it says.
const needed = (text: string) => voiceTakeoffSizesNeeded(parseTakeoffDescription(text), text);

describe("voiceTakeoffSizesNeeded", () => {
  it("names each missing size in plain words", () => {
    expect(needed("Reclad the north wall in weatherboards")).toEqual([
      "Wall length needed — say it or type it.",
    ]);
    expect(needed("Subfloor framing for the extension")).toEqual([
      "Floor length and width needed — say them or type them.",
    ]);
  });

  it("repeats a size that can't be right, with the shared plausibility reason", () => {
    // A cladding run is the whole exterior wall run: the whole-run band (≤ 1000 m).
    expect(needed("Reclad the house in weatherboards, 1200m of wall, 2.4m high")).toEqual([
      "Cladding wall length 1200 m is more than 1000 m — check it. If you meant 1200 mm, that's 1.2 m. Say the right size or type it.",
    ]);
  });

  it("is null when the calculator can run", () => {
    expect(needed("GIB both sides on a 4m wall, 2.4m high")).toBeNull();
    expect(needed("Reclad the house in weatherboards, 62m of wall, 2.4m high")).toBeNull();
    expect(needed("Reclad the house in weatherboards, 101m of wall, 2.4m high")).toBeNull();
  });

  it("is null for upkeep of something already built, and for jobs with no calculator", () => {
    expect(needed("Paint the weatherboards on the north side")).toBeNull();
    expect(needed("Paint the GIB walls in the lounge")).toBeNull();
    expect(needed("Oil the deck")).toBeNull();
    expect(needed("Fix the hole in the wall behind the door")).toBeNull();
    expect(needed("Replace the hot water cylinder")).toBeNull();
  });

  it("still blocks upkeep wording when a build is described too", () => {
    expect(needed("Hang new GIB in the lounge and paint it")).not.toBeNull();
  });
});
