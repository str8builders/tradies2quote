// The new-look welcome as first HTML (static markup in node): what it says,
// that it covers the screen, and that every animation stops for reduced
// motion. The play/skip timing is the shared route-history logic, tested
// in src/lib.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewLookWelcome, WELCOME_CALM_MS, WELCOME_SHOW_MS } from "./NewLookWelcome";

const data = { greeting: "Good morning", name: "Challis", today: "Saturday 26 September" } as const;
const html = (over: Partial<Parameters<typeof NewLookWelcome>[0]> = {}) =>
  renderToStaticMarkup(<NewLookWelcome serverOpen data={data} {...over} />);

describe("NewLookWelcome", () => {
  it("covers the screen from the first HTML and greets you by name", () => {
    const out = html();
    expect(out).toMatch(/role="dialog" aria-modal="true" aria-labelledby="welcome-greeting"/);
    expect(out).toContain("fixed inset-0");
    expect(out).toMatch(/<h1 id="welcome-greeting"[^>]*>/);
    const heading = out.slice(out.indexOf('id="welcome-greeting"'), out.indexOf("</h1>"));
    for (const word of ["Good", "morning,", "Challis"]) expect(heading).toContain(`>${word}</span>`);
    expect(out).toContain("Saturday 26 September");
    expect(out).toContain('alt="Tradies2Quote"');
    expect(out).toContain("Tap anywhere to skip");
  });

  it("without a name, still greets and gets on with it", () => {
    const out = html({ data: { ...data, name: null } });
    expect(out).toContain(">morning.</span>");
    expect(out).toContain("Let’s get to work");
  });

  it("every animation stops for reduced motion", () => {
    const out = html();
    const animations = out.match(/\banimate-ui-[\w-]+/g) ?? [];
    expect(animations.length).toBeGreaterThanOrEqual(6);
    expect((out.match(/motion-reduce:animate-none/g) ?? []).length).toBe(animations.length);
  });

  it("renders nothing when the server says it's been seen", () => {
    expect(html({ serverOpen: false })).toBe("");
  });

  it("is short: under 2.5 seconds, under a second when calm", () => {
    expect(WELCOME_SHOW_MS).toBeLessThanOrEqual(2500);
    expect(WELCOME_CALM_MS).toBeLessThan(1000);
  });
});
