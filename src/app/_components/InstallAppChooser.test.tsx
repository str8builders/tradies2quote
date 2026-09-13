import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InstallAppChooser, INSTALL_APPS, type InstallableApp } from "./InstallAppChooser";

const render = (current: InstallableApp) =>
  renderToStaticMarkup(createElement(InstallAppChooser, { current, onInstallCurrent: () => {}, onClose: () => {} }));

describe("InstallAppChooser", () => {
  it("offers both apps every time", () => {
    for (const current of ["tradies2quote", "t2qcal"] as const) {
      const html = render(current);
      expect(html).toContain("Tradies2Quote");
      expect(html).toContain("T2QCAL");
      expect(html).toContain('data-testid="install-app-option-tradies2quote"');
      expect(html).toContain('data-testid="install-app-option-t2qcal"');
    }
  });

  it("installs the open app in place and sends the other app to its own install page", () => {
    const fromQuotes = render("tradies2quote");
    expect(fromQuotes).toMatch(/<button[^>]*data-testid="install-app-choose-tradies2quote"/);
    expect(fromQuotes).toMatch(/<a href="\/t2qcal\/install"[^>]*data-testid="install-app-choose-t2qcal"/);

    const fromCalculators = render("t2qcal");
    expect(fromCalculators).toMatch(/<button[^>]*data-testid="install-app-choose-t2qcal"/);
    expect(fromCalculators).toMatch(/<a href="\/install"[^>]*data-testid="install-app-choose-tradies2quote"/);
  });

  it("keeps the install paths pointing at the two separate manifests", () => {
    expect(INSTALL_APPS.tradies2quote.installPath).toBe("/install");
    expect(INSTALL_APPS.t2qcal.installPath).toBe("/t2qcal/install");
  });
});
