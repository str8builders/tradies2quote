"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { PlanSetView } from "@/lib/planset/api-types";
import type { TakeoffGroup } from "@/lib/planset/takeoff/fromModel";
import { QuestionInput, saveAnswers } from "./parts";

const ORDER: TakeoffGroup[] = ["Slab", "Framing", "Lintels", "Roofing", "Cladding", "Joinery", "Insulation", "Linings", "Finishing"];
const STATUS = { ok: { tone: "ok", label: "From the plans" }, assumed: { tone: "info", label: "Assumed" }, needs_review: { tone: "warn", label: "Check" } } as const;

/** The materials worked out from the checked building, by stage, each with its working. */
export function MaterialsTab({ setId, view, onSaved }: { setId: string; view: PlanSetView; onSaved: () => void }) {
  const router = useRouter();
  const t = view.takeoff!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function makeQuote() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/plansets/${setId}/quote`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { quoteId?: string; error?: string };
    if (res.ok && body.quoteId) router.push(`/app/quotes/preview/${body.quoteId}`);
    else {
      setError(body.error ?? "Couldn't make the quote. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5" data-testid="planset-materials">
      {t.blockers.length ? (
        <Card padding="md" className="space-y-4">
          <Callout tone="warn" title="Answer these first">
            The materials are worked out from a checked building, so these need an answer.
          </Callout>
          {t.blockers.map((b) => (
            <div key={b.id} className="space-y-2">
              <p className="text-ui-base text-ui-text">{b.message}</p>
              {b.question ? (
                <QuestionInput
                  question={b.question}
                  onAnswer={async (v) => {
                    const key = b.answerKey ?? `flag:${b.id}`;
                    const problem = await saveAnswers(setId, { [key]: v });
                    if (!problem) onSaved();
                    return problem;
                  }}
                />
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}

      {ORDER.map((g) => {
        const lines = t.lines.filter((l) => l.group === g);
        if (!lines.length) return null;
        return (
          <section key={g} className="space-y-2" aria-label={g}>
            <h2 className="text-ui-sm font-semibold text-ui-muted">{g}</h2>
            <Card padding="none">
              <ul className="divide-y divide-ui-line">
                {lines.map((l) => (
                  <li key={l.id} className="px-4 py-3" data-testid={`line-${l.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-ui-base text-ui-text">{l.name}</p>
                      <p className="shrink-0 text-ui-base font-semibold text-ui-text">
                        {l.quantity.toLocaleString("en-NZ")} {l.unit}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusPill tone={STATUS[l.status].tone}>{STATUS[l.status].label}</StatusPill>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-ui-sm font-semibold text-ui-brand-text">How it’s worked out</summary>
                      <p className="mt-1 text-ui-sm text-ui-muted">{l.formula}</p>
                      {l.notes ? <p className="mt-1 text-ui-sm text-ui-muted">{l.notes}</p> : null}
                    </details>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        );
      })}

      {t.assumptions.length ? (
        <Card padding="md" className="space-y-2">
          <h2 className="text-ui-sm font-semibold text-ui-muted">Assumed (not on the plans)</h2>
          <ul className="list-disc space-y-1 pl-5 text-ui-sm text-ui-text">
            {t.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {t.byOthers.length ? (
        <Card padding="md" className="space-y-2">
          <h2 className="text-ui-sm font-semibold text-ui-muted">By others — not in your price</h2>
          <ul className="list-disc space-y-1 pl-5 text-ui-sm text-ui-text">
            {t.byOthers.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {error ? <Callout tone="bad">{error}</Callout> : null}

      <BottomActionBar hint={t.lines.length ? "Prices come from your price list where it matches exactly; the rest wait for your price." : undefined}>
        {view.quoteId ? (
          <ButtonLink href={`/app/quotes/preview/${view.quoteId}`} variant="secondary" fullWidth>
            Open the quote
          </ButtonLink>
        ) : null}
        <Button fullWidth loading={busy} disabled={busy || !!t.blockers.length || !t.lines.length} onClick={() => void makeQuote()}>
          {view.quoteId ? "Make another quote" : "Make a quote from these"}
        </Button>
      </BottomActionBar>
    </div>
  );
}
