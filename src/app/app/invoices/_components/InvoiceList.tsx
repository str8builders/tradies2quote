"use client";

import { formatNZShortDate } from "@/lib/format-date";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useMounted } from "@/lib/use-mounted";
import {
  ArrowSquareOut,
  CheckSquare,
  Receipt,
  Square,
  Trash,
  X,
} from "@phosphor-icons/react";
import { formatCurrency } from "@/lib/quote-defaults";
import type { InvoiceStatus } from "@/lib/types/invoice";
import { bulkDeleteInvoices } from "../actions";

/**
 * Client-rendered invoice list with optional bulk-select mode.
 *
 * Default view is identical to the previous server-rendered list —
 * the tradie taps an invoice and lands on its quote preview. Tapping
 * "Select" puts the list into bulk mode: a checkbox appears on every
 * row, a sticky action bar pins at the bottom showing "N selected"
 * with a Delete button. Tapping Delete opens a confirm dialog;
 * confirming fires `bulkDeleteInvoices` and the page re-validates.
 *
 * Soft-delete only — the action sets `deleted_at` and every list
 * query in the app filters those out, so deleted invoices vanish from
 * the UI but the underlying row + quote snapshot survive. Recovery is
 * an SQL job, not an in-app undo.
 */

type Row = {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  currency: string;
  due_date: string;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
  quote_id: string;
  invoice_data: unknown;
  clientName: string;
};

type Props = {
  rows: Row[];
};

export function InvoiceList({ rows }: Props) {
  // Relative timestamps below read Date.now(); gate them so SSR + first paint
  // render a stable absolute date, then swap to "5m ago" after mount.
  const mounted = useMounted();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelected(new Set());
    setError(null);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
    setError(null);
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(rows.map((r) => r.id)));
  };

  const onConfirmDelete = () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await bulkDeleteInvoices(ids);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      exitSelectMode();
      setToast(
        `Deleted ${result.deleted} invoice${result.deleted === 1 ? "" : "s"}.`,
      );
      setTimeout(() => setToast(null), 4000);
    });
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-400">
          {selectMode
            ? `// ${selected.size} of ${rows.length} selected`
            : `// ${rows.length} invoice${rows.length === 1 ? "" : "s"}`}
        </p>
        {!selectMode && rows.length > 0 && (
          <button
            type="button"
            onClick={enterSelectMode}
            data-testid="invoices-select-btn"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-sm border border-ink-700 bg-ink-800 px-3 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-200 transition-colors hover:border-brand hover:text-brand"
          >
            <CheckSquare size={13} weight="bold" />
            Select
          </button>
        )}
        {selectMode && (
          <div className="flex items-center gap-2">
            {!allSelected && (
              <button
                type="button"
                onClick={selectAll}
                data-testid="invoices-select-all"
                className="inline-flex min-h-[44px] items-center rounded-sm border border-ink-700 bg-ink-800 px-3 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-200 hover:border-brand hover:text-brand"
              >
                Select all
              </button>
            )}
            <button
              type="button"
              onClick={exitSelectMode}
              data-testid="invoices-cancel-select"
              className="inline-flex min-h-[44px] items-center gap-1 rounded-sm border border-ink-700 bg-ink-800 px-3 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300 hover:text-white"
            >
              <X size={13} weight="bold" />
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          data-testid="invoices-bulk-error"
          className="mb-3 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((inv) => {
          const isSelected = selected.has(inv.id);
          const row = (
            <div className="group flex items-start gap-3 hover:opacity-95">
              {selectMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleRow(inv.id);
                  }}
                  aria-label={isSelected ? "Deselect" : "Select"}
                  aria-pressed={isSelected}
                  data-testid={`invoice-checkbox-${inv.id}`}
                  className="mt-0.5 shrink-0 text-brand"
                >
                  {isSelected ? (
                    <CheckSquare size={20} weight="fill" />
                  ) : (
                    <Square size={20} weight="bold" className="text-ink-400" />
                  )}
                </button>
              )}
              <Receipt
                size={18}
                weight="bold"
                className="mt-0.5 shrink-0 text-brand"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="font-display text-sm uppercase tracking-tight text-white sm:text-base">
                    {inv.invoice_number}
                  </p>
                  <p className="truncate text-sm text-ink-200">
                    {inv.clientName}
                  </p>
                </div>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                  {formatRelativeOrDate(inv.created_at, mounted)} ·{" "}
                  {inv.status === "paid" && inv.paid_at
                    ? `Paid ${formatRelativeOrDate(inv.paid_at, mounted)}`
                    : inv.status === "sent" && inv.sent_at
                      ? `Sent ${formatRelativeOrDate(inv.sent_at, mounted)}`
                      : `Due ${formatDueLabel(inv.due_date, mounted)}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="font-display text-base text-white sm:text-lg">
                  {formatCurrency(inv.total_amount, inv.currency)}
                </span>
                <span
                  className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${statusPill(inv.status as InvoiceStatus)}`}
                >
                  {inv.status}
                </span>
              </div>
              {!selectMode && (
                <ArrowSquareOut
                  size={14}
                  weight="bold"
                  className="mt-1 ml-1 hidden shrink-0 text-ink-400 group-hover:text-brand sm:block"
                />
              )}
            </div>
          );
          return (
            <li
              key={inv.id}
              data-testid={`invoice-row-${inv.id}`}
              data-invoice-status={inv.status}
              data-selected={isSelected ? "true" : undefined}
              className={`border-b border-ink-700/60 pb-3 last:border-b-0 last:pb-0 ${
                selectMode && isSelected
                  ? "rounded-sm bg-brand/5"
                  : ""
              }`}
            >
              {selectMode ? (
                <button
                  type="button"
                  onClick={() => toggleRow(inv.id)}
                  className="w-full text-left"
                >
                  {row}
                </button>
              ) : (
                <Link
                  href={`/app/quotes/preview/${inv.quote_id}#agent-invoice`}
                >
                  {row}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {selectMode && selected.size > 0 && (
        <div
          data-testid="invoices-bulk-action-bar"
          className="fixed inset-x-3 bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))] z-40 mx-auto max-w-md sm:bottom-6"
        >
          <div className="flex items-center justify-between gap-3 rounded-sm border border-brand/50 bg-ink-900/95 px-4 py-3 backdrop-blur shadow-lg">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-200">
              {selected.size} selected
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
              disabled={pending}
              data-testid="invoices-bulk-delete"
              className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-red-500/50 bg-red-500/15 px-3 font-display text-xs uppercase tracking-tight text-red-300 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash size={14} weight="bold" />
              Delete
            </button>
          </div>
        </div>
      )}

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invoices-confirm-title"
          data-testid="invoices-confirm-dialog"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => !pending && setConfirming(false)}
        >
          <div
            className="t2q-card-pro w-full max-w-sm p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
              {"// confirm delete"}
            </div>
            <h2
              id="invoices-confirm-title"
              className="mt-1 font-display text-lg uppercase tracking-tight"
            >
              Delete {selected.size} invoice
              {selected.size === 1 ? "" : "s"}?
            </h2>
            <p className="mt-2 text-sm text-ink-300">
              They&apos;ll disappear from your list. The underlying quote
              records stay intact — only the invoice draft is removed.
              This can&apos;t be undone from the app.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="inline-flex h-11 items-center justify-center rounded-sm border border-ink-700 bg-ink-800 px-4 font-mono text-xs uppercase tracking-[0.2em] text-ink-300 hover:border-ink-500 hover:text-white disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={pending}
                data-testid="invoices-confirm-delete"
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-sm border border-red-500/60 bg-red-500/20 px-5 font-display text-sm uppercase tracking-tight text-red-200 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash size={14} weight="bold" />
                {pending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          data-testid="invoices-toast"
          className="fixed inset-x-3 bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-sm border border-brand/50 bg-brand/15 px-4 py-3 text-sm text-white shadow-lg sm:bottom-6"
        >
          {toast}
        </div>
      )}
    </>
  );
}

function statusPill(status: InvoiceStatus): string {
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
  // Engine-independent: Intl month names differ between Node and WebKit.
  return formatNZShortDate(iso);
}

function formatDueLabel(iso: string | null, mounted: boolean): string {
  if (!iso) return "on receipt";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  if (!mounted) return nzShortDate(iso); // stable until mounted — no Date.now() in SSR
  const days = Math.round((t - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days}d`;
  return nzShortDate(iso);
}

function formatRelativeOrDate(iso: string, mounted: boolean): string {
  if (!mounted) return nzShortDate(iso); // stable until mounted — no Date.now() in SSR
  const then = new Date(iso).getTime();
  const diffSec = (Date.now() - then) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.round(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86_400) return `${Math.round(diffSec / 86_400)}d ago`;
  return nzShortDate(iso);
}
