import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ saveSettings: vi.fn() }));

import { SettingsForm, type SettingsInitial } from "../_components/SettingsForm";
import {
  PAGE_FIELDS,
  SAVE_FAILED_MESSAGE,
  SETTINGS_FIELDS,
  applyPageEdits,
  changedKeys,
  choicesWith,
  clampDepositPct,
  COUNTRY_CHOICES,
  CURRENCY_CHOICES,
  loadedTaxLabel,
  outcomeFromSettingsState,
  runSaveUnits,
  saveBarState,
  saveToast,
  settingsFormData,
  settingsFormEntries,
  taxLabelFor,
  toSettingsValues,
  usualTaxRate,
  type SaveUnit,
  type SettingsValues,
} from "./model";

const LOADED: SettingsValues = {
  business_name: "Bayside Builders",
  email: "mike@bayside.co.nz",
  phone: "021 555 0101",
  address: "12 Rata St, Tauranga",
  gst_number: "123-456-789",
  payment_instructions: "Bank: 12-3456-7890123-00",
  currency: "NZD",
  country: "NZ",
  tax_rate: "15",
  default_labour_rate: "85",
  default_markup_pct: "20",
};

/** The names the old single settings form posts, straight from its markup. */
function oldFormFieldNames(): string[] {
  const initial: SettingsInitial = { ...LOADED, tax_label: "GST" };
  const html = renderToStaticMarkup(createElement(SettingsForm, { initial }));
  return [...html.matchAll(/<(?:input|select|textarea)\b[^>]*?\sname="([^"]+)"/g)].map((m) => m[1]);
}

describe("each page saves the same payload as the old form", () => {
  it("the field list is exactly what the old form posts, in its order", () => {
    expect(oldFormFieldNames()).toEqual([...SETTINGS_FIELDS]);
  });

  it("a Save sends every field, not just the page's own", () => {
    expect(settingsFormEntries(LOADED)).toEqual(SETTINGS_FIELDS.map((field) => [field, LOADED[field]]));
    const formData = settingsFormData(LOADED);
    expect([...formData.keys()]).toEqual([...SETTINGS_FIELDS]);
    expect(Object.fromEntries(formData.entries())).toEqual(LOADED);
  });

  it("every field is edited on exactly one page", () => {
    const all = [...PAGE_FIELDS.business, ...PAGE_FIELDS.rates, ...PAGE_FIELDS.payments];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...SETTINGS_FIELDS].sort());
  });

  it("business saves its five fields and carries the rest unchanged", () => {
    expect(PAGE_FIELDS.business).toEqual(["business_name", "phone", "email", "address", "gst_number"]);
    const next = applyPageEdits(LOADED, "business", { phone: "027 000 1111", default_labour_rate: "999" });
    expect(next).toEqual({ ...LOADED, phone: "027 000 1111" });
  });

  it("rates saves labour, markup, country, tax rate and currency only", () => {
    expect([...PAGE_FIELDS.rates].sort()).toEqual(
      ["country", "currency", "default_labour_rate", "default_markup_pct", "tax_rate"].sort(),
    );
    const next = applyPageEdits(LOADED, "rates", { default_labour_rate: "95", country: "AU", email: "x@y.z" });
    expect(next).toEqual({ ...LOADED, default_labour_rate: "95", country: "AU" });
  });

  it("payments saves the invoice payment wording only", () => {
    expect(PAGE_FIELDS.payments).toEqual(["payment_instructions"]);
    const next = applyPageEdits(LOADED, "payments", { payment_instructions: "Cash or card", business_name: "" });
    expect(next).toEqual({ ...LOADED, payment_instructions: "Cash or card" });
    expect(Object.fromEntries(settingsFormData(next).entries())).toEqual(next);
  });
});

describe("loaded values match the old page's", () => {
  it("a fresh account starts on the NZ defaults and its sign-in email", () => {
    expect(toSettingsValues(null, "new@tradie.nz")).toEqual({
      business_name: "",
      email: "new@tradie.nz",
      phone: "",
      address: "",
      gst_number: "",
      payment_instructions: "",
      currency: "NZD",
      country: "NZ",
      tax_rate: "15",
      default_labour_rate: "75",
      default_markup_pct: "20",
    });
  });

  it("stored numbers become the strings the inputs hold", () => {
    const values = toSettingsValues(
      { business_name: "B", email: "b@b.nz", tax_rate: 12.5, default_labour_rate: 90, default_markup_pct: 0, country: "NZ", currency: "NZD" },
      "login@b.nz",
    );
    expect(values).toMatchObject({ email: "b@b.nz", tax_rate: "12.5", default_labour_rate: "90", default_markup_pct: "0" });
  });

  it("a blank tax rate falls back to the country's rate, not NZ's", () => {
    expect(toSettingsValues({ country: "UK", currency: "GBP", tax_rate: null }, null).tax_rate).toBe("20");
    expect(toSettingsValues({ country: "US", currency: "USD" }, null).tax_rate).toBe("0");
  });

  it("the tax name follows the country chosen on the page, a custom one stays", () => {
    expect(loadedTaxLabel({ country: "NZ", tax_label: null })).toBe("GST");
    expect(taxLabelFor("GST", "UK", "GBP")).toBe("VAT");
    expect(taxLabelFor("GST", "NZ", "NZD")).toBe("GST");
    expect(taxLabelFor("HST", "CA", "CAD")).toBe("HST");
    expect(usualTaxRate("AU", "AUD")).toBe(10);
  });
});

describe("unsaved changes and the Save bar", () => {
  it("only real changes count; spaces at the ends don't", () => {
    expect(changedKeys(LOADED, { ...LOADED })).toEqual([]);
    expect(changedKeys(LOADED, { ...LOADED, phone: " 021 555 0101  " })).toEqual([]);
    expect(changedKeys(LOADED, { ...LOADED, phone: "021 555 0102" })).toEqual(["phone"]);
  });

  it("looks only at the page's own fields when asked", () => {
    const current = { ...LOADED, phone: "1", default_labour_rate: "2" };
    expect(changedKeys(LOADED, current, PAGE_FIELDS.business)).toEqual(["phone"]);
    expect(changedKeys(LOADED, current, PAGE_FIELDS.rates)).toEqual(["default_labour_rate"]);
    expect(changedKeys(LOADED, current, PAGE_FIELDS.payments)).toEqual([]);
  });

  it("switches count as changes", () => {
    expect(changedKeys({ on: false, url: "" }, { on: true, url: "" })).toEqual(["on"]);
  });

  it("the bar shows only with changes, and stays while saving", () => {
    expect(saveBarState({ dirty: false, pending: false })).toEqual({ visible: false, label: "Save" });
    expect(saveBarState({ dirty: true, pending: false })).toEqual({ visible: true, label: "Save" });
    expect(saveBarState({ dirty: false, pending: true })).toEqual({ visible: true, label: "Saving…" });
  });
});

describe("saving", () => {
  const unit = (id: string, dirty: boolean, run: SaveUnit["run"]): SaveUnit => ({ id, dirty, run });

  it("runs only what changed, in order", async () => {
    const calls: string[] = [];
    const report = await runSaveUnits([
      unit("profile", true, async () => (calls.push("profile"), { ok: true })),
      unit("deposit", false, async () => (calls.push("deposit"), { ok: true })),
      unit("engagement", true, async () => (calls.push("engagement"), { ok: true })),
    ]);
    expect(calls).toEqual(["profile", "engagement"]);
    expect(report).toEqual({ saved: ["profile", "engagement"], failed: [] });
    expect(saveToast(report)).toEqual({ message: "Saved", tone: "ok" });
  });

  it("a failure is reported and never stops the rest", async () => {
    const report = await runSaveUnits([
      unit("profile", true, async () => ({ ok: false, error: "Markup must be between 0 and 100." })),
      unit("deposit", true, async () => ({ ok: true })),
    ]);
    expect(report.saved).toEqual(["deposit"]);
    expect(report.failed).toEqual([{ id: "profile", error: "Markup must be between 0 and 100." }]);
    expect(saveToast(report)).toEqual({ message: "Markup must be between 0 and 100.", tone: "bad" });
  });

  it("a dropped connection or empty answer is a plain failure", async () => {
    const report = await runSaveUnits([
      unit("profile", true, async () => {
        throw new Error("network");
      }),
      unit("deposit", true, async () => undefined as never),
    ]);
    expect(report.failed.map((f) => f.error)).toEqual([SAVE_FAILED_MESSAGE, SAVE_FAILED_MESSAGE]);
  });

  it("nothing to save says nothing", async () => {
    expect(saveToast(await runSaveUnits([unit("profile", false, async () => ({ ok: true }))]))).toBeNull();
  });

  it("reads the old action's answer", () => {
    expect(outcomeFromSettingsState({ status: "ok", savedAt: "2026-09-25T00:00:00Z" })).toEqual({ ok: true });
    expect(outcomeFromSettingsState({ status: "error", message: "That email doesn't look right." })).toEqual({
      ok: false,
      error: "That email doesn't look right.",
    });
    expect(outcomeFromSettingsState({ status: "idle" })).toEqual({ ok: false, error: SAVE_FAILED_MESSAGE });
    expect(outcomeFromSettingsState(undefined)).toEqual({ ok: false, error: SAVE_FAILED_MESSAGE });
  });

  it("the deposit is rounded and kept to 0–100, as the server does", () => {
    expect(clampDepositPct("50")).toBe(50);
    expect(clampDepositPct("150")).toBe(100);
    expect(clampDepositPct("12.6")).toBe(13);
    expect(clampDepositPct("")).toBe(0);
    expect(clampDepositPct("abc")).toBe(0);
  });
});

describe("choices", () => {
  it("offers the old form's countries and currencies", () => {
    expect(COUNTRY_CHOICES.map((c) => c.value)).toEqual(["NZ", "AU", "UK", "US", "CA"]);
    expect(CURRENCY_CHOICES.map((c) => c.value)).toEqual(["NZD", "AUD", "GBP", "USD", "CAD"]);
  });

  it("keeps a stored value that isn't in the list, so saving never changes it", () => {
    expect(choicesWith(COUNTRY_CHOICES, "NZ")).toBe(COUNTRY_CHOICES);
    expect(choicesWith(COUNTRY_CHOICES, "IE").at(-1)).toEqual({ value: "IE", label: "IE" });
  });
});
