"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Money } from "@/components/ui/money";
import { SectionTitle } from "@/components/ui/section-title";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";
import { priceRowSubtitle, priceSummary, searchPriceRows, type PriceRow } from "./prices-model";

/** The saved prices with a search box. Each row opens the existing edit page. */
export function PricesList({ rows, currency }: { rows: PriceRow[]; currency: string }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => searchPriceRows(rows, query), [rows, query]);

  return (
    <section aria-labelledby="prices-list-title" className="space-y-3" data-testid="prices-list">
      <SectionTitle id="prices-list-title" description={priceSummary(rows)}>
        Your list
      </SectionTitle>
      <TextField
        label="Search your prices"
        labelHidden
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Search by name or supplier"
        prefix={<MagnifyingGlass aria-hidden="true" weight="bold" />}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        data-testid="prices-search"
      />
      {shown.length === 0 ? (
        <EmptyState as="h3" icon={<MagnifyingGlass weight="bold" />} title="Nothing matches">
          Try fewer letters, or search for the supplier.
        </EmptyState>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-ui-line" aria-label="Your prices">
            {shown.map((row) => (
              <li key={row.id} data-testid={`price-row-${row.id}`}>
                <ListRow
                  href={row.href}
                  title={row.name}
                  subtitle={priceRowSubtitle(row)}
                  trailing={
                    row.price !== null ? (
                      <Money amount={row.price} currency={currency} />
                    ) : (
                      <StatusPill tone="warn">No price yet</StatusPill>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
