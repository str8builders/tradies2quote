"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { STARTER_TRADES, type StarterTrade } from "../_data";
import {
  saveQuickStartMaterials,
  type QuickStartResult,
} from "../actions";

const INITIAL: QuickStartResult = { ok: true, inserted: 0, skipped: 0 };

/** Every trade's rows stay in the form; only the chosen trade's are shown. */
export function QuickStartForm({ currency, trade: initialTrade = "builder" }: { currency: string; trade?: StarterTrade }) {
  const [state, formAction] = useActionState(
    saveQuickStartMaterials,
    INITIAL,
  );
  const [trade, setTrade] = useState<StarterTrade>(initialTrade);
  return (
    <form action={formAction} className="space-y-6">
      <div role="group" aria-label="Your trade" className="flex flex-wrap gap-2">
        {STARTER_TRADES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={t.id === trade}
            onClick={() => setTrade(t.id)}
            className={
              t.id === trade
                ? "min-h-[44px] rounded-sm border border-brand bg-brand/15 px-4 font-mono text-[11px] uppercase tracking-[0.2em] text-brand"
                : "min-h-[44px] rounded-sm border border-ink-700 bg-ink-900 px-4 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-300 hover:border-ink-500 hover:text-white"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {STARTER_TRADES.map((t) => (
        <ul key={t.id} className="space-y-3" hidden={t.id !== trade}>
          {t.items.map((m) => (
            <li
              key={m.slug}
              data-testid={`row-${m.slug}`}
              className="rounded-sm border border-ink-700 bg-ink-900 p-3 sm:p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{m.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
                    {m.category} · {m.unit} · {m.trade_hint}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2">
                  <span className="text-sm text-ink-300">{currency}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    name={`price_${m.slug}`}
                    data-testid={`price-${m.slug}`}
                    placeholder="0.00"
                    className="w-28 rounded-sm border border-ink-700 bg-ink-800 px-3 py-2 text-right text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand"
                    aria-label={`Price for ${m.name}`}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
                    /{m.unit}
                  </span>
                </label>
              </div>
            </li>
          ))}
        </ul>
      ))}

      {"error" in state && state.error ? (
        <p
          data-testid="quick-start-error"
          className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/app"
          data-testid="quick-start-skip"
          className="inline-flex min-h-[44px] items-center justify-center text-sm font-mono uppercase tracking-[0.2em] text-ink-300 hover:text-white"
        >
          Skip for now
        </Link>
        <SubmitButton />
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
        {"// only rows with a price get saved · zero-priced rows are skipped"}
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="quick-start-submit"
      className="t2q-btn-primary-pro inline-flex min-h-[44px] items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save & continue"}
      {!pending && <ArrowRight size={16} weight="bold" />}
    </button>
  );
}
