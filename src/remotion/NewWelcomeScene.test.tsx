// The new welcome's frames, rendered as static HTML: deterministic, the
// greeting typed in by the end, and calm (Reduce Motion) without the shake,
// dust and sparks.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NEW_WELCOME_FPS, NEW_WELCOME_FRAMES, NewWelcomeArt, fitFontSize } from "./NewWelcomeScene";

const art = (frame: number, over: Partial<Parameters<typeof NewWelcomeArt>[0]> = {}) =>
  renderToStaticMarkup(
    <NewWelcomeArt frame={frame} fps={NEW_WELCOME_FPS} greeting="Good morning" name="Challis" today="Saturday 26 September" {...over} />,
  );
/** What can be SEEN: the not-yet-typed letters are laid out but hidden (so the line never moves). */
const visible = (html: string) => html.replace(/<span style="visibility:hidden">[^<]*<\/span>/g, "");

describe("NewWelcomeArt", () => {
  it("is the same picture for the same frame (no randomness)", () => {
    for (const f of [0, 30, 60, 90, 130, NEW_WELCOME_FRAMES - 1]) expect(art(f)).toBe(art(f));
  });

  it("starts empty and ends with the mark, the greeting and the chips", () => {
    const first = art(0);
    expect(visible(first)).not.toContain("Challis");
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
    expect(visible(mid)).toContain("Good");
    expect(visible(mid)).not.toContain("Challis");
  });

  it("types in place: the whole line is laid out from the start, on one line, and the caret takes no room", () => {
    // Every frame lays out the same full text, so nothing re-centres or wraps as it types.
    for (const f of [112, 125, 140, 160]) {
      const html = art(f, { name: "STR8 Builders" });
      expect(html).toContain("STR8 Builders".slice(0, 3));
      expect(html.match(/white-space:nowrap/g)?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("sizes a long name to fit the line", () => {
    expect(fitFontSize("STR8 Builders", 72)).toBeLessThan(72);
    expect(fitFontSize("Challis", 72)).toBe(72);
    expect(fitFontSize("Good afternoon,", 64)).toBeLessThanOrEqual(64);
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
