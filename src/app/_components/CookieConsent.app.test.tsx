// The iPhone app uses essential cookies only: no consent banner and never
// the analytics script. The website keeps its banner and opt-in.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/login" }));

import { CookieConsent, analyticsAllowedHere } from "./CookieConsent";

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";

describe("CookieConsent", () => {
  it("in the iPhone app the stored choice is never read, so no banner and no script", () => {
    expect(analyticsAllowedHere(`${SAFARI} T2QNativeShell`, false)).toBe(false);
    expect(analyticsAllowedHere(SAFARI, true)).toBe(false);
  });

  it("on the website the banner and its opt-in work as before", () => {
    expect(analyticsAllowedHere(SAFARI, false)).toBe(true);
  });

  it("nothing is in the server HTML, so the app never gets a flash of the banner", () => {
    const html = renderToStaticMarkup(<CookieConsent />);
    expect(html).not.toContain("cookie-consent");
    expect(html).not.toContain("track.js");
  });
});
