"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { currencySymbol } from "@/components/ui/lib/number-input";
import { NumberField } from "@/components/ui/text-field";
import { STARTER_MATERIALS } from "../_data";
import { saveQuickStartMaterials, type QuickStartResult } from "../actions";

const INITIAL: QuickStartResult = { ok: true, inserted: 0, skipped: 0 };

/** "each", "per sheet", "per bag". */
export function perUnit(unit: string): string {
  return unit === "each" ? "each" : `per ${unit}`;
}

/**
 * The starter list in the new look: one price box per everyday item, the
 * same field names and save action as the old form. Only rows with a price
 * are saved; the action then goes to Home.
 */
export function QuickStartPrices({ currency }: { currency: string }) {
  const [state, formAction] = useActionState(saveQuickStartMaterials, INITIAL);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const symbol = currencySymbol(currency);

  return (
    <form action={formAction} className="space-y-6" data-testid="quick-start-form">
      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-ui-line">
          {STARTER_MATERIALS.map((m) => (
            <li key={m.slug} data-testid={`row-${m.slug}`} className="px-4 py-4">
              <NumberField
                label={m.name}
                hint={`${m.category} · ${m.trade_hint}`}
                name={`price_${m.slug}`}
                aria-label={`Price for ${m.name}`}
                prefix={symbol}
                suffix={perUnit(m.unit)}
                placeholder="0.00"
                value={prices[m.slug] ?? ""}
                onValueChange={(value) => setPrices((current) => ({ ...current, [m.slug]: value }))}
                data-testid={`price-${m.slug}`}
              />
            </li>
          ))}
        </ul>
      </Card>

      {"error" in state && state.error ? (
        <div role="alert" data-testid="quick-start-error">
          <Callout tone="bad" title={state.error} />
        </div>
      ) : null}

      <p className="text-ui-sm text-ui-muted">Only rows with a price are saved. Empty rows are skipped.</p>

      <div className="space-y-2">
        <SubmitButton />
        <ButtonLink href="/app" variant="ghost" fullWidth data-testid="quick-start-skip">
          Skip for now
        </ButtonLink>
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      fullWidth
      loading={pending}
      loadingLabel="Saving…"
      iconEnd={<ArrowRight weight="bold" />}
      data-testid="quick-start-submit"
    >
      Save and continue
    </Button>
  );
}
