// The top of the screen in the iPhone app: no band above the page, and a
// clock that stays readable in outdoor mode.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("../../_components/TrialBanner", () => ({ TrialBanner: () => null }));

import { NewLookShell } from "./NewLookShell";
import { statusBarStyle } from "./StatusBarTint";

const strip = (markup: string) => {
  const at = markup.indexOf('data-testid="status-bar-strip"');
  expect(at).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

describe("status bar strip", () => {
  it("in the iPhone app it's the page's own colour, so there's no band", () => {
    for (const outdoor of [false, true]) {
      const tag = strip(renderToStaticMarkup(<NewLookShell outdoor={outdoor} inApp>page</NewLookShell>));
      expect(tag).toContain("bg-ui-bg");
      expect(tag).not.toContain("bg-ui-chrome");
      expect(tag).toContain("h-[env(safe-area-inset-top)]");
    }
  });

  it("in a home-screen web app it stays the dark chrome under iOS's white clock", () => {
    const tag = strip(renderToStaticMarkup(<NewLookShell outdoor>page</NewLookShell>));
    expect(tag).toContain("bg-ui-chrome");
  });

  it("the clock is dark on outdoor mode's white and light otherwise", () => {
    expect(statusBarStyle(true)).toBe("dark");
    expect(statusBarStyle(false)).toBe("light");
  });
});
