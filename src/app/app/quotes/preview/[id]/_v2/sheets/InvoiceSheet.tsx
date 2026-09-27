"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { SavePdfButton } from "@/app/app/_components/SavePdfButton";
import { DEFAULT_INVOICE_TERM_DAYS } from "@/lib/invoice-due-date";
import { createInvoiceFromQuote, markInvoiceSentByHand } from "../../actions";
import type { JobInvoice } from "../types";
import { ReasonList } from "./sender-parts";
import { AmountLine } from "./StepSheets";

const NO_CONNECTION = "No connection. Check your signal and try again.";

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
    return { error: NO_CONNECTION };
  }
}

export interface InvoiceSheetViewProps {
  invoice: JobInvoice | null;
  /** The invoice to send: the page's, or one made in this sheet before the refresh brings it in. */
  invoiceId: string | null;
  clientEmail: string | null;
  firstName: string | null;
  total: number;
  currency: string;
  /** Why an invoice can't be made yet (runInvoiceAgent). */
  blockers: string[];
  /** The tradie will send it themselves, so the sheet hands over the PDF. */
  selfSend: boolean;
  /** Which button is working: emailing it, only making it, or marking it sent by hand. */
  busy: "send" | "make" | "mark" | null;
  error: string | null;
  /** Make it if needed, then email it. */
  onSend: () => void;
  /** Make it if needed and hand over the PDF, nothing emailed. */
  onMake: () => void;
  /** The tradie has sent it themselves: record it as sent. */
  onMarkSent: () => void;
  onClose: () => void;
}

/**
 * The invoice sheet's screens. Asking: the amount and who it goes to, with
 * "Send invoice" at the thumb and, when there's an email address, a way to
 * make it without emailing it. Handing over: the PDF to send by hand, once
 * it's made and there's no email address or the tradie chose to.
 */
export function InvoiceSheetView({
  invoice,
  invoiceId,
  clientEmail,
  firstName,
  total,
  currency,
  blockers,
  selfSend,
  busy,
  error,
  onSend,
  onMake,
  onMarkSent,
  onClose,
}: InvoiceSheetViewProps) {
  const email = clientEmail?.trim() || null;
  const who = firstName ?? "your client";
  const blocked = !invoiceId && blockers.length > 0;
  const amount = invoice?.total ?? total;
  const amountCurrency = invoice?.currency ?? currency;

  // Made, and to be sent by hand: no email address, or the tradie chose to.
  if (invoiceId && (!email || selfSend)) {
    return (
      <BottomSheet
        open
        onClose={onClose}
        title="Send it yourself"
        description={email ? `It's made. We haven't emailed it to ${who}.` : `There's no email address for ${who} on this job.`}
        footer={
          invoice && invoice.status !== "draft" ? (
            <Button fullWidth data-testid="job-invoice-done" onClick={onClose}>
              Done
            </Button>
          ) : (
            <div className="grid gap-2">
              <Button
                fullWidth
                data-testid="job-invoice-sent-by-hand"
                loading={busy === "mark"}
                loadingLabel="Saving…"
                onClick={onMarkSent}
              >
                I&apos;ve sent it
              </Button>
              <Button variant="ghost" fullWidth data-testid="job-invoice-done" disabled={busy === "mark"} onClick={onClose}>
                Not yet
              </Button>
            </div>
          )
        }
      >
        <div className="space-y-4" data-testid="job-invoice-handover">
          <AmountLine amount={amount} currency={amountCurrency}>
            {invoice ? `on ${invoice.number}` : null}
          </AmountLine>
          <p>Download the invoice and send it the way you usually talk to {who}. Mark it paid when the money&apos;s in.</p>
          <SavePdfButton
            url={`/api/invoices/${invoiceId}/pdf`}
            filename={`${invoice?.number ?? "invoice"}.pdf`}
            label="Download the invoice PDF"
            look="new"
          />
          {error ? (
            <div role="alert">
              <Callout tone="bad" title={error} />
            </div>
          ) : null}
        </div>
      </BottomSheet>
    );
  }

  const working = busy !== null;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={email ? `Send the invoice to ${who}` : "Make the invoice"}
      description={
        invoice?.status === "draft"
          ? `${invoice.number} is made but not sent yet.`
          : `Due ${DEFAULT_INVOICE_TERM_DAYS} days after you send it.`
      }
      footer={
        email ? (
          <div className="grid gap-2">
            <Button
              variant="secondary"
              fullWidth
              data-testid="job-invoice-self"
              disabled={blocked || (working && busy !== "make")}
              loading={busy === "make"}
              loadingLabel="Making it…"
              onClick={onMake}
            >
              {invoiceId ? "I'll send it myself" : "Make it, I'll send it myself"}
            </Button>
            <Button
              fullWidth
              data-testid="job-invoice-confirm"
              disabled={blocked || (working && busy !== "send")}
              loading={busy === "send"}
              loadingLabel="Sending…"
              onClick={onSend}
            >
              Send invoice
            </Button>
          </div>
        ) : (
          <Button
            fullWidth
            data-testid="job-invoice-confirm"
            disabled={blocked}
            loading={working}
            loadingLabel="Making it…"
            onClick={onMake}
          >
            Make the invoice
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <AmountLine amount={amount} currency={amountCurrency}>
          {email ? `to ${email}` : null}
        </AmountLine>
        {blocked ? (
          <Callout tone="bad" title="This can't be invoiced yet">
            <ReasonList reasons={blockers} />
          </Callout>
        ) : null}
        {!email ? (
          <Callout tone="warn" title={`There's no email address for ${who}`}>
            So the invoice can&apos;t be emailed. Make it now, then download the PDF and send it yourself.
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

export interface InvoiceSheetProps {
  quoteId: string;
  invoice: JobInvoice | null;
  clientEmail: string | null;
  firstName: string | null;
  total: number;
  currency: string;
  /** Why an invoice can't be made yet (runInvoiceAgent). */
  blockers: string[];
  /** The invoice has been emailed. */
  onSent: () => void;
  /** The tradie sent it themselves and said so (defaults to closing the sheet). */
  onSentByHand?: () => void;
  onClose: () => void;
}

/**
 * Make the invoice (the create_invoice_from_quote RPC, as the classic card
 * does: a draft, nothing sent) and email it through the classic route. With
 * no email address, or when the tradie would rather send it themselves, it
 * makes the invoice and hands over the PDF to send by hand.
 */
export function InvoiceSheet({
  quoteId,
  invoice,
  clientEmail,
  firstName,
  total,
  currency,
  blockers,
  onSent,
  onSentByHand,
  onClose,
}: InvoiceSheetProps) {
  const [busy, setBusy] = useState<"send" | "make" | "mark" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Made in this sheet, before the page refresh brings it in.
  const [madeId, setMadeId] = useState<string | null>(null);
  const [selfSend, setSelfSend] = useState(false);
  const email = clientEmail?.trim() || null;
  const invoiceId = invoice?.id ?? madeId;

  async function make(): Promise<string | null> {
    if (invoiceId) return invoiceId;
    let made: Awaited<ReturnType<typeof createInvoiceFromQuote>>;
    try {
      made = await createInvoiceFromQuote(quoteId);
    } catch {
      setError(NO_CONNECTION);
      return null;
    }
    if ("error" in made) {
      setError(made.error);
      return null;
    }
    setMadeId(made.id);
    return made.id;
  }

  async function send() {
    setBusy("send");
    setError(null);
    const id = await make();
    if (!id || !email) {
      setBusy(null);
      return;
    }
    const sent = await sendInvoiceEmail(id);
    setBusy(null);
    if ("error" in sent) {
      setError(sent.error);
      return;
    }
    onSent();
  }

  async function markSent() {
    if (!invoiceId) return;
    setBusy("mark");
    setError(null);
    let marked: Awaited<ReturnType<typeof markInvoiceSentByHand>>;
    try {
      marked = await markInvoiceSentByHand(invoiceId);
    } catch {
      marked = { error: NO_CONNECTION };
    }
    setBusy(null);
    if ("error" in marked) {
      setError(marked.error);
      return;
    }
    (onSentByHand ?? onClose)();
  }

  async function makeOnly() {
    setBusy("make");
    setError(null);
    const id = await make();
    setBusy(null);
    if (id) setSelfSend(true);
  }

  return (
    <InvoiceSheetView
      invoice={invoice}
      invoiceId={invoiceId}
      clientEmail={clientEmail}
      firstName={firstName}
      total={total}
      currency={currency}
      blockers={blockers}
      selfSend={selfSend}
      busy={busy}
      error={error}
      onSend={send}
      onMake={makeOnly}
      onMarkSent={markSent}
      onClose={onClose}
    />
  );
}
