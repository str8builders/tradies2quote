import { PLANS } from "@/lib/plans";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  CreditCard,
  Lightning,
} from "@phosphor-icons/react/dist/ssr";
import type { SubscriptionStatus } from "@/lib/subscription";
import { ManageBillingButton } from "./ManageBillingButton";

/**
 * Settings → Billing & subscription panel.
 *
 * Three states:
 *   - paid     : "Pro plan · next charge MMM DD" + Manage billing button
 *   - trialing : "Trial · N days left" + Upgrade link
 *   - expired  : "Trial ended" + Upgrade link
 *
 * Renders nothing if `state` is somehow missing (defensive — should never happen).
 */
export function SubscriptionPanel({
  status,
  stripeConfigured,
}: {
  status: SubscriptionStatus;
  stripeConfigured: boolean;
}) {
  if (status.state === "paid") {
    const renewalLabel = status.currentPeriodEnd
      ? `Current period ends ${formatDate(status.currentPeriodEnd)}`
      : "Active subscription";
    return (
      <section
        data-testid="settings-billing-paid"
        className="t2q-card-pro mt-6 p-5 sm:p-6"
      >
        <div className="flex items-center gap-2">
          <CheckCircle size={18} weight="fill" className="text-brand" />
          <p className="t2q-section-label-pro !text-brand">{status.managedByTeam ? "// team access" : "// subscription"}</p>
        </div>
        <h2 className="mt-2 font-display text-xl uppercase tracking-tight text-white">
          Tradies2Quote {status.plan ? PLANS[status.plan].name : "access"}
        </h2>
        <p className="mt-1 text-sm text-ink-300">
          {status.managedByTeam ? "Your team owner manages billing." : status.plan ? `$${PLANS[status.plan].price} NZD / month · ${renewalLabel}` : "Your account has complimentary access."}
        </p>
        <div className="mt-4">
          {status.stripeCustomerId && !status.managedByTeam ? <ManageBillingButton /> : null}
        </div>
      </section>
    );
  }

  const isExpired = status.state === "expired";
  return (
    <section
      data-testid={`settings-billing-${status.state}`}
      className={`t2q-card-pro mt-6 p-5 sm:p-6 ${isExpired ? "border-red-500/40" : ""}`}
    >
      <div className="flex items-center gap-2">
        <Lightning
          size={18}
          weight="fill"
          className={isExpired ? "text-red-300" : "text-hivis"}
        />
        <p
          className={`t2q-section-label-pro ${isExpired ? "!text-red-300" : "!text-hivis"}`}
        >
          {isExpired ? "// trial ended" : "// trial"}
        </p>
      </div>
      <h2 className="mt-2 font-display text-xl uppercase tracking-tight text-white">
        {isExpired
          ? "Your trial ended."
          : status.trialDaysLeft === 1
            ? "Last day of your trial."
            : `${status.trialDaysLeft} days left in your trial.`}
      </h2>
      <p className="mt-1 text-sm text-ink-300">
        {isExpired
          ? "You can still view and send existing quotes. Subscribe to keep creating new ones."
          : `Trial ends ${formatDate(status.trialEndsAt)}. Subscribe to keep the lights on past that date.`}
      </p>
      <div className="mt-4">
        {stripeConfigured ? (
          <Link
            href="/app/upgrade"
            data-testid="settings-billing-upgrade-link"
            className="t2q-btn-primary-pro inline-flex h-11 items-center gap-2 px-5"
          >
            <CreditCard size={16} weight="bold" />
            Choose a plan
            <ArrowRight size={14} weight="bold" />
          </Link>
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
            Checkout isn&rsquo;t configured yet.
          </p>
        )}
      </div>
    </section>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
