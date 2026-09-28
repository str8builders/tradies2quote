import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOGO_PIECES, LOGO_SRC } from "./logo-pieces";
import { NEW_WELCOME_FRAMES, NewWelcomeArt } from "./NewWelcomeScene";
import { LogoAssembly, WELCOME_FPS, WELCOME_FRAMES } from "./WelcomeScene";

// The welcomes land on the owner's real T2Q logo (its three pieces cut from
// public/logo-mark.png), not the letters typed in a font.
const pieces = Object.values(LOGO_PIECES).map((p) => p.src);

describe("the welcome's logo is the owner's T2Q logo", () => {
  it("every piece (and the whole logo) is a real file in public/", () => {
    for (const src of [...pieces, LOGO_SRC]) expect(existsSync(join(process.cwd(), "public", src)), src).toBe(true);
  });

  it("the new welcome ends on the three pieces of the logo", () => {
    const html = renderToStaticMarkup(
      createElement(NewWelcomeArt, { frame: NEW_WELCOME_FRAMES - 1, fps: 30, greeting: "Good morning", name: "Sam", today: "Tuesday 29 September" }),
    );
    for (const src of pieces) expect(html).toContain(`src="${src}"`);
    expect(html).not.toMatch(/>T<\/span>|>Q<\/span>/);
  });

  it("the classic welcome (and its poster) end on the logo too", () => {
    const html = renderToStaticMarkup(createElement(LogoAssembly, { frame: WELCOME_FRAMES - 1, fps: WELCOME_FPS }));
    for (const src of pieces) expect(html).toContain(`src="${src}"`);
  });
});
