import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../actions", () => ({ saveSettings: vi.fn() }));

import { SettingsForm, type SettingsInitial } from "./SettingsForm";

const initial = (o: Partial<SettingsInitial> = {}): SettingsInitial => ({
  business_name: "Test Builders",
  email: "t@example.com",
  phone: "",
  address: "",
  gst_number: "",
  payment_instructions: "",
  country: "NZ",
  currency: "NZD",
  tax_label: "GST",
  tax_rate: "15",
  default_labour_rate: "75",
  default_markup_pct: "20",
  ...o,
});

const render = (o: Partial<SettingsInitial> = {}) =>
  renderToStaticMarkup(createElement(SettingsForm, { initial: initial(o) }));

describe("SettingsForm labels match the maths", () => {
  // Audit 2026-09-24, item 10 — markup applies to materials AND other items.
  it("names the markup for what it covers", () => {
    const html = render();
    expect(html).toContain("Markup on materials and other items (%)");
    expect(html).not.toContain("Materials markup (%)");
  });

  // Item 9 — the tax field follows the business country.
  it("a UK business sees VAT, not the column-default GST", () => {
    const html = render({ country: "UK", currency: "GBP", tax_label: "GST", tax_rate: "20" });
    expect(html).toContain("VAT rate (%)");
    expect(html).toContain("VAT number");
    expect(html).not.toContain("GST rate (%)");
  });

  it("NZ keeps GST; the blank-rate placeholder is the country default", () => {
    expect(render()).toContain("GST rate (%)");
    expect(render({ country: "AU", currency: "AUD", tax_rate: "" })).toContain('placeholder="10"');
  });
});
