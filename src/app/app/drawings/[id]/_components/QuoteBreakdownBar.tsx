"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button, ButtonLink } from "@/components/ui/button";
import type { PlanSetView } from "@/lib/planset/api-types";

/** What the bar offers, from the plan set as it stands. Pure: tested in node. */
export function breakdownState(view: Pick<PlanSetView, "quoteId" | "takeoff">): "open" | "questions" | "empty" | "make" {
  if (view.quoteId) return "open";
  if (view.takeoff?.blockers.length) return "questions";
  if (!view.takeoff?.lines.length) return "empty";
  return "make";
}

const HINT = {
  make: "Your materials by trade, each with a subtotal, priced from your price list where it matches.",
  empty: "There's nothing to price from these plans yet.",
} as const;

/**
 * On every tab of a read plan set: "Quote breakdown" makes a quote from the
 * materials — a section per trade (Framing, Linings, Joinery…) with its
 * subtotal — and opens it; once made, it opens that quote. While questions
 * stand in the way, it says how many and takes the tradie to them.
 */
export function QuoteBreakdownBar({
  setId,
  view,
  onShowQuestions,
  showRemake = false,
}: {
  setId: string;
  view: Pick<PlanSetView, "quoteId" | "takeoff">;
  /** Go to where the questions are; omit when they're already on screen. */
  onShowQuestions?: () => void;
  /** Also offer a fresh quote once one is made (after answers changed). */
  showRemake?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = breakdownState(view);
  const questions = view.takeoff?.blockers.length ?? 0;

  async function make() {
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

  const hint =
    error ??
    (state === "questions"
      ? `Answer ${questions === 1 ? "1 question" : `${questions} questions`} first. They're at the top of Materials.`
      : state === "make" || state === "empty"
        ? HINT[state]
        : null);

  return (
    <BottomActionBar hint={hint ?? undefined}>
      {state === "open" ? (
        <>
          <ButtonLink href={`/app/quotes/preview/${view.quoteId}`} fullWidth data-testid="quote-breakdown-open">
            Open the quote breakdown
          </ButtonLink>
          {showRemake ? (
            <Button variant="secondary" fullWidth loading={busy} disabled={busy || !!questions} onClick={() => void make()}>
              Make a new one
            </Button>
          ) : null}
        </>
      ) : state === "questions" ? (
        <Button fullWidth disabled={!onShowQuestions} onClick={onShowQuestions} data-testid="quote-breakdown">
          Quote breakdown
        </Button>
      ) : (
        <Button fullWidth loading={busy} disabled={busy || state === "empty"} onClick={() => void make()} data-testid="quote-breakdown">
          Quote breakdown
        </Button>
      )}
    </BottomActionBar>
  );
}
