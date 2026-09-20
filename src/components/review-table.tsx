"use client";

import { useMemo, useState } from "react";
import { getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";

export type ReviewEntry<T> = { id: string; value: T; label: string; search: string; amount: number; attention: boolean };
export const reviewColumns: ColumnDef<ReviewEntry<unknown>>[] = [
  { accessorKey: "label" }, { accessorKey: "amount" }, { accessorKey: "search" },
];

/** Sort/filter a view only. Edits always address the original stable ID. */
export function useReviewTable<T>(entries: ReviewEntry<T>[]) {
  const [query, setQuery] = useState("");
  const [attention, setAttention] = useState(false);
  const [sort, setSort] = useState("source");
  const sorting = useMemo(() => sort === "source" ? [] : [{id: sort.startsWith("amount") ? "amount" : "label", desc: sort.endsWith("desc")}], [sort]);
  const data = useMemo(() => attention ? entries.filter(row => row.attention) : entries, [entries, attention]);
  // TanStack's headless table is deliberately not memoized by the React compiler.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    autoResetPageIndex: false, data, columns: reviewColumns as ColumnDef<ReviewEntry<T>>[], getRowId: row => row.id,
    state: { globalFilter: query.trim(), sorting },
    globalFilterFn: (row, _column, value: string) => row.original.search.toLowerCase().includes(value.toLowerCase()),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  return { rows: table.getRowModel().rows.map(row => row.original), query, setQuery, attention, setAttention, sort, setSort, total: entries.length };
}

export function ReviewToolbar({ view, children, label = "Search lines" }: {
  view: { query: string; setQuery: (s: string) => void; attention: boolean; setAttention: (b: boolean) => void; sort: string; setSort: (s: string) => void; total: number; rows: unknown[] };
  children?: React.ReactNode; label?: string;
}) {
  return <section className="my-4 space-y-3 rounded-xl border border-ink-700 p-3" aria-label="Review controls">
    <div className="flex flex-wrap gap-3">
      <label className="min-w-40 flex-1 text-xs">{label}<input type="search" aria-label={label} value={view.query} onChange={e => view.setQuery(e.target.value)} className="mt-1 block min-h-11 w-full rounded border border-ink-600 bg-ink-900 px-3 text-white" /></label>
      <label className="text-xs">View order<select aria-label="View order" value={view.sort} onChange={e => view.setSort(e.target.value)} className="mt-1 block min-h-11 rounded border border-ink-600 bg-ink-900 px-3 text-white"><option value="source">Original order</option><option value="label">Name A–Z</option><option value="amount">Price low–high</option><option value="amount-desc">Price high–low</option></select></label>
      <label className="inline-flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" checked={view.attention} onChange={e => view.setAttention(e.target.checked)} className="h-5 w-5 accent-brand" />Needs checking</label>
    </div>
    <p role="status" className="text-xs text-ink-400">Showing {view.rows.length} of {view.total} lines. Filtering does not change which lines are included.</p>
    {children}
  </section>;
}
