import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountButton } from "./AccountButton";

describe("Settings account entry", () => {
  it("names Settings visibly and accessibly without exposing the email address", () => {
    const html = renderToStaticMarkup(createElement(AccountButton, {
      userEmail: "challis@example.test", avatarUrl: null, "aria-expanded": false,
    }));
    expect(html).toContain('aria-label="Settings and account"');
    expect(html).toContain('>Settings</span>');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("challis@example.test");
  });
  it("keeps the Settings name when a photo replaces the initial", () => {
    const html = renderToStaticMarkup(createElement(AccountButton, {
      userEmail: null, avatarUrl: "/profile-photo.png", "aria-expanded": true,
    }));
    expect(html).toContain('src="/profile-photo.png"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('>Settings</span>');
  });
});
