import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { StatusPill } from "@/components/ui/status-pill";
import { BillingButton } from "./BillingButton";
import type { PlanSummary } from "./plan";

/**
 * "Your Tradies2Quote plan". Rendered by the Payments page only outside the
 * iOS app: prices and billing links must never reach the App Store build
 * (3.1.3(f)), so the page leaves this out on the server.
 */
export function PlanCard({ summary }: { summary: PlanSummary }) {
  return (
    <Card as="section" padding="lg" className="space-y-4" aria-labelledby="plan-title" data-testid="settings-plan">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle id="plan-title">Your Tradies2Quote plan</SectionTitle>
        <StatusPill tone={summary.pill.tone}>{summary.pill.label}</StatusPill>
      </div>
      <div>
        <p className="font-semibold text-ui-text">{summary.title}</p>
        <p className="mt-1 text-ui-sm text-ui-muted">{summary.detail}</p>
      </div>
      {summary.action === "manage" ? <BillingButton /> : null}
      {summary.action === "choose" ? (
        <ButtonLink
          href="/app/upgrade"
          variant="secondary"
          fullWidth
          iconEnd={<ArrowRight weight="bold" />}
          data-testid="settings-choose-plan"
        >
          Choose a plan
        </ButtonLink>
      ) : null}
      {summary.note ? <p className="text-ui-sm text-ui-muted">{summary.note}</p> : null}
    </Card>
  );
}
