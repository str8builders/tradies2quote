"use client";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { SectionTitle } from "@/components/ui/section-title";
import { StatusPill } from "@/components/ui/status-pill";
import type { Tone } from "@/components/ui/styles";
import { SavePdfButton } from "@/app/app/_components/SavePdfButton";
import { DEFAULT_INVOICE_TERM_DAYS } from "@/lib/invoice-due-date";
import type { JobInvoice } from "../types";

const STATUS: Record<JobInvoice["status"], { label: string; tone: Tone }> = {
  draft: { label: "Not sent", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  overdue: { label: "Late", tone: "bad" },
  paid: { label: "Paid", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function invoiceDueLine(invoice: JobInvoice): string {
  if (invoice.status === "paid") return invoice.paidOn ? `Paid on ${invoice.paidOn}` : "Paid in full";
  const late = invoice.daysLate ?? 0;
  if (late > 0) return `${late} ${late === 1 ? "day" : "days"} late`;
  if (invoice.status === "draft") return `Due ${DEFAULT_INVOICE_TERM_DAYS} days after you send it`;
  return invoice.dueOn ? `Due ${invoice.dueOn}` : "Due on receipt";
}

/**
 * The invoice inside the job: number, state, amount, due date and a PDF to
 * keep. Its actions (send, remind, mark paid) are the bottom bar's buttons.
 */
export function InvoiceCard({
  invoice,
  quoteTotal,
  currency,
}: {
  invoice: JobInvoice | null;
  /** What a new invoice will be for (the quote total). */
  quoteTotal: number;
  currency: string;
}) {
  return (
    <section aria-labelledby="job-invoice" className="space-y-3">
      <SectionTitle id="job-invoice">Invoice</SectionTitle>
      {invoice ? (
        <Card data-testid="job-invoice-card" data-invoice-status={invoice.status}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{invoice.number}</p>
              <Money amount={invoice.total} currency={invoice.currency} className="block text-ui-xl font-semibold" />
              <p className={invoice.daysLate ? "font-semibold text-ui-bad" : "text-ui-muted"}>
                {invoiceDueLine(invoice)}
              </p>
            </div>
            <StatusPill tone={STATUS[invoice.status].tone}>{STATUS[invoice.status].label}</StatusPill>
          </div>
          <div className="mt-4">
            <SavePdfButton
              url={`/api/invoices/${invoice.id}/pdf`}
              filename={`${invoice.number}.pdf`}
              label="Download the invoice PDF"
              className={buttonClasses({ variant: "secondary", fullWidth: true })}
            />
          </div>
        </Card>
      ) : (
        <Card data-testid="job-invoice-card" data-invoice-status="none">
          <p className="font-semibold">No invoice yet</p>
          <p className="mt-1 text-ui-muted">
            It will be for <Money amount={quoteTotal} currency={currency} />, due {DEFAULT_INVOICE_TERM_DAYS} days
            after you send it.
          </p>
        </Card>
      )}
    </section>
  );
}
