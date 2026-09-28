import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CONSENT_KEY, CookieSettingsButton } from "./CookieConsent";
import { Footer } from "./landing/Footer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CookieSettingsButton — lets a visitor undo Accept/Decline", () => {
  it("is a real button, visible in the footer's Legal group", () => {
    const html = renderToStaticMarkup(createElement(CookieSettingsButton));
    expect(html).toBe(
      '<button type="button" data-testid="cookie-settings-button" class="hover:text-white">Cookie settings</button>',
    );

    const footerHtml = renderToStaticMarkup(createElement(Footer));
    expect(footerHtml).toContain('data-testid="cookie-settings-button"');
  });

  it("clears the same key Accept/Decline writes, then reloads", () => {
    const removeItem = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal("window", { localStorage: { removeItem }, location: { reload } });

    const element = CookieSettingsButton();
    element.props.onClick();

    expect(CONSENT_KEY).toBe("t2q-cookie-consent");
    expect(removeItem).toHaveBeenCalledWith(CONSENT_KEY);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never throws, even when storage is blocked (private browsing)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        removeItem: () => {
          throw new Error("blocked");
        },
      },
      location: { reload: vi.fn() },
    });
    const element = CookieSettingsButton();
    expect(() => element.props.onClick()).not.toThrow();
  });
});
