"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowSquareOut,
  MagnifyingGlass,
  Sparkle,
} from "@phosphor-icons/react/dist/ssr";
import { formatCurrency } from "@/lib/quote-defaults";
import type { LibraryMaterial } from "@/lib/quote-types";

type Props = {
  materials: LibraryMaterial[];
  currency: string;
};

export function MaterialsList({ materials, currency }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => {
      const name = m.name.toLowerCase();
      const supplier = (m.supplier ?? "").toLowerCase();
      return name.includes(q) || supplier.includes(q);
    });
  }, [materials, query]);

  return (
    <div className="mt-6">
      <div className="relative">
        <MagnifyingGlass
          size={16}
          weight="bold"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          aria-hidden="true"
        />
        <input
          type="search"
          data-testid="materials-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or supplier"
          className="block w-full rounded-sm border border-ink-700 bg-ink-800 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand"
        />
      </div>

      {filtered.length === 0 ? (
        <p
          data-testid="materials-empty"
          className="t2q-card-pro mt-8 border-dashed p-8 text-center font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
        >
          {materials.length === 0
            ? "// no materials yet — add one or import a csv"
            : "// no matches"}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {filtered.map((m) => (
            <li
              key={m.id}
              data-testid={`material-${m.id}`}
              className="t2q-card-pro t2q-card-pro-hover p-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/app/materials/${m.id}/edit`}
                      className="truncate font-display text-sm uppercase tracking-tight text-white hover:text-brand"
                    >
                      {m.name}
                    </Link>
                    {m.is_ai_estimated && (
                      <span
                        className="inline-flex items-center gap-1 rounded-sm bg-hivis/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-hivis"
                        title="Price came from a T2Q estimate — confirm before relying on it"
                      >
                        <Sparkle size={10} weight="bold" />
                        T2Q
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-ink-300">
                    {(m.unit ?? "each")} ·{" "}
                    <span className="tabular-nums text-white">
                      {m.default_unit_price !== null
                        ? formatCurrency(m.default_unit_price, currency)
                        : "—"}
                    </span>
                    {m.supplier && (
                      <>
                        <span className="text-ink-500"> · </span>
                        <span className="text-ink-300">{m.supplier}</span>
                      </>
                    )}
                    {m.usage_count > 0 && (
                      <>
                        <span className="text-ink-500"> · </span>
                        <span className="text-ink-400">
                          used {m.usage_count}×
                        </span>
                      </>
                    )}
                  </p>
                </div>
                {m.supplier_url && (
                  <a
                    href={m.supplier_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${m.name} on supplier site`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-ink-700 text-ink-400 hover:border-brand hover:text-brand"
                  >
                    <ArrowSquareOut size={14} weight="bold" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
