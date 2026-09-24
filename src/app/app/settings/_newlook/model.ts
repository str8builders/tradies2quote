/**
 * New-look settings (redesign phase 5): the rules behind the four short
 * pages, kept pure so they are tested in node.
 *
 * All three form pages save through the existing `saveSettings` action,
 * unchanged. That action upserts every profile field it is sent and writes
 * null for any it is not, so each page sends the same full set the old
 * single form sends: its own fields as edited, every other field exactly as
 * loaded. What is saved, and how, stays the same.
 */

import {
  NZ_DEFAULTS,
  resolveTaxLabel,
  resolveTaxRate,
  taxDefaultsFor,
} from "@/lib/quote-defaults";

/** Every field the old settings form submits, in its order. */
export const SETTINGS_FIELDS = [
  "business_name",
  "email",
  "phone",
  "address",
  "gst_number",
  "payment_instructions",
  "currency",
  "country",
  "tax_rate",
  "default_labour_rate",
  "default_markup_pct",
] as const;

export type SettingsField = (typeof SETTINGS_FIELDS)[number];

/** The form's values: strings, exactly as the inputs hold them. */
export type SettingsValues = Record<SettingsField, string>;

export type SettingsFormPage = "business" | "rates" | "payments";
export type SettingsPage = SettingsFormPage | "account";

/** The fields each page shows and edits. Every other field rides along unchanged. */
export const PAGE_FIELDS: Readonly<Record<SettingsFormPage, readonly SettingsField[]>> = {
  business: ["business_name", "phone", "email", "address", "gst_number"],
  rates: ["default_labour_rate", "default_markup_pct", "country", "tax_rate", "currency"],
  payments: ["payment_instructions"],
};

/** The profile columns the pages read (the old page's select, minus images and flags). */
export interface SettingsProfileRow {
  business_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gst_number?: string | null;
  payment_instructions?: string | null;
  country?: string | null;
  currency?: string | null;
  tax_label?: string | null;
  tax_rate?: number | null;
  default_labour_rate?: number | null;
  default_markup_pct?: number | null;
}

/**
 * Input values for a profile, with the same fallbacks the old settings page
 * uses (a fresh account starts on the NZ defaults and its sign-in email), so
 * saving from a new page stores what saving the old form would.
 */
export function toSettingsValues(
  profile: SettingsProfileRow | null | undefined,
  userEmail: string | null | undefined,
): SettingsValues {
  return {
    business_name: profile?.business_name ?? "",
    email: profile?.email ?? userEmail ?? "",
    phone: profile?.phone ?? "",
    address: profile?.address ?? "",
    gst_number: profile?.gst_number ?? "",
    payment_instructions: profile?.payment_instructions ?? "",
    country: (profile?.country ?? NZ_DEFAULTS.country) || "NZ",
    currency: (profile?.currency ?? NZ_DEFAULTS.currency) || "NZD",
    tax_rate:
      typeof profile?.tax_rate === "number"
        ? String(profile.tax_rate)
        : String(resolveTaxRate(null, profile?.country, profile?.currency)),
    default_labour_rate:
      typeof profile?.default_labour_rate === "number"
        ? String(profile.default_labour_rate)
        : String(NZ_DEFAULTS.default_labour_rate),
    default_markup_pct:
      typeof profile?.default_markup_pct === "number"
        ? String(profile.default_markup_pct)
        : String(NZ_DEFAULTS.default_markup_pct),
  };
}

/** The stored label as the old page resolves it on load (see SettingsForm). */
export function loadedTaxLabel(profile: SettingsProfileRow | null | undefined): string {
  return resolveTaxLabel(profile?.tax_label, profile?.country, profile?.currency);
}

/** GST, VAT or Tax for the country and currency now chosen on the page. */
export function taxLabelFor(loadedLabel: string, country: string, currency: string): string {
  return resolveTaxLabel(loadedLabel, country, currency);
}

/** The country's usual tax rate, the old form's placeholder for a blank rate. */
export function usualTaxRate(country: string, currency: string): number {
  return taxDefaultsFor(country, currency).tax_rate;
}

/** What one Save sends to `saveSettings`: every field, in the old form's order. */
export function settingsFormEntries(values: SettingsValues): Array<[SettingsField, string]> {
  return SETTINGS_FIELDS.map((field) => [field, values[field] ?? ""]);
}

export function settingsFormData(values: SettingsValues): FormData {
  const formData = new FormData();
  for (const [field, value] of settingsFormEntries(values)) formData.append(field, value);
  return formData;
}

/** Change only a page's own fields; everything else keeps its loaded value. */
export function applyPageEdits(
  loaded: SettingsValues,
  page: SettingsFormPage,
  edits: Partial<SettingsValues>,
): SettingsValues {
  const next = { ...loaded };
  for (const field of PAGE_FIELDS[page]) {
    const value = edits[field];
    if (typeof value === "string") next[field] = value;
  }
  return next;
}

// ── Unsaved changes ──────────────────────────────────────────────────────────

export type DraftValue = string | boolean;
export type Draft = Record<string, DraftValue>;

/** Spaces at either end never count as a change (the server trims them). */
function sameValue(a: DraftValue | undefined, b: DraftValue | undefined): boolean {
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  return a === b;
}

/** The keys whose value differs from the last saved one. */
export function changedKeys<T extends Draft>(
  saved: T,
  current: T,
  keys: readonly (keyof T & string)[] = Object.keys(current) as (keyof T & string)[],
): Array<keyof T & string> {
  return keys.filter((key) => !sameValue(saved[key], current[key]));
}

export interface SaveBarState {
  visible: boolean;
  label: string;
}

/** The Save bar shows while something has changed, and stays up while it saves. */
export function saveBarState({ dirty, pending }: { dirty: boolean; pending: boolean }): SaveBarState {
  return { visible: dirty || pending, label: pending ? "Saving…" : "Save" };
}

// ── Saving ───────────────────────────────────────────────────────────────────

export type SaveOutcome = { ok: true } | { ok: false; error: string };

/** One thing a page saves with its own existing action (profile, deposit, …). */
export interface SaveUnit {
  id: string;
  dirty: boolean;
  run: () => Promise<SaveOutcome>;
}

export interface SaveReport {
  saved: string[];
  failed: Array<{ id: string; error: string }>;
}

export const SAVE_FAILED_MESSAGE = "Couldn't save. Check your signal and try again.";

/** Run the changed units one after another; a failure never stops the rest. */
export async function runSaveUnits(units: readonly SaveUnit[]): Promise<SaveReport> {
  const report: SaveReport = { saved: [], failed: [] };
  for (const unit of units) {
    if (!unit.dirty) continue;
    let outcome: SaveOutcome;
    try {
      outcome = (await unit.run()) ?? { ok: false, error: SAVE_FAILED_MESSAGE };
    } catch {
      outcome = { ok: false, error: SAVE_FAILED_MESSAGE };
    }
    if (outcome.ok) report.saved.push(unit.id);
    else report.failed.push({ id: unit.id, error: outcome.error || SAVE_FAILED_MESSAGE });
  }
  return report;
}

/** The one toast a Save ends with. */
export function saveToast(report: SaveReport): { message: string; tone: "ok" | "bad" } | null {
  if (report.failed.length > 0) return { message: report.failed[0].error, tone: "bad" };
  if (report.saved.length > 0) return { message: "Saved", tone: "ok" };
  return null;
}

/** Map the old action's state to a save outcome. */
export function outcomeFromSettingsState(
  state: { status: "idle" } | { status: "ok"; savedAt: string } | { status: "error"; message: string } | null | undefined,
): SaveOutcome {
  if (state?.status === "ok") return { ok: true };
  if (state?.status === "error") return { ok: false, error: state.message };
  return { ok: false, error: SAVE_FAILED_MESSAGE };
}

/** The deposit rule `saveDepositPctAction` applies on the server, shown before saving. */
export function clampDepositPct(value: string): number {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

// ── Choices ──────────────────────────────────────────────────────────────────

export interface Choice {
  value: string;
  label: string;
}

export const COUNTRY_CHOICES: readonly Choice[] = [
  { value: "NZ", label: "New Zealand" },
  { value: "AU", label: "Australia" },
  { value: "UK", label: "United Kingdom" },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
];

export const CURRENCY_CHOICES: readonly Choice[] = [
  { value: "NZD", label: "NZ dollars (NZD)" },
  { value: "AUD", label: "Australian dollars (AUD)" },
  { value: "GBP", label: "British pounds (GBP)" },
  { value: "USD", label: "US dollars (USD)" },
  { value: "CAD", label: "Canadian dollars (CAD)" },
];

/** A stored value outside the list stays selectable, so saving never changes it. */
export function choicesWith(choices: readonly Choice[], current: string): readonly Choice[] {
  if (!current || choices.some((choice) => choice.value === current)) return choices;
  return [...choices, { value: current, label: current }];
}
