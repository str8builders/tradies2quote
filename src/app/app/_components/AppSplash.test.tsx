import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { recordPathname, resetRouteHistory } from "@/lib/route-history";
import AppSplash from "./AppSplash";

/** First paint is server HTML: the welcome must already cover the app on an entry, and be absent on a return. */
describe("AppSplash first paint", () => {
  beforeEach(resetRouteHistory);
  it("covers the app in the server HTML when the welcome has not been seen", () => {
    const html = renderToStaticMarkup(createElement(AppSplash, { serverOpen: true }));
    expect(html).toContain('data-testid="app-splash-cover"');
    expect(html).toContain("Welcome to");
    expect(html).toContain('data-testid="app-splash"');
  });
  it("renders no cover when the seen cookie is present", () => {
    const html = renderToStaticMarkup(createElement(AppSplash, { serverOpen: false }));
    expect(html).not.toContain("app-splash-cover");
  });
  it("renders no cover when coming back from elsewhere in the site", () => {
    recordPathname("/t2qcal/calculators"); recordPathname("/app");
    const html = renderToStaticMarkup(createElement(AppSplash, { serverOpen: true }));
    expect(html).not.toContain("app-splash-cover");
  });
  it("keeps the cover when arriving from sign-in", () => {
    recordPathname("/login"); recordPathname("/app");
    expect(renderToStaticMarkup(createElement(AppSplash, { serverOpen: true }))).toContain("app-splash-cover");
  });
});
