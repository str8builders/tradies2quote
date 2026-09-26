"use client";

import { useRef } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

export interface AiConsentSheetProps {
  /** The consent is being saved: both choices wait. */
  pending: boolean;
  /** Why saving the consent failed, if it did. */
  error: string | null;
  /** "I agree — continue": record consent, then carry on. */
  onAccept: () => void;
  /** "Not now": nothing is recorded, back to Home. */
  onDecline: () => void;
}

/**
 * AI-processing consent (App Store Guideline 5.1.2(i)) in the new look: a
 * bottom sheet drawn with the kit, so it reads right in dark and outdoor
 * mode. <AiConsentModal look="new"> renders it and keeps the consent logic.
 *
 * Wording kept from the current modal word for word: it is the disclosure
 * App Review saw (the providers, what is sent and why, no training, the
 * privacy link, withdrawing in Settings). The same two choices sit at the
 * thumb. The sheet's corner button, Escape and a tap on the dimmed page
 * all mean "Not now" (never while the consent is saving), so nothing can
 * be sent without the explicit "I agree".
 */
export function AiConsentSheet({ pending, error, onAccept, onDecline }: AiConsentSheetProps) {
  // Start on the words, not a button: agreeing is a choice made after reading.
  const disclosureRef = useRef<HTMLDivElement>(null);
  const dismiss = () => {
    if (!pending) onDecline();
  };

  return (
    <BottomSheet
      open
      onClose={dismiss}
      closeLabel="Not now"
      title="Tradies2Quote uses AI"
      description="Before we start"
      initialFocusRef={disclosureRef}
      footer={
        <div className="space-y-3">
          {error ? (
            <div role="alert" data-testid="ai-consent-error">
              <Callout tone="bad" title="Couldn't save your answer">
                {error}
              </Callout>
            </div>
          ) : null}
          <Button
            fullWidth
            loading={pending}
            loadingLabel="Saving…"
            onClick={onAccept}
            data-testid="ai-consent-accept"
          >
            I agree — continue
          </Button>
          <Button
            variant="secondary"
            fullWidth
            disabled={pending}
            onClick={onDecline}
            data-testid="ai-consent-decline"
          >
            Not now
          </Button>
        </div>
      }
    >
      <div
        ref={disclosureRef}
        tabIndex={-1}
        data-testid="ai-consent-modal"
        className="space-y-3 text-ui-base text-ui-text outline-none"
      >
        <p>
          To turn what you say, type or photograph into a quote, this app sends it to two AI providers:
        </p>
        <ul className="space-y-2">
          <li className="rounded-ui-md border border-ui-line bg-ui-surface-2 px-4 py-3">
            <strong className="font-semibold">Anthropic (Claude)</strong> — builds quotes, cleans transcripts,
            reads drawings and supplier quotes, and drafts text replies.
          </li>
          <li className="rounded-ui-md border border-ui-line bg-ui-surface-2 px-4 py-3">
            <strong className="font-semibold">OpenAI</strong> — turns voice notes into text and describes job
            photos.
          </li>
        </ul>
        <p className="text-ui-muted">
          They process it only to return the result and don&apos;t use it to train their models. Full detail is
          in our{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer noopener"
            className="ui-focus-ring rounded-ui-sm font-semibold text-ui-brand-text underline underline-offset-2"
          >
            Privacy Policy
          </a>
          . You can withdraw this consent anytime in Settings.
        </p>
      </div>
    </BottomSheet>
  );
}
