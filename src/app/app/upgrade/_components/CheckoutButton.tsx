"use client";

import { PLANS, type PlanId } from "@/lib/plans";
import { useState } from "react";
import { ArrowRight, Lock } from "@phosphor-icons/react/dist/ssr";

/**
 * Client-side trigger for the Stripe Checkout redirect.
 *
 * Posts to /api/stripe/checkout, gets back a Stripe-hosted URL, sets
 * window.location to it. We do the redirect from the client (not a
 * server action) so the user's tab navigates directly to Stripe
 * without an intermediate full-page reload.
 */
export function CheckoutButton({plan = "solo"}: {plan?: PlanId}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function go() {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({plan}) });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        message?: string;
      };
      if (!res.ok || !data.ok || !data.url) {
        setErrorMsg(
          data.message ?? "Could not start checkout. Try again in a moment.",
        );
        setState("error");
        return;
      }
      window.location.href = data.url;
    } catch {
      setErrorMsg("Network error. Try again.");
      setState("error");
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="upgrade-checkout-button"
        onClick={go}
        disabled={state === "loading"}
        className="t2q-btn-primary-pro inline-flex h-12 items-center gap-2 px-6 text-base disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "loading" ? (
          <>
            <Lock size={16} weight="bold" />
            Opening Stripe…
          </>
        ) : (
          <>
            Choose {PLANS[plan].name} — ${PLANS[plan].price}/mo
            <ArrowRight size={16} weight="bold" />
          </>
        )}
      </button>
      {state === "error" && (
        <p
          data-testid="upgrade-checkout-error"
          role="alert"
          className="mt-3 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {errorMsg}
        </p>
      )}
    </>
  );
}
