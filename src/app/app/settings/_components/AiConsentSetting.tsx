"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Robot } from "@phosphor-icons/react";
import { withdrawAiConsentAction } from "@/app/app/quotes/new/ai-consent-actions";

/**
 * AI-processing consent status + withdrawal (Guideline 5.1.2(i) — "provide a
 * way to withdraw"). Rendered in Settings only inside the iOS shell, where the
 * consent gate is enforced. Withdrawing re-prompts on the next AI action.
 */
export function AiConsentSetting({
  consentedAt,
}: {
  consentedAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function withdraw() {
    setError(null);
    startTransition(async () => {
      const res = await withdrawAiConsentAction();
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <section
      data-testid="settings-ai-consent"
      className="t2q-card-pro mt-8 p-5 sm:p-7"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand"
        >
          <Robot size={20} weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg uppercase tracking-tight text-white sm:text-xl">
            AI features
          </h2>
          <p className="mt-2 text-sm text-ink-300">
            {consentedAt
              ? "AI features are on: Anthropic (Claude) drafts quotes and reads drawings, OpenAI transcribes voice notes and describes photos. Withdraw and you'll be asked again before the next AI action."
              : "AI is off. You'll be asked to turn it on before your next voice, scan or quote-generation action."}
          </p>
          {consentedAt ? (
            <button
              type="button"
              onClick={withdraw}
              disabled={pending}
              data-testid="settings-ai-consent-withdraw"
              className="mt-4 inline-flex items-center gap-2 rounded-sm border border-ink-600 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:border-red-500/60 hover:text-red-200 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Withdraw AI consent"}
            </button>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-red-300"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
