"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Money } from "@/components/ui/money";
import { NumberField } from "@/components/ui/text-field";
import { TAP } from "@/components/ui/styles";
import { formatHours } from "@/lib/timesheet/hours";
import { buildTimesheetInvoice, parseRate } from "@/lib/timesheet/invoice";
import { weekLabel } from "@/lib/timesheet/week";
import { createTimesheetInvoice } from "../actions";
import type { TimesheetData } from "../_lib/types";
import { unbilledByClient } from "../_lib/view";

/**
 * "Invoice this week" (the owner): pick a client with hours still to bill,
 * check the rate, see the lines and the total exactly as they'll be saved,
 * and make the invoice. It opens as a finished job, where it's sent.
 */
export function InvoiceWeekSheet({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: TimesheetData;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Invoice this week" description={`Hours for ${weekLabel(data.weekStart)}`}>
      {open ? <InvoiceForm data={data} /> : null}
    </BottomSheet>
  );
}

function InvoiceForm({ data }: { data: TimesheetData }) {
  const router = useRouter();
  const choices = useMemo(() => unbilledByClient(data.entries), [data.entries]);
  const [clientId, setClientId] = useState<string | null>(choices[0]?.clientId ?? null);
  const [rateText, setRateText] = useState(data.labourRate > 0 ? String(data.labourRate) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const client = data.clients.find((c) => c.id === clientId) ?? null;
  const rate = parseRate(rateText);
  const preview = useMemo(() => {
    if (!client) return null;
    return buildTimesheetInvoice({
      entries: data.entries
        .filter((e) => e.clientId === client.id && !e.invoice)
        .map((e) => ({ id: e.id, workDate: e.workDate, hours: e.hours, note: e.note, person: e.person })),
      rate: rate ?? 0,
      client: { name: client.name, email: client.email, address: client.address, phone: client.phone },
      period: weekLabel(data.weekStart),
      currency: data.currency,
      taxLabel: data.taxLabel,
      taxRate: data.taxRate,
    });
  }, [client, data, rate]);

  if (choices.length === 0) {
    return (
      <p className="py-4 text-ui-base text-ui-muted">
        No hours to invoice this week. Hours need a client, and ones already on an invoice aren&apos;t counted twice.
      </p>
    );
  }

  const create = () => {
    setError(null);
    if (!clientId) return setError("Pick a client.");
    if (rate === null) return setError("Put in an hourly rate above $0.");
    startTransition(async () => {
      try {
        const result = await createTimesheetInvoice({ clientId, weekStart: data.weekStart, rate });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/app/quotes/preview/${result.quoteId}`);
      } catch {
        setError("Couldn't make the invoice. Check your signal and try again.");
      }
    });
  };

  return (
    <div className="space-y-4" data-testid="timesheet-invoice-form">
      <fieldset>
        <legend className="mb-2 block text-ui-base font-semibold text-ui-text">Client</legend>
        <div role="radiogroup" aria-label="Client" className="space-y-2">
          {choices.map((c) => {
            const on = c.clientId === clientId;
            return (
              <button
                key={c.clientId}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setClientId(c.clientId)}
                className={cx(
                  "ui-focus-ring flex min-h-14 w-full items-center justify-between gap-3 rounded-ui-md px-4 text-left text-ui-base",
                  TAP,
                  on ? "border-2 border-ui-brand bg-ui-brand-soft text-ui-text" : "border border-ui-line bg-ui-surface text-ui-text",
                )}
              >
                <span className="font-semibold">{c.name}</span>
                <span className="text-ui-muted tabular-nums">{formatHours(c.hours)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <NumberField
        label="Hourly rate"
        value={rateText}
        onValueChange={setRateText}
        decimals={2}
        prefix="$"
        suffix="per hour"
        hint={data.labourRate > 0 ? "From your labour rate. Change it for this invoice if you need to." : "Set a labour rate in Rates and quotes to fill this in."}
      />

      {preview && preview.ok ? (
        <Card padding="none" data-testid="timesheet-invoice-preview">
          <ul className="divide-y divide-ui-line">
            {preview.quoteData.line_items.map((line) => (
              <li key={line.description} className="flex items-center justify-between gap-3 px-4 py-3 text-ui-base">
                <span>
                  <span className="block font-semibold">{line.description.replace(/^Labour, /, "")}</span>
                  <span className="block text-ui-sm text-ui-muted">
                    {formatHours(line.quantity)} at <Money amount={line.unit_price} currency={data.currency} />
                  </span>
                </span>
                <Money amount={line.line_total} currency={data.currency} className="font-semibold tabular-nums" />
              </li>
            ))}
            <li className="flex justify-between px-4 py-2 text-ui-sm text-ui-muted">
              <span>{data.taxLabel} {data.taxRate}%</span>
              <Money amount={preview.quoteData.tax_amount} currency={data.currency} />
            </li>
            <li className="flex justify-between px-4 py-3 text-ui-lg font-semibold">
              <span>Total</span>
              <Money amount={preview.quoteData.total} currency={data.currency} className="ui-heading tabular-nums" />
            </li>
          </ul>
        </Card>
      ) : preview && !preview.ok && rate !== null ? (
        <p className="text-ui-sm text-ui-warn">{preview.error}</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-ui-sm font-semibold text-ui-bad">
          {error}
        </p>
      ) : null}

      <Button fullWidth onClick={create} loading={pending} loadingLabel="Making the invoice…" icon={<Receipt weight="bold" />} disabled={!preview?.ok}>
        Create invoice
      </Button>
      <p className="text-center text-ui-sm text-ui-muted">It opens as a finished job, ready to send.</p>
    </div>
  );
}
