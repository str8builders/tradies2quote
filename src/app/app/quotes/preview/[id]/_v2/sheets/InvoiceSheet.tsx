"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DEFAULT_INVOICE_TERM_DAYS } from "@/lib/invoice-due-date";
import { createInvoiceFromQuote } from "../../actions";
import type { JobInvoice } from "../types";
import { ReasonList } from "./sender-parts";
import { AmountLine } from "./StepSheets";

export type InvoiceDone = "sent" | "made";

/** Email an invoice through the classic route (PDF, email, then status "sent"). */
export async function sendInvoiceEmail(invoiceId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch(`/api/invoices/${invoiceId}/send`, {
      method: "POST",
      // Making the PDF and emailing it; this only catches a stall.
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { error: data.message?.trim() || "The invoice didn't send. Try again in a minute." };
  } catch {
    return { error: "No connection. Check your signal and try again." };
  }
}

/**
 * Make the invoice (the create_invoice_from_quote RPC, as the classic card
 * does) and email it. With no email address for the client it only makes
 * the invoice, and the PDF is on the job to send by hand.
 */
export function InvoiceSheet({
  quoteId,
  invoice,
  clientEmail,
  firstName,
  total,
  currency,
  blockers,
  onDone,
  onClose,
}: {
  quoteId: string;
  invoice: JobInvoice | null;
  clientEmail: string | null;
  firstName: string | null;
  total: number;
  currency: string;
  /** Why an invoice can't be made yet (runInvoiceAgent). */
  blockers: string[];
  onDone: (what: InvoiceDone) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Made in this sheet, before the page refresh brings it in.
  const [madeId, setMadeId] = useState<string | null>(null);
  const email = clientEmail?.trim() || null;
  const invoiceId = invoice?.id ?? madeId;
  const who = firstName ?? "your client";
  const blocked = !invoiceId && blockers.length > 0;
  const amount = invoice?.total ?? total;

  async function go() {
    setBusy(true);
    setError(null);
    let id = invoiceId;
    if (!id) {
      const made = await createInvoiceFromQuote(quoteId);
      if ("error" in made) {
        setError(made.error);
        setBusy(false);
        return;
      }
      id = made.id;
      setMadeId(made.id);
    }
    if (!email) {
      setBusy(false);
      onDone("made");
      return;
    }
    const sent = await sendInvoiceEmail(id);
    setBusy(false);
    if ("error" in sent) {
      setError(sent.error);
      return;
    }
    onDone("sent");
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={email ? `Send the invoice to ${who}` : "Make the invoice"}
      description={
        invoice?.status === "draft" || madeId
          ? `${invoice?.number ?? "The invoice"} is made but not sent yet.`
          : `Due ${DEFAULT_INVOICE_TERM_DAYS} days after you send it.`
      }
      footer={
        <Button fullWidth data-testid="job-invoice-confirm" disabled={blocked} loading={busy} loadingLabel={email ? "Sending…" : "Making it…"} onClick={go}>
          {email ? "Send invoice" : "Make the invoice"}
        </Button>
      }
    >
      <div className="space-y-4">
        <AmountLine amount={amount} currency={invoice?.currency ?? currency}>
          {email ? `to ${email}` : null}
        </AmountLine>
        {blocked ? (
          <Callout tone="bad" title="This can't be invoiced yet">
            <ReasonList reasons={blockers} />
          </Callout>
        ) : null}
        {!email ? (
          <Callout tone="warn" title={`There's no email address for ${who}`}>
            So the invoice can&apos;t be emailed. Make it now, then download the PDF from the job and send it yourself.
          </Callout>
        ) : null}
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
