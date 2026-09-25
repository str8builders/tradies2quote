// The new welcome's frames, rendered as static HTML: deterministic, the
// greeting typed in by the end, and calm (Reduce Motion) without the shake,
// dust and sparks.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NEW_WELCOME_FPS, NEW_WELCOME_FRAMES, NewWelcomeArt } from "./NewWelcomeScene";

const art = (frame: number, over: Partial<Parameters<typeof NewWelcomeArt>[0]> = {}) =>
  renderToStaticMarkup(
    <NewWelcomeArt frame={frame} fps={NEW_WELCOME_FPS} greeting="Good morning" name="Challis" today="Saturday 26 September" {...over} />,
  );

describe("NewWelcomeArt", () => {
  it("is the same picture for the same frame (no randomness)", () => {
    for (const f of [0, 30, 60, 90, 130, NEW_WELCOME_FRAMES - 1]) expect(art(f)).toBe(art(f));
  });

  it("starts empty and ends with the mark, the greeting and the chips", () => {
    const first = art(0);
    expect(first).not.toContain("Challis");
    // The chips are there but not yet shown.
    expect(first).toMatch(/opacity:0">.*Ready to quote/);
    const last = art(NEW_WELCOME_FRAMES - 1);
    expect(last).toContain("Good morning,");
    expect(last).toContain("Challis");
    expect(last).toContain("Saturday 26 September");
    expect(last).toContain("Ready to quote");
  });

  it("types the greeting in: part way through, only some of it", () => {
    const mid = art(125);
    expect(mid).toContain("Good");
    expect(mid).not.toContain("Challis");
  });

  it("the tape reads up to 2400 mm", () => {
    expect(art(60)).toMatch(/>2400(<!-- -->)? mm</);
    expect(art(30)).not.toMatch(/>2400(<!-- -->)? mm</);
  });

  it("shakes and throws sparks, except when calm", () => {
    const impact = art(86);
    expect(impact).toMatch(/translate\((?!0px, 0px)/);
    expect(impact).toContain("stroke-linecap=\"round\"");
    const calm = art(86, { calm: true });
    expect(calm).toContain("translate(0px, 0px)");
    expect(calm).not.toContain("stroke-linecap=\"round\"");
  });

  it("without a name, gets on with it", () => {
    expect(art(NEW_WELCOME_FRAMES - 1, { name: null })).toContain("Let&#x27;s get to work");
  });
});
