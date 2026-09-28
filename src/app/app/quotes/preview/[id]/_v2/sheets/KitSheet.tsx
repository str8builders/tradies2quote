"use client";

import { useState } from "react";
import { Package, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Money } from "@/components/ui/money";
import { KITS_PAGE, kitLineCount, kitLines, type JobKit } from "../kits";

export interface KitSheetViewProps {
  kits: JobKit[];
  currency: string;
  /** The kit being added, while it saves. */
  adding: string | null;
  error: string | null;
  onPick: (kit: JobKit) => void;
  onClose: () => void;
}

/**
 * The tradie's kits, one row each (name, how many lines, what they add up
 * to): a tap puts every line on the quote. With no kits yet, the way to the
 * Kits page to make one.
 */
export function KitSheetView({ kits, currency, adding, error, onPick, onClose }: KitSheetViewProps) {
  const empty = kits.length === 0;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Add a kit"
      description={empty ? undefined : "Tap a kit to add all its lines to this quote."}
      footer={
        empty ? undefined : (
          <ButtonLink href={KITS_PAGE} variant="ghost" fullWidth icon={<PencilSimple weight="bold" />}>
            Change your kits
          </ButtonLink>
        )
      }
    >
      <div className="space-y-4" data-testid="job-kits">
        {empty ? (
          <EmptyState
            as="h3"
            icon={<Package weight="duotone" />}
            title="No kits yet"
            action={
              <ButtonLink href={KITS_PAGE} variant="secondary" fullWidth data-testid="job-kits-make">
                Make a kit
              </ButtonLink>
            }
          >
            Save the lines you use on most jobs as a kit, then add them to a quote in one tap.
          </EmptyState>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-ui-line">
              {kits.map((kit) => {
                const usable = kitLines(kit).length > 0;
                const busy = adding === kit.id;
                return (
                  <li key={kit.id} data-kit={kit.id} aria-busy={busy || undefined}>
                    <ListRow
                      title={kit.name.trim() || "Untitled kit"}
                      subtitle={busy ? "Adding…" : kitLineCount(kit)}
                      trailing={usable ? <Money amount={kit.total} currency={currency} /> : undefined}
                      onClick={usable && adding === null ? () => onPick(kit) : undefined}
                    />
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

export interface KitSheetProps {
  kits: JobKit[];
  currency: string;
  /** Put the kit's lines on the quote (the page's usual save). */
  onAdd: (kit: JobKit) => Promise<{ ok: true } | { error: string }>;
  onClose: () => void;
}

/** "Add a kit": the tradie's saved kits, added to the quote in one tap. */
export function KitSheet({ kits, currency, onAdd, onClose }: KitSheetProps) {
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(kit: JobKit) {
    if (adding) return;
    setAdding(kit.id);
    setError(null);
    const result = await onAdd(kit);
    setAdding(null);
    if ("error" in result) setError(result.error);
  }

  return (
    <KitSheetView kits={kits} currency={currency} adding={adding} error={error} onPick={pick} onClose={onClose} />
  );
}
