import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Receipt } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceStatus } from "@/lib/types/invoice";
import { AppHeader } from "../_components/AppHeader";
import { InvoiceList } from "./_components/InvoiceList";

export const metadata: Metadata = {
  title: "Invoices",
};

export const dynamic = "force-dynamic";

/**
 * /app/invoices — full list of the tradie's invoices.
 *
 * Server-rendered, no client filtering yet (volume is low at MVP
 * stage). Supports a `?status=` query param so the dashboard's
 * invoice tiles can deep-link straight to "Sent" or "Overdue".
 *
 * Excludes soft-deleted rows. Ordered most-recent-created first so
 * the freshest draft / sent invoice sits at the top.
 */

const VALID_STATUSES: readonly InvoiceStatus[] = [
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
];

function parseStatus(raw: string | undefined): InvoiceStatus | null {
  if (!raw) return null;
  return (VALID_STATUSES as readonly string[]).includes(raw)
    ? (raw as InvoiceStatus)
    : null;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusRaw } = await searchParams;
  const statusFilter = parseStatus(statusRaw);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pull invoices + the linked quote's snapshot (for the client name).
  // The invoices.invoice_data jsonb also has the client name embedded,
  // but a normal lookup keeps the row shape predictable for the table.
  // Wave 46 perf — was selecting the entire `invoice_data` JSONB snapshot
  // for up to 200 rows just to read the client's name; narrowed to that
  // one JSON path (InvoiceList never used the rest of invoice_data).
  let query = supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, total_amount, currency, due_date, created_at, sent_at, paid_at, quote_id, client_name:invoice_data->client->>name",
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: invoices, error } = await query;
  if (error) {
    console.error("InvoicesPage query failed", error);
  }

  const rows = invoices ?? [];

  // KPI buckets — independent of the filter so the strip always shows
  // the full pipeline (clicking a tile narrows the table below).
  const { data: allInvoices } = await supabase
    .from("invoices")
    .select("status")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const counts = (allInvoices ?? []).reduce(
    (acc, r) => {
      acc[r.status as InvoiceStatus] =
        (acc[r.status as InvoiceStatus] ?? 0) + 1;
      return acc;
    },
    {} as Record<InvoiceStatus, number>,
  );

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Invoices" />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="t2q-page-intro mb-8">
          <div className="t2q-section-label-pro mb-3">{"// invoices"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Money in.
          </h1>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            Every invoice you&rsquo;ve ever drafted, sent or marked paid.
            Filter by status with the tiles below.
          </p>
        </div>

        {/* KPI tiles double as filter chips. Clicking re-renders the
            page with ?status=<key>; the Active tile clears the filter. */}
        <nav
          aria-label="Filter invoices by status"
          data-testid="invoice-filter-tiles"
          className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-6"
        >
          <FilterTile
            label="All"
            value={(allInvoices ?? []).length}
            href="/app/invoices"
            active={statusFilter === null}
          />
          <FilterTile
            label="Draft"
            value={counts.draft ?? 0}
            href="/app/invoices?status=draft"
            active={statusFilter === "draft"}
            tone="muted"
          />
          <FilterTile
            label="Sent"
            value={counts.sent ?? 0}
            href="/app/invoices?status=sent"
            active={statusFilter === "sent"}
            tone="info"
          />
          <FilterTile
            label="Paid"
            value={counts.paid ?? 0}
            href="/app/invoices?status=paid"
            active={statusFilter === "paid"}
            tone="paid"
          />
          <FilterTile
            label="Overdue"
            value={counts.overdue ?? 0}
            href="/app/invoices?status=overdue"
            active={statusFilter === "overdue"}
            tone="error"
          />
          <FilterTile
            label="Cancelled"
            value={counts.cancelled ?? 0}
            href="/app/invoices?status=cancelled"
            active={statusFilter === "cancelled"}
            tone="muted"
          />
        </nav>

        <section
          aria-label="Invoice list"
          data-testid="invoices-table"
          className="t2q-card-pro p-5 sm:p-7"
        >
          {rows.length === 0 ? (
            <div className="py-8 text-center">
              <Receipt
                size={28}
                weight="duotone"
                className="mx-auto mb-3 text-ink-500"
              />
              <p className="font-display text-base uppercase tracking-tight text-white">
                {statusFilter ? `No ${statusFilter} invoices.` : "No invoices yet."}
              </p>
              <p className="mt-1 text-sm text-ink-300">
                {statusFilter
                  ? "Switch filter or"
                  : "Complete a job and"}{" "}
                <Link
                  href="/app/quotes"
                  className="text-brand underline-offset-4 hover:underline"
                >
                  open a quote
                </Link>{" "}
                to draft an invoice from it.
              </p>
            </div>
          ) : (
            <InvoiceList
              rows={rows.map((inv) => ({
                id: inv.id,
                invoice_number: inv.invoice_number,
                status: inv.status,
                total_amount: inv.total_amount,
                currency: inv.currency,
                due_date: inv.due_date,
                created_at: inv.created_at,
                sent_at: inv.sent_at,
                paid_at: inv.paid_at,
                quote_id: inv.quote_id,
                clientName: (inv.client_name as string | null)?.trim() || "—",
              }))}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function FilterTile({
  label,
  value,
  href,
  active,
  tone = "neutral",
}: {
  label: string;
  value: number;
  href: string;
  active: boolean;
  tone?: "neutral" | "info" | "paid" | "muted" | "error";
}) {
  const toneCls = {
    neutral: "border-brand/40 bg-brand/10 text-brand",
    info: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    paid: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    muted: "border-ink-600 bg-ink-800 text-ink-300",
    error: "border-red-500/40 bg-red-500/10 text-red-300",
  }[tone];
  const ring = active ? "ring-2 ring-brand ring-offset-2 ring-offset-ink-950" : "";
  return (
    <Link
      href={href}
      data-testid={`invoice-filter-${label.toLowerCase()}`}
      className={`rounded-sm border px-4 py-3 ${toneCls} ${ring} transition-opacity hover:opacity-90`}
    >
      <p className="font-display text-2xl tracking-tight text-white">{value}</p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em]">
        {label}
      </p>
    </Link>
  );
}

