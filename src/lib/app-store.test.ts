import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { appStoreId, appStoreUrl } from "./app-store";
import { AppStoreBadge } from "@/app/_components/AppStoreBadge";

afterEach(() => vi.unstubAllEnvs());

describe("the App Store listing", () => {
  it("is off until the app is published", () => {
    expect(appStoreId({})).toBeNull();
    expect(appStoreId({ APP_STORE_ID: "" })).toBeNull();
    expect(appStoreId({ APP_STORE_ID: "coming soon" })).toBeNull();
  });

  it("takes the id from the listing's link, with or without its 'id' prefix", () => {
    expect(appStoreId({ APP_STORE_ID: "6746123456" })).toBe("6746123456");
    expect(appStoreId({ APP_STORE_ID: " id6746123456 " })).toBe("6746123456");
    expect(appStoreUrl("6746123456")).toBe("https://apps.apple.com/app/id6746123456");
  });

  it("the badge shows nothing before launch, then Apple's badge linking to the listing", () => {
    vi.stubEnv("APP_STORE_ID", "");
    expect(renderToStaticMarkup(createElement(AppStoreBadge))).toBe("");
    vi.stubEnv("APP_STORE_ID", "6746123456");
    const html = renderToStaticMarkup(createElement(AppStoreBadge));
    expect(html).toContain('href="https://apps.apple.com/app/id6746123456"');
    expect(html).toContain('alt="Download on the App Store"');
    expect(html).toContain("toolbox.marketingtools.apple.com/api/badges/download-on-the-app-store");
  });
});
