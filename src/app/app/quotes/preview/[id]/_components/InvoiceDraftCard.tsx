"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMounted } from "@/lib/use-mounted";
import {
  ArrowRight,
  Check,
  EnvelopeSimple,
  FileText,
  Info,
  Receipt,
  Warning,
} from "@phosphor-icons/react";
import { formatCurrency } from "@/lib/quote-defaults";
import type { QuoteData, QuoteStatus } from "@/lib/quote-types";
import type { InvoiceStatus, InvoiceSummary } from "@/lib/types/invoice";
import { runInvoiceAgent } from "@/lib/agents/invoice";
import { createInvoiceFromQuote, markInvoicePaid } from "../actions";
import { SavePdfButton } from "@/app/app/_components/SavePdfButton";

/**
 * Wave 14 — Invoice draft card.
 *
 * Two modes:
 *
 *   1. No invoice exists for this quote → renders a preview of what
 *      the draft will look like (subtotal / tax / total / 7-day due),
 *      plus a "Create draft invoice" button. The button calls the
 *      `createInvoiceFromQuote` server action, which in turn calls
 *      the `create_invoice_from_quote(uuid)` Postgres RPC — the
 *      ONLY path that ever inserts into public.invoices.
 *
 *   2. Invoice already exists → renders the invoice number, status,
 *      and total. No "create another" button (the RPC is idempotent
 *      and would just return the same id).
 *
 * Visibility: renders only when `quote.status === 'completed'`. The
 * card lives inside an anchor `id="agent-invoice"` so the
 * LifecycleCard's "Suggested agent → Invoice" button scrolls here.
 *
 * No PDF, no email, no automation in Wave 14. Wave 15 brings send /
 * mark-paid / overdue cron.
 */
interface Props {
  quoteId: string;
  status: QuoteStatus;
  quoteData: QuoteData | null;
  existingInvoice: InvoiceSummary | null;
}

export function InvoiceDraftCard({
  quoteId,
  status,
  quoteData,
  existingInvoice,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status !== "completed") return null;

  const preview = runInvoiceAgent(status, quoteData);
  const canCreate = preview.reason === "ready";

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createInvoiceFromQuote(quoteId);
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <section
      id="agent-invoice"
      data-testid="invoice-draft-card"
      aria-labelledby="invoice-draft-heading"
      className="t2q-card-pro mt-6 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Receipt size={16} weight="bold" className="text-brand" />
        <span className="t2q-section-label-pro">{"// invoice"}</span>
        {existingInvoice ? (
          <span
            data-testid="invoice-status-pill"
            className={`ml-auto inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${invoiceStatusPill(existingInvoice.status)}`}
          >
            {existingInvoice.status}
          </span>
        ) : null}
      </div>

      {existingInvoice ? (
        <ExistingInvoiceBody invoice={existingInvoice} />
      ) : (
        <DraftPreviewBody
          preview={preview}
          canCreate={canCreate}
          pending={pending}
          onCreate={handleCreate}
        />
      )}

      {error ? (
        <p
          data-testid="invoice-error"
          role="alert"
          className="mt-4 rounded-sm border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}

      <p className="mt-5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
        <Info size={12} weight="bold" />
        Drafts live in your records. Send by email + PDF; mark paid when the money lands.
      </p>
    </section>
  );
}

function ExistingInvoiceBody({ invoice }: { invoice: InvoiceSummary }) {
  const router = useRouter();
  const [sendState, setSendState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [paidState, setPaidState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  // Relative due-date label reads Date.now(); gate it so SSR + first paint render
  // a stable absolute date, then swap to "in N days" after mount (avoids #418).
  const mounted = useMounted();

  const isDraft = invoice.status === "draft";
  const isSent = invoice.status === "sent" || invoice.status === "overdue";
  const isPaid = invoice.status === "paid";
  const isCancelled = invoice.status === "cancelled";

  async function handleSend() {
    setActionError(null);
    setSendState("sending");
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: "POST",
        // PDF render + email send — bounded so the button can't wedge.
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setActionError(data.message ?? "Could not send the invoice.");
        setSendState("error");
        return;
      }
      setSendState("sent");
      router.refresh();
    } catch {
      setActionError("Network error. Please try again.");
      setSendState("error");
    }
  }

  async function handleMarkPaid() {
    setActionError(null);
    setPaidState("saving");
    const res = await markInvoicePaid(invoice.id);
    if ("error" in res) {
      setActionError(res.error);
      setPaidState("error");
      return;
    }
    setPaidState("saved");
    router.refresh();
  }

  return (
    <>
      <h2
        id="invoice-draft-heading"
        data-testid="invoice-number"
        className="mt-3 font-display text-2xl uppercase tracking-tight text-white sm:text-3xl"
      >
        {invoice.invoice_number}
      </h2>
      <p className="mt-2 text-sm text-ink-200">
        Total{" "}
        <span className="font-display text-brand">
          {formatCurrency(invoice.total_amount, invoice.currency)}
        </span>
        {isPaid ? " · Paid in full" : ` · Due ${formatDueDate(invoice.due_date, mounted)}`}
        {isSent && invoice.status === "sent"
          ? " · Sent to client"
          : ""}
      </p>

      {/* Back up the invoice PDF to the device (Save to Files on mobile).
          Always available, even once paid/sent, so the tradie can keep a
          copy in their own records. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SavePdfButton
          url={`/api/invoices/${invoice.id}/pdf`}
          filename={`${invoice.invoice_number}.pdf`}
          label="Save / back up PDF"
          className="t2q-btn-ghost-pro inline-flex h-11 items-center gap-2 px-5 disabled:opacity-50"
        />
      </div>

      {!isCancelled && !isPaid && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="invoice-send-button"
            onClick={handleSend}
            disabled={sendState === "sending"}
            className="t2q-btn-primary-pro inline-flex h-11 items-center gap-2 px-5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <EnvelopeSimple size={16} weight="bold" />
            {sendState === "sending"
              ? "Sending…"
              : isDraft
                ? "Send invoice"
                : "Resend invoice"}
          </button>
          <button
            type="button"
            data-testid="invoice-mark-paid-button"
            onClick={handleMarkPaid}
            disabled={paidState === "saving"}
            className="t2q-btn-ghost-pro inline-flex h-11 items-center gap-2 px-5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={16} weight="bold" />
            {paidState === "saving" ? "Marking…" : "Mark as paid"}
          </button>
        </div>
      )}

      {sendState === "sent" && (
        <p
          data-testid="invoice-send-ok"
          className="mt-3 inline-flex items-center rounded-sm border border-brand bg-brand px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-900"
        >
          {"// invoice sent"}
        </p>
      )}
      {paidState === "saved" && (
        <p
          data-testid="invoice-paid-ok"
          className="mt-3 inline-flex items-center rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-300"
        >
          {"// marked paid"}
        </p>
      )}
      {actionError && (
        <p
          data-testid="invoice-action-error"
          role="alert"
          className="mt-3 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {actionError}
        </p>
      )}
    </>
  );
}

function DraftPreviewBody({
  preview,
  canCreate,
  pending,
  onCreate,
}: {
  preview: ReturnType<typeof runInvoiceAgent>;
  canCreate: boolean;
  pending: boolean;
  onCreate: () => void;
}) {
  return (
    <>
      <h2
        id="invoice-draft-heading"
        className="mt-3 font-display text-2xl uppercase tracking-tight text-white sm:text-3xl"
      >
        Ready to invoice.
      </h2>
      <p className="mt-2 text-sm text-ink-200">
        Generate a draft invoice from this completed quote. Nothing is
        sent — the draft lives in your records until Wave 15&apos;s send
        flow lands.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PreviewTile
          label="Subtotal"
          value={formatCurrency(preview.subtotal, preview.currency)}
        />
        <PreviewTile
          label="Tax"
          value={formatCurrency(preview.taxAmount, preview.currency)}
        />
        <PreviewTile
          label="Total"
          value={formatCurrency(preview.totalAmount, preview.currency)}
          tone="brand"
        />
        <PreviewTile label="Due" value="In 7 days" />
      </dl>

      {preview.blockers.length > 0 ? (
        <ul
          data-testid="invoice-blockers"
          className="mt-4 space-y-2 rounded-sm border border-hivis/30 bg-hivis/5 p-3"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-hivis">
            {"// fix these first"}
          </p>
          {preview.blockers.map((b) => (
            <li
              key={b}
              className="flex items-start gap-2 text-sm text-ink-100"
            >
              <Warning
                size={14}
                weight="fill"
                className="mt-0.5 shrink-0 text-hivis"
                aria-hidden="true"
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="invoice-create-button"
          onClick={onCreate}
          disabled={pending || !canCreate}
          className="t2q-btn-primary-pro inline-flex h-11 items-center gap-2 px-5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? (
            "Creating draft…"
          ) : (
            <>
              <FileText size={16} weight="bold" />
              Create draft invoice
              <ArrowRight size={14} weight="bold" />
            </>
          )}
        </button>
      </div>
    </>
  );
}

function PreviewTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "brand";
}) {
  return (
    <div className="rounded-sm border border-ink-700/60 bg-ink-900/40 px-3 py-3">
      <p
        className={`font-display tabular-nums leading-none text-lg sm:text-xl ${tone === "brand" ? "text-brand" : "text-white"}`}
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
        {label}
      </p>
    </div>
  );
}

function invoiceStatusPill(status: InvoiceStatus): string {
  switch (status) {
    case "draft":
      return "border-ink-600 bg-ink-800 text-ink-200";
    case "sent":
      return "border-blue-500/40 bg-blue-500/10 text-blue-300";
    case "paid":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "overdue":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    case "cancelled":
      return "border-ink-600 bg-ink-800 text-ink-400";
  }
}

// Stable, timezone-pinned absolute date — deterministic across server (UTC) and
// the visitor's browser, so it's safe to render during SSR + first paint.
function nzShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    timeZone: "Pacific/Auckland",
  });
}

function formatDueDate(iso: string, mounted: boolean): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "in 7 days";
  if (!mounted) return nzShortDate(iso); // stable until mounted — no Date.now() in SSR
  const days = Math.round((t - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0)
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} day${days === 1 ? "" : "s"}`;
}
