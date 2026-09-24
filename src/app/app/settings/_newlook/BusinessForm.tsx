"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { LogoField } from "./LogoField";
import { PAGE_FIELDS, runSaveUnits, saveToast, taxLabelFor, type SettingsValues } from "./model";
import { SaveBar } from "./SaveBar";
import { saveProfile } from "./save-profile";
import { useDraft } from "./useDraft";

/** Business details: name and logo, how clients reach you, tax number. */
export function BusinessForm({
  initial,
  loadedTaxLabel,
  logoUrl,
}: {
  initial: SettingsValues;
  loadedTaxLabel: string;
  logoUrl: string | null;
}) {
  const toast = useToast();
  const draft = useDraft(initial, PAGE_FIELDS.business);
  const [pending, startTransition] = useTransition();
  const { values, set } = draft;
  const taxLabel = taxLabelFor(loadedTaxLabel, values.country, values.currency);

  const save = () => {
    if (pending || !draft.dirty) return;
    startTransition(async () => {
      const snapshot = values;
      const report = await runSaveUnits([{ id: "profile", dirty: true, run: () => saveProfile(snapshot) }]);
      if (report.saved.includes("profile")) draft.commit(snapshot);
      const message = saveToast(report);
      if (message) toast.show(message.message, { tone: message.tone });
    });
  };

  return (
    <form
      data-testid="settings-business-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="space-y-6"
    >
      <Card as="section" padding="lg" className="space-y-6" aria-labelledby="business-name-title">
        <SectionTitle id="business-name-title">Name and logo</SectionTitle>
        <TextField
          label="Business name"
          name="business_name"
          autoComplete="organization"
          placeholder="e.g. Bayside Builders Ltd"
          hint="Goes at the top of every quote and invoice."
          value={values.business_name}
          onChange={(event) => set("business_name", event.target.value)}
          data-testid="settings-business-name"
        />
        <LogoField logoUrl={logoUrl} />
      </Card>

      <Card as="section" padding="lg" className="space-y-6" aria-labelledby="business-contact-title">
        <SectionTitle id="business-contact-title">How clients reach you</SectionTitle>
        <TextField
          label="Phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="021 000 0000"
          hint="Printed on your quotes so clients can call you."
          value={values.phone}
          onChange={(event) => set("phone", event.target.value)}
          data-testid="settings-phone"
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@yourbusiness.co.nz"
          hint="When a client replies to a quote or invoice, it comes here."
          value={values.email}
          onChange={(event) => set("email", event.target.value)}
          data-testid="settings-email"
        />
        <TextField
          label="Address"
          name="address"
          autoComplete="street-address"
          placeholder="123 Main Rd, Tauranga"
          hint="Printed on your quotes and invoices."
          value={values.address}
          onChange={(event) => set("address", event.target.value)}
          data-testid="settings-address"
        />
      </Card>

      <Card as="section" padding="lg" aria-label={`${taxLabel} number`}>
        <TextField
          label={`${taxLabel} number`}
          name="gst_number"
          autoComplete="off"
          placeholder="123-456-789"
          hint="Printed on your quotes and invoices."
          value={values.gst_number}
          onChange={(event) => set("gst_number", event.target.value)}
          data-testid="settings-gst-number"
        />
      </Card>

      <SaveBar dirty={draft.dirty} pending={pending} />
    </form>
  );
}
