"use client";

import { useTransition, type ReactNode } from "react";
import { FileText } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { SectionTitle } from "@/components/ui/section-title";
import { NumberField, TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { currencySymbol } from "@/components/ui/lib/number-input";
import { saveEngagementSettings } from "../engagement-actions";
import { SelectField } from "./fields";
import {
  COUNTRY_CHOICES,
  CURRENCY_CHOICES,
  PAGE_FIELDS,
  choicesWith,
  runSaveUnits,
  saveToast,
  taxLabelFor,
  usualTaxRate,
  type SaveOutcome,
  type SettingsValues,
} from "./model";
import { SaveBar } from "./SaveBar";
import { saveProfile } from "./save-profile";
import { useDraft } from "./useDraft";

export type EngagementValues = {
  googleReviewUrl: string;
  autoReview: boolean;
  autoFollowup: boolean;
};

/** Follow-ups and reviews, when the server has them switched on (flags). */
export interface EngagementSetup {
  show: { reviews: boolean; followups: boolean };
  initial: EngagementValues;
}

async function saveEngagement(values: EngagementValues): Promise<SaveOutcome> {
  const result = await saveEngagementSettings({
    googleReviewUrl: values.googleReviewUrl,
    autoReview: values.autoReview,
    autoFollowup: values.autoFollowup,
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? "Couldn't save your follow-ups." };
}

const NO_ENGAGEMENT: EngagementValues = { googleReviewUrl: "", autoReview: false, autoFollowup: false };

/**
 * Rates and quotes: labour rate, markup, tax and currency (one Save), the
 * terms link, then `requestLink` (it saves on its own), then follow-ups and
 * reviews when switched on (part of the same Save).
 */
export function RatesForm({
  initial,
  loadedTaxLabel,
  engagement,
  requestLink,
}: {
  initial: SettingsValues;
  loadedTaxLabel: string;
  engagement: EngagementSetup | null;
  requestLink?: ReactNode;
}) {
  const toast = useToast();
  const profile = useDraft(initial, PAGE_FIELDS.rates);
  const follow = useDraft<EngagementValues>(engagement?.initial ?? NO_ENGAGEMENT);
  const [pending, startTransition] = useTransition();
  const { values, set } = profile;
  const taxLabel = taxLabelFor(loadedTaxLabel, values.country, values.currency);
  const usualRate = usualTaxRate(values.country, values.currency);
  const symbol = currencySymbol(values.currency);
  const dirty = profile.dirty || (engagement !== null && follow.dirty);

  const save = () => {
    if (pending || !dirty) return;
    startTransition(async () => {
      const profileSnapshot = profile.values;
      const followSnapshot = follow.values;
      const report = await runSaveUnits([
        { id: "profile", dirty: profile.dirty, run: () => saveProfile(profileSnapshot) },
        { id: "engagement", dirty: engagement !== null && follow.dirty, run: () => saveEngagement(followSnapshot) },
      ]);
      if (report.saved.includes("profile")) profile.commit(profileSnapshot);
      if (report.saved.includes("engagement")) follow.commit(followSnapshot);
      const message = saveToast(report);
      if (message) toast.show(message.message, { tone: message.tone });
    });
  };

  return (
    <form
      data-testid="settings-rates-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="space-y-6"
    >
      <Card as="section" padding="lg" className="space-y-6" aria-labelledby="rates-title">
        <SectionTitle id="rates-title">Your rates</SectionTitle>
        <NumberField
          label="Labour rate"
          name="default_labour_rate"
          prefix={symbol}
          suffix="an hour"
          maxIntegerDigits={5}
          placeholder="75"
          hint="What you charge an hour. New quotes start with this."
          value={values.default_labour_rate}
          onValueChange={(value) => set("default_labour_rate", value)}
          data-testid="settings-labour-rate"
        />
        <NumberField
          label="Markup on materials and other items"
          name="default_markup_pct"
          suffix="%"
          maxIntegerDigits={3}
          placeholder="20"
          hint="Added on top of what materials and other items cost you. Never on labour."
          value={values.default_markup_pct}
          onValueChange={(value) => set("default_markup_pct", value)}
          data-testid="settings-markup-pct"
        />
      </Card>

      <Card as="section" padding="lg" className="space-y-6" aria-labelledby="tax-title">
        <SectionTitle id="tax-title">Tax and currency</SectionTitle>
        <SelectField
          label="Country"
          name="country"
          options={choicesWith(COUNTRY_CHOICES, values.country)}
          hint="Sets the name of the tax on your quotes."
          value={values.country}
          onChange={(event) => set("country", event.target.value)}
          data-testid="settings-country"
        />
        <NumberField
          label={`${taxLabel} rate`}
          name="tax_rate"
          suffix="%"
          maxIntegerDigits={3}
          placeholder={String(usualRate)}
          hint={`Leave it empty to use ${usualRate}%, the usual rate.`}
          value={values.tax_rate}
          onValueChange={(value) => set("tax_rate", value)}
          data-testid="settings-tax-rate"
        />
        <SelectField
          label="Currency"
          name="currency"
          options={choicesWith(CURRENCY_CHOICES, values.currency)}
          hint="The money your quotes and invoices are in."
          value={values.currency}
          onChange={(event) => set("currency", event.target.value)}
          data-testid="settings-currency"
        />
      </Card>

      <Card as="section" padding="none" className="overflow-hidden" aria-labelledby="terms-title">
        <div className="px-5 pt-5 sm:px-6">
          <SectionTitle id="terms-title">Quote terms</SectionTitle>
        </div>
        <ul className="mt-2">
          <li>
            <ListRow
              href="/app/templates"
              icon={<FileText weight="bold" />}
              title="Terms templates"
              subtitle="Quotes are valid for 30 days. Save your own wording to use on quotes."
            />
          </li>
        </ul>
      </Card>

      {requestLink}

      {engagement ? (
        <Card as="section" padding="lg" className="space-y-6" aria-labelledby="follow-title">
          <SectionTitle id="follow-title">Follow-ups and reviews</SectionTitle>
          {engagement.show.followups ? (
            <Toggle
              label="Chase quotes for me"
              description="If a sent quote isn't accepted, we remind the client after 2 days and again after 5."
              checked={follow.values.autoFollowup}
              onChange={(next) => follow.set("autoFollowup", next)}
            />
          ) : null}
          {engagement.show.reviews ? (
            <>
              <TextField
                label="Your Google review link"
                name="google_review_url"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="https://g.page/r/…/review"
                hint="Where happy clients leave you a review."
                value={follow.values.googleReviewUrl}
                onChange={(event) => follow.set("googleReviewUrl", event.target.value)}
              />
              <Toggle
                label="Ask for a review"
                description="When a job is marked done, we email the client your review link, once."
                checked={follow.values.autoReview}
                onChange={(next) => follow.set("autoReview", next)}
              />
            </>
          ) : null}
        </Card>
      ) : null}

      <SaveBar dirty={dirty} pending={pending} />
    </form>
  );
}
