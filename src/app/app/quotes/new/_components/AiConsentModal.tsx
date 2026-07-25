"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "@phosphor-icons/react";
import { recordAiConsentAction } from "../ai-consent-actions";

/**
 * AI-processing consent (App Store Guideline 5.1.2(i)).
 *
 * Shown before the first AI action in the iOS shell (the New-quote page passes
 * `open` = native-shell AND not-yet-consented). Names the third-party AI
 * providers, the data sent, and the purpose, links the privacy policy, and
 * requires an affirmative tap before any audio/photo/text can leave the device.
 * On accept, consent is recorded on the profile and the flow proceeds. On
 * decline, the tradie returns to the dashboard (the product is AI-first, so
 * there is no non-AI quoting path — declining simply doesn't proceed).
 *
 * Robustness: this is an overlay, not a page replacement, and the server AI
 * routes independently enforce consent — so a client bug here can never send
 * data without consent, nor permanently lock the tradie out of the page.
 */
export function AiConsentModal({
  open,
  onGranted,
}: {
  open: boolean;
  onGranted: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function accept() {
    setError(null);
    startTransition(async () => {
      const res = await recordAiConsentAction();
      if (res.ok) {
        onGranted();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
      data-testid="ai-consent-modal"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-ink-700 bg-ink-950 p-6 pb-[calc(env(safe-area-inset-bottom,0)+1.5rem)] shadow-2xl sm:rounded-2xl sm:pb-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-brand/40 bg-brand/10 text-brand"
          >
            <ShieldCheck size={22} weight="bold" />
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-brand">
              {"// before we start"}
            </p>
            <h2
              id="ai-consent-title"
              className="font-display text-lg uppercase tracking-tight text-white"
            >
              Tradies2Quote uses AI
            </h2>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink-200">
          <p>
            To turn what you say, type or scan into a quote, this app sends that
            content to two AI providers:
          </p>
          <ul className="space-y-2">
            <li className="rounded-sm border border-ink-700 bg-ink-900/50 px-3 py-2">
              <strong className="text-white">OpenAI</strong> — transcribes your
              voice recordings.
            </li>
            <li className="rounded-sm border border-ink-700 bg-ink-900/50 px-3 py-2">
              <strong className="text-white">Anthropic</strong> — reads your plan
              or site photos and builds the quote from your description.
            </li>
          </ul>
          <p className="text-ink-300">
            They process your content only to return the result and don&apos;t
            use it to train their models. Full detail is in our{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer noopener"
              className="text-brand underline underline-offset-2"
            >
              Privacy Policy
            </a>
            . You can withdraw this consent anytime in Settings.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            data-testid="ai-consent-error"
            className="mt-4 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-red-300"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={accept}
            disabled={pending}
            data-testid="ai-consent-accept"
            className="t2q-btn-primary-pro w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "I agree — continue"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/app")}
            disabled={pending}
            data-testid="ai-consent-decline"
            className="w-full rounded-sm border border-ink-700 px-4 py-3 text-center font-display text-sm uppercase tracking-tight text-ink-300 hover:border-ink-500 hover:text-white disabled:opacity-60"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
