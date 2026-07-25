"use client";

import { useState } from "react";
import { CheckCircle, EnvelopeSimple } from "@phosphor-icons/react";

/**
 * Takes an email for T2QCAL, which isn't on the App Store yet.
 *
 * There is no download to offer, so the honest thing is to say so and take an
 * address. One field, no account, no password — and a hidden `company` input
 * that only a form-filling bot will touch.
 */
export function WaitlistForm({ source = "calculator" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setProblem(null);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, company }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setProblem(body.message ?? "Couldn't save that just now. Try again in a minute.");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setProblem("Couldn't reach the server. Check your connection and try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div
        data-testid="waitlist-done"
        className="flex items-start gap-3 rounded-sm border border-brand/40 bg-brand/10 p-4"
      >
        <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-brand" />
        <p className="text-sm leading-relaxed text-ink-100">
          <span className="font-semibold text-white">You&apos;re on the list.</span> We&apos;ll
          email you once when it&apos;s downloadable — nothing else.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} data-testid="waitlist-form" className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="waitlist-email" className="sr-only">
          Email address
        </label>
        <div className="relative flex-1">
          <EnvelopeSimple
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <input
            id="waitlist-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@yourbusiness.co.nz"
            data-testid="waitlist-email"
            className="h-14 w-full rounded-sm border border-ink-600 bg-ink-900 pl-10 pr-3 text-base text-white placeholder:text-ink-500 focus:border-brand focus:outline-none"
          />
        </div>

        {/* Not for people. Off-screen rather than display:none so the bots
            that skip hidden inputs still find it. */}
        <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="waitlist-company">Company</label>
          <input
            id="waitlist-company"
            name="company"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={state === "sending"}
          data-testid="waitlist-submit"
          className="t2q-btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "sending" ? "Adding…" : "Tell me when it lands"}
        </button>
      </div>

      {problem ? (
        <p role="alert" data-testid="waitlist-error" className="mt-3 text-sm text-brand-300">
          {problem}
        </p>
      ) : (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
          One email, when it ships. No newsletter.
        </p>
      )}
    </form>
  );
}
