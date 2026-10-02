"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/quote-defaults";

/**
 * Deposit button on the public quote page. Renders below the accepted view
 * once the client has accepted. Tapping it opens a Stripe Checkout session
 * (server creates it as a destination charge into the tradie's account) and
 * redirects the browser there.
 */
export function PayDepositButton({
  token,
  amountCents,
  currency,
  paid,
}: {
  token: string;
  amountCents: number;
  currency: string;
  paid: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same text on the server and in every browser (Intl currency output differs between ICU builds).
  const amountLabel = formatCurrency(amountCents / 100, currency || "NZD");

  if (paid) {
    return (
      <div className="mx-auto mt-6 max-w-md rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
        <p className="font-semibold text-emerald-300">Deposit paid — thank you!</p>
        <p className="mt-1 text-sm text-emerald-200/80">Your spot is locked in.</p>
      </div>
    );
  }

  async function onPay() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(
          data.error === "already_paid"
            ? "This deposit has already been paid."
            : "Couldn't start the payment. Please try again.",
        );
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-md rounded-xl border border-brand/40 bg-brand/10 p-5 text-center">
      <p className="text-sm text-ink-200">Lock in your booking with a deposit</p>
      <p className="my-2 font-display text-3xl text-brand">{amountLabel}</p>
      <button
        type="button"
        onClick={onPay}
        disabled={loading}
        className="t2q-btn-primary inline-flex w-full items-center justify-center disabled:opacity-60"
      >
        {loading ? "Opening secure checkout…" : `Pay ${amountLabel} deposit`}
      </button>
      <p className="mt-2 text-xs text-ink-400">Secure payment by Stripe.</p>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
