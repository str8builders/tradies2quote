"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { useToast } from "@/components/ui/toast";
import { withdrawAiConsentAction } from "@/app/app/quotes/new/ai-consent-actions";

/**
 * AI consent and how to withdraw it (App Store 5.1.2(i)). The page renders
 * this only inside the iOS app, where the consent step is enforced, as the
 * old page does. Wording kept from the old card: it is the disclosure.
 */
export function AiConsentCard({ consentedAt }: { consentedAt: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const withdraw = () => {
    startTransition(async () => {
      const result = await withdrawAiConsentAction();
      if (!result.ok) {
        toast.show(result.error, { tone: "bad" });
        return;
      }
      toast.show("AI features are off");
      router.refresh();
    });
  };

  return (
    <Card as="section" padding="lg" className="space-y-4" aria-labelledby="ai-title" data-testid="settings-ai-consent">
      <SectionTitle id="ai-title">AI features</SectionTitle>
      <p className="text-ui-sm text-ui-muted">
        {consentedAt
          ? "AI features are on: Anthropic (Claude) drafts quotes and reads drawings, OpenAI transcribes voice notes and describes photos. Withdraw and you'll be asked again before the next AI action."
          : "AI is off. You'll be asked to turn it on before your next voice, scan or quote-generation action."}
      </p>
      {consentedAt ? (
        <Button
          variant="secondary"
          fullWidth
          loading={pending}
          loadingLabel="Saving…"
          onClick={withdraw}
          data-testid="settings-ai-consent-withdraw"
        >
          Withdraw AI consent
        </Button>
      ) : null}
    </Card>
  );
}
