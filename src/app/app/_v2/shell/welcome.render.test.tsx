// The new-look welcome as first HTML (static markup in node): it covers the
// screen, says who it's greeting to screen readers, can be skipped, and has
// a safety deadline. The animation itself is src/remotion/NewWelcomeScene.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NEW_WELCOME_FPS, NEW_WELCOME_FRAMES } from "@/remotion/NewWelcomeScene";
import { NewLookWelcome, WELCOME_DEADLINE_MS, WELCOME_HOLD_MS } from "./NewLookWelcome";

const data = { greeting: "Good morning", name: "Challis", today: "Saturday 26 September" } as const;
const html = (over: Partial<Parameters<typeof NewLookWelcome>[0]> = {}) =>
  renderToStaticMarkup(<NewLookWelcome serverOpen data={data} {...over} />);

describe("NewLookWelcome", () => {
  it("covers the screen from the first HTML and says who it greets", () => {
    const out = html();
    // An open dialog in the first HTML; the browser's top layer once running.
    expect(out).toMatch(/<dialog open="" tabindex="-1" aria-labelledby="welcome-greeting"/);
    expect(out).toContain("fixed inset-0");
    expect(out).toContain("bg-ui-bg");
    expect(out).toMatch(/<h1 id="welcome-greeting" class="sr-only">Good morning, Challis. Saturday 26 September.<\/h1>/);
    expect(out).toContain("Tap anywhere to skip");
  });

  it("without a name, still greets", () => {
    expect(html({ data: { ...data, name: null } })).toContain("Good morning. Let’s get to work.");
  });

  it("renders nothing when the server says it's been seen", () => {
    expect(html({ serverOpen: false })).toBe("");
  });

  it("long enough to see (about 6.5 s), never stuck (12 s cap)", () => {
    const seconds = NEW_WELCOME_FRAMES / NEW_WELCOME_FPS;
    expect(seconds).toBeGreaterThanOrEqual(6);
    expect(seconds).toBeLessThanOrEqual(7);
    expect(WELCOME_DEADLINE_MS).toBeGreaterThan(seconds * 1000 + WELCOME_HOLD_MS);
    expect(WELCOME_DEADLINE_MS).toBeLessThanOrEqual(12000);
  });
});
