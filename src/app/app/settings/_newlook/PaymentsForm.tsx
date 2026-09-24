"use client";

import { useState, useTransition, type ReactNode } from "react";
import { CheckCircle, CreditCard } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { StatusPill } from "@/components/ui/status-pill";
import { NumberField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { saveDepositPctAction } from "../payments-actions";
import { TextAreaField } from "./fields";
import {
  PAGE_FIELDS,
  clampDepositPct,
  runSaveUnits,
  saveToast,
  type SaveOutcome,
  type SettingsValues,
} from "./model";
import { SaveBar } from "./SaveBar";
import { saveProfile } from "./save-profile";
import { useDraft } from "./useDraft";

/** Stripe Connect status, as the old settings page reads it (flag-gated). */
export interface CardPaymentsStatus {
  connected: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  depositPct: number;
}

type DepositValues = { depositPct: string };

async function saveDeposit(value: string): Promise<SaveOutcome> {
  const result = await saveDepositPctAction(clampDepositPct(value));
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? "Couldn't save the deposit." };
}

/**
 * Payments: how clients pay you (printed on invoices), card payments and
 * deposits when switched on, then `plan` (the server leaves it out inside
 * the iOS app). Invoice wording and the deposit share one Save.
 */
export function PaymentsForm({
  initial,
  cardPayments,
  plan,
}: {
  initial: SettingsValues;
  cardPayments: CardPaymentsStatus | null;
  plan?: ReactNode;
}) {
  const toast = useToast();
  const profile = useDraft(initial, PAGE_FIELDS.payments);
  const deposit = useDraft<DepositValues>({ depositPct: String(cardPayments?.depositPct ?? 0) });
  const [pending, startTransition] = useTransition();
  const [connecting, setConnecting] = useState(false);
  const canTakeDeposits = Boolean(cardPayments?.chargesEnabled);
  const dirty = profile.dirty || (canTakeDeposits && deposit.dirty);

  const save = () => {
    if (pending || !dirty) return;
    startTransition(async () => {
      const profileSnapshot = profile.values;
      // The server rounds and clamps to 0–100; show the saved number.
      const depositSnapshot = { depositPct: String(clampDepositPct(deposit.values.depositPct)) };
      const report = await runSaveUnits([
        { id: "profile", dirty: profile.dirty, run: () => saveProfile(profileSnapshot) },
        {
          id: "deposit",
          dirty: canTakeDeposits && deposit.dirty,
          run: () => saveDeposit(depositSnapshot.depositPct),
        },
      ]);
      if (report.saved.includes("profile")) profile.commit(profileSnapshot);
      if (report.saved.includes("deposit")) {
        deposit.set("depositPct", depositSnapshot.depositPct);
        deposit.commit(depositSnapshot);
      }
      const message = saveToast(report);
      if (message) toast.show(message.message, { tone: message.tone });
    });
  };

  const connectStripe = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/payments/connect", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (!res.ok || !data.url) {
        toast.show("Couldn't start the Stripe setup. Try again.", { tone: "bad" });
        setConnecting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.show("No signal. Try again in a minute.", { tone: "bad" });
      setConnecting(false);
    }
  };

  return (
    <form
      data-testid="settings-payments-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="space-y-6"
    >
      <Card as="section" padding="lg" className="space-y-6" aria-labelledby="pay-you-title">
        <SectionTitle id="pay-you-title">How clients pay you</SectionTitle>
        <TextAreaField
          label="Bank details and how to pay"
          name="payment_instructions"
          rows={4}
          maxLength={500}
          placeholder={"Bank: 12-3456-7890123-00\nUse the invoice number as the reference."}
          hint="Printed on your invoices."
          value={profile.values.payment_instructions}
          onChange={(event) => profile.set("payment_instructions", event.target.value)}
          data-testid="settings-payment-instructions"
        />
      </Card>

      {cardPayments ? (
        <Card as="section" padding="lg" className="space-y-5" aria-labelledby="card-payments-title">
          <SectionTitle
            id="card-payments-title"
            description="Clients can pay a deposit by card the moment they accept a quote. The money goes to your bank through Stripe."
          >
            Card payments and deposits
          </SectionTitle>
          {canTakeDeposits ? (
            <>
              <StatusPill tone="ok" icon={<CheckCircle weight="fill" />}>
                Card payments are on
              </StatusPill>
              <NumberField
                label="Deposit"
                name="deposit_pct"
                suffix="% of the quote"
                decimals={0}
                maxIntegerDigits={3}
                placeholder="0"
                hint="What clients pay by card when they accept. 0 to 100."
                value={deposit.values.depositPct}
                onValueChange={(value) => deposit.set("depositPct", value)}
                data-testid="settings-deposit-pct"
              />
            </>
          ) : (
            <>
              {cardPayments.connected ? (
                <p className="text-ui-sm text-ui-muted">
                  Stripe needs a few more details before you can take card payments.
                </p>
              ) : null}
              <Button
                variant="secondary"
                fullWidth
                icon={<CreditCard weight="bold" />}
                loading={connecting}
                loadingLabel="Opening Stripe…"
                onClick={connectStripe}
                data-testid="settings-connect-stripe"
              >
                {cardPayments.connected ? "Finish the Stripe setup" : "Set up card payments"}
              </Button>
            </>
          )}
        </Card>
      ) : null}

      {plan}

      <SaveBar dirty={dirty} pending={pending} />
    </form>
  );
}
