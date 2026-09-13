"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, FloppyDisk, Warning } from "@phosphor-icons/react";
import { saveSettings } from "../actions";
import {
  SAVE_SETTINGS_INITIAL,
  type SaveSettingsState,
} from "../_state";

/**
 * Editable profile form for `/app/settings`.
 *
 * - Renders one input per profile field, pre-filled with the row passed
 *   down from the server component.
 * - Numeric fields are validated by both `<input type="number" min max>` on
 *   the client and the server action on the server. The client validation
 *   is purely a UX hint — the server is the source of truth.
 * - Save button disables while submitting and shows a small spinner via
 *   `useFormStatus()`. On success a green pill renders the local time the
 *   save completed.
 */
export interface SettingsInitial {
  business_name: string;
  email: string;
  phone: string;
  address: string;
  gst_number: string;
  /** Free-text bank/payment details printed on invoices. */
  payment_instructions: string;
  country: string;
  currency: string;
  /** Stored as a percentage (e.g. 15 for 15%). */
  tax_rate: string;
  default_labour_rate: string;
  default_markup_pct: string;
  /** `tax_label` from the profile, used to name the GST/VAT field. */
  tax_label: string;
}

interface Props {
  initial: SettingsInitial;
}

export function SettingsForm({ initial }: Props) {
  const [state, formAction] = useActionState<SaveSettingsState, FormData>(
    saveSettings,
    SAVE_SETTINGS_INITIAL,
  );

  // Local mirror so the inputs feel responsive while the server action
  // does its round-trip; values are uncontrolled after a successful save
  // (the page revalidates and the new initial flows back in).
  const [form, setForm] = useState({ ...initial });

  const taxLabel = (initial.tax_label || "GST").trim();

  function setField<K extends keyof SettingsInitial>(key: K) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };
  }

  return (
    <form
      action={formAction}
      id="profile"
      data-testid="settings-form"
      className="space-y-8"
      noValidate
    >
      <Section id="business" title="Business details">
        <Field id="business_name" label="Business name">
          <input
            id="business_name"
            name="business_name"
            type="text"
            autoComplete="organization"
            value={form.business_name}
            onChange={setField("business_name")}
            data-testid="settings-business-name"
            className={INPUT_CLASS}
            placeholder="e.g. Bayside Builders Ltd"
          />
        </Field>
        <Field id="email" label="Email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={setField("email")}
            data-testid="settings-email"
            className={INPUT_CLASS}
            placeholder="you@yourbusiness.co.nz"
          />
        </Field>
        <Field id="phone" label="Phone">
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={setField("phone")}
            data-testid="settings-phone"
            className={INPUT_CLASS}
            placeholder="+64 21 000 0000"
          />
        </Field>
        <Field id="address" label="Address">
          <input
            id="address"
            name="address"
            type="text"
            autoComplete="street-address"
            value={form.address}
            onChange={setField("address")}
            data-testid="settings-address"
            className={INPUT_CLASS}
            placeholder="123 Main Rd, Tauranga"
          />
        </Field>
        <Field id="gst_number" label={`${taxLabel} number`}>
          <input
            id="gst_number"
            name="gst_number"
            type="text"
            value={form.gst_number}
            onChange={setField("gst_number")}
            data-testid="settings-gst-number"
            className={INPUT_CLASS}
            placeholder="123-456-789"
          />
        </Field>
        <Field
          id="payment_instructions"
          label="Payment details (shown on invoices)"
        >
          <textarea
            id="payment_instructions"
            name="payment_instructions"
            rows={3}
            maxLength={500}
            value={form.payment_instructions}
            onChange={setField("payment_instructions")}
            data-testid="settings-payment-instructions"
            className={INPUT_CLASS}
            placeholder={
              "Bank: 12-3456-7890123-00\nPlease use the invoice number as the reference."
            }
          />
        </Field>
      </Section>

      <Section id="defaults" title="Quote defaults">
        <Field id="currency" label="Currency">
          <select
            id="currency"
            name="currency"
            value={form.currency}
            onChange={setField("currency")}
            data-testid="settings-currency"
            className={INPUT_CLASS}
          >
            <option value="NZD">NZD</option>
            <option value="AUD">AUD</option>
            <option value="GBP">GBP</option>
            <option value="USD">USD</option>
            <option value="CAD">CAD</option>
          </select>
        </Field>
        <Field id="country" label="Country">
          <select
            id="country"
            name="country"
            value={form.country}
            onChange={setField("country")}
            data-testid="settings-country"
            className={INPUT_CLASS}
          >
            <option value="NZ">NZ</option>
            <option value="AU">AU</option>
            <option value="UK">UK</option>
            <option value="US">US</option>
            <option value="CA">CA</option>
          </select>
        </Field>
        <Field id="tax_rate" label={`${taxLabel} rate (%)`}>
          <input
            id="tax_rate"
            name="tax_rate"
            type="number"
            inputMode="decimal"
            // Wave 36 — `autoComplete="off"` + `data-form-type="other"`
            // stops mobile browsers (notably iOS Safari) autofilling the
            // saved phone number / address-line digits into a numeric
            // settings field, which surfaced as junk like `*1126879`.
            autoComplete="off"
            data-form-type="other"
            min={0}
            max={100}
            step={0.1}
            value={form.tax_rate}
            onChange={setField("tax_rate")}
            data-testid="settings-tax-rate"
            className={INPUT_CLASS}
            placeholder="15"
          />
        </Field>
        <Field id="default_labour_rate" label="Default labour rate (per hour)">
          <input
            id="default_labour_rate"
            name="default_labour_rate"
            type="number"
            inputMode="decimal"
            autoComplete="off"
            data-form-type="other"
            min={0}
            step={0.5}
            value={form.default_labour_rate}
            onChange={setField("default_labour_rate")}
            data-testid="settings-labour-rate"
            className={INPUT_CLASS}
            placeholder="75"
          />
        </Field>
        <Field id="default_markup_pct" label="Materials markup (%)">
          <input
            id="default_markup_pct"
            name="default_markup_pct"
            type="number"
            inputMode="decimal"
            autoComplete="off"
            data-form-type="other"
            min={0}
            max={100}
            step={0.5}
            value={form.default_markup_pct}
            onChange={setField("default_markup_pct")}
            data-testid="settings-markup-pct"
            className={INPUT_CLASS}
            placeholder="20"
          />
        </Field>
      </Section>

      {/* Action row + status */}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SaveResultPill state={state} />
        <SaveButton />
      </div>
    </form>
  );
}

/** Wraps a labelled section group. */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="t2q-card-pro p-5 sm:p-7">
      <h2 className="font-display text-lg uppercase tracking-tight text-white sm:text-xl">
        {title}
      </h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Wraps a single label-+-input row. */
function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-400">
        {label}
      </span>
      {children}
    </label>
  );
}

const INPUT_CLASS =
  "h-11 w-full rounded-sm border border-ink-600 bg-ink-900 px-3 text-sm text-white placeholder:text-ink-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid="settings-save"
      disabled={pending}
      className="t2q-btn-primary-pro inline-flex h-11 items-center gap-2 px-6 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <FloppyDisk size={18} weight="bold" />
      {pending ? "Saving…" : "Save settings"}
    </button>
  );
}

function SaveResultPill({ state }: { state: SaveSettingsState }) {
  if (state.status === "ok") {
    const when = new Date(state.savedAt);
    const hhmm = when.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <p
        role="status"
        data-testid="settings-saved"
        className="inline-flex items-center gap-2 self-start rounded-sm border border-brand/40 bg-brand/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-brand sm:self-auto"
      >
        <Check size={14} weight="bold" />
        Saved {hhmm}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p
        role="alert"
        data-testid="settings-error"
        className="inline-flex items-center gap-2 self-start rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-red-300 sm:self-auto"
      >
        <Warning size={14} weight="bold" />
        {state.message}
      </p>
    );
  }
  return null;
}
