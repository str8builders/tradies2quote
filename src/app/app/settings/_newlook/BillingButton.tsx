"use client";

import { useState } from "react";
import { CreditCard } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

/**
 * "Manage billing": the same /api/stripe/portal round trip as the old
 * ManageBillingButton, then off to Stripe's own billing page.
 */
export function BillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; message?: string };
      if (!res.ok || !data.ok || !data.url) {
        setError(data.message ?? "Couldn't open your billing page. Try again.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("No signal. Try again in a minute.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        fullWidth
        icon={<CreditCard weight="bold" />}
        loading={loading}
        loadingLabel="Opening Stripe…"
        onClick={open}
        data-testid="settings-manage-billing"
      >
        Manage billing
      </Button>
      {error ? (
        <p role="alert" className="text-ui-sm font-semibold text-ui-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
