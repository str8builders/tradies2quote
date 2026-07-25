import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  CheckCircle,
  ClipboardText,
  Files,
  GearSix,
  Lifebuoy,
  Microphone,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { isOwnerEmail } from "@/lib/owner";
import { AppHeader } from "../_components/AppHeader";
import { AgentCard } from "./_components/AgentCard";
import { QuoteReviewAgent } from "../_components/agents/QuoteReviewAgent";
import { QuoteGenerationAgent } from "../_components/agents/QuoteGenerationAgent";
import { CustomerReplyAgent } from "../_components/agents/CustomerReplyAgent";
import { MaterialsTakeoffAgent } from "../_components/agents/MaterialsTakeoffAgent";
import { PhotoPlanAgent } from "../_components/agents/PhotoPlanAgent";
import { VariationAgent } from "../_components/agents/VariationAgent";

export const metadata: Metadata = {
  title: "Agents",
};

export const dynamic = "force-dynamic";

/**
 * `/app/agents` — AI Agents control-centre.
 *
 * Wave 19 — every agent the page lists is now either:
 *   • RUNNABLE INLINE on this page (Quote Review, Customer Reply,
 *     Materials & Takeoff, Photo/Plan, Variation), or
 *   • LINKED TO ITS HOME PAGE for quote-bound agents (Compliance,
 *     Voice Cleanup, Follow-up, Invoice — they need a specific
 *     quote so they render on the quote preview), or
 *   • LINKED TO SETTINGS for the Admin Agent.
 *
 * No "Coming soon" buttons remain. No placeholder agent cards. The
 * "Status board" lists only what is actually live.
 *
 * Auth: standard `getCachedAuthUser()` + redirect, owner-only gate
 * via `isOwnerEmail()` so the route stays under owner control.
 */
export default async function AgentsPage() {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  if (!isOwnerEmail(user.email)) notFound();

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Agents" />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Hero */}
        <section className="mb-10">
          <div className="t2q-section-label-pro mb-3">{"// agents · run inline"}</div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
              T2Q <span className="text-brand">Agents.</span>
            </h1>
            <span
              data-testid="agents-preview-pill"
              className="inline-flex items-center rounded-sm border border-hivis/40 bg-hivis/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-hivis"
            >
              Owner-only
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-ink-300 sm:text-base">
            Every action is owner-driven — nothing runs in the background,
            nothing sends without you tapping the button. The Quote Review
            and the four standalone tools run right here. The quote-bound
            agents (Compliance, Voice Cleanup, Follow-up, Invoice draft)
            live on the quote preview page where the data is.
          </p>
        </section>

        {/* Quote Review — server component, suspended */}
        <Suspense
          fallback={
            <section className="t2q-card-pro mb-6 p-5 sm:p-6">
              <div className="h-4 w-1/3 animate-pulse rounded-sm bg-ink-700" />
              <div className="mt-4 h-20 animate-pulse rounded-sm bg-ink-700/60" />
            </section>
          }
        >
          <QuoteReviewAgent />
        </Suspense>

        {/* Runnable standalone agents */}
        <section className="mt-6 space-y-6" data-testid="runnable-agents">
          <QuoteGenerationAgent />
          <CustomerReplyAgent />
          <MaterialsTakeoffAgent />
          <PhotoPlanAgent />
          <VariationAgent />
        </section>

        {/* Quote-bound agents (open in a quote) */}
        <section
          aria-labelledby="quote-bound-heading"
          data-testid="quote-bound-agents"
          className="mt-12"
        >
          <h2
            id="quote-bound-heading"
            className="font-display text-xl uppercase tracking-tight text-white"
          >
            Open in a <span className="text-brand">quote.</span>
          </h2>
          <p className="mt-2 text-sm text-ink-300">
            These agents read the quote they&apos;re mounted on. Open any
            quote from the list to use them.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <AgentCard
              icon={ShieldCheck}
              title="Compliance Agent"
              description="Flags risky wording (guarantee, certified). Suggests exclusions, assumptions, site-access notes, weather delays, variation terms, payment terms. NZ-builder focused — not legal advice."
              status="Live"
              statusTone="ready"
              cta={{ label: "Open in a quote", href: "/app/quotes" }}
            />
            <AgentCard
              icon={Microphone}
              title="Voice Cleanup Agent"
              description="Takes a voice transcript. Produces a clean trade scope. The original transcript stays. You click Apply before anything gets used."
              status="Live"
              statusTone="ready"
              cta={{ label: "Open in a quote", href: "/app/quotes" }}
            />
            <AgentCard
              icon={Lifebuoy}
              title="Follow-up Agent"
              description="Generates follow-up messages for draft/sent quotes — friendly reminder, price clarification, acceptance nudge, missing-info request. Copy to clipboard only; never sends."
              status="Live"
              statusTone="ready"
              cta={{
                label: "Open in a quote",
                href: "/app/quotes?status=sent",
              }}
            />
            <AgentCard
              icon={Files}
              title="Invoice Agent"
              description="Creates a draft invoice from a completed quote. Owner-clicks; nothing sends. Draft-only — no email, no PDF, no payment tracking."
              status="Draft only"
              statusTone="preview"
              cta={{
                label: "Open in a completed quote",
                href: "/app/quotes?stage=completed",
              }}
            />
            <AgentCard
              icon={GearSix}
              title="Admin Agent"
              description="Checks your profile and client details. Flags missing business name, phone, GST number, default rates. Links you to the right setting — never edits anything itself."
              status="Live"
              statusTone="ready"
              cta={{ label: "Open Settings", href: "/app/settings" }}
            />
          </div>
        </section>

        {/* Safety panel */}
        <section
          aria-labelledby="agents-safety-heading"
          data-testid="agents-safety"
          className="t2q-card-pro mt-10 p-5 sm:p-7"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand"
            >
              <ShieldCheck size={20} weight="bold" />
            </span>
            <h2
              id="agents-safety-heading"
              className="font-display text-lg uppercase tracking-tight text-white sm:text-xl"
            >
              You stay in control.
            </h2>
          </div>
          <ul className="mt-5 space-y-2.5">
            {[
              "Agents draft; they don't send.",
              "No quote gets emailed without approval.",
              "No invoice gets created without approval.",
              "No supplier item gets saved without approval.",
              "No client data gets changed without approval.",
              "Photo / plan agent never claims measurements without a visible scale.",
              "Materials agent never invents supplier prices — pull those from your library.",
            ].map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-sm text-ink-200"
              >
                <CheckCircle
                  size={16}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-brand"
                  aria-hidden="true"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Status board — Live-only column. The "Coming later" column
            has been removed entirely (Wave 19) since every agent on
            the brief is now Live or honestly Draft-only. */}
        <section
          aria-labelledby="agents-status-heading"
          data-testid="agents-status-board"
          className="t2q-card-pro mt-6 p-5 sm:p-7"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-ink-700 bg-ink-900 text-brand"
            >
              <ClipboardText size={20} weight="bold" />
            </span>
            <h2
              id="agents-status-heading"
              className="font-display text-lg uppercase tracking-tight text-white sm:text-xl"
            >
              What works <span className="text-brand">today.</span>
            </h2>
          </div>

          <div className="mt-6 rounded-sm border border-brand/40 bg-brand/5 p-4">
            <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
              <CheckCircle size={14} weight="fill" />
              Live
            </p>
            <ul className="mt-3 space-y-1.5">
              {[
                "Quote Builder (voice → quote T2Q pipeline, on /app/quotes/new)",
                "Quote Generation Agent (stand-alone, mounted above)",
                "Quote Review Agent (mounted above)",
                "Compliance Agent (on quote preview)",
                "Voice Cleanup Agent (on quote preview)",
                "Follow-up Agent (on quote preview)",
                "Admin Agent (on /app/settings)",
                "Customer Reply Agent (mounted above)",
                "Materials & Takeoff Agent (mounted above)",
                "Photo / Plan Reading Agent (mounted above)",
                "Variation Agent (mounted above)",
                "Invoice Agent — draft-only (on completed quotes)",
              ].map((item) => (
                <li
                  key={item}
                  className="text-sm leading-snug text-ink-100"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Tail nav */}
        <nav
          data-testid="agents-tail-links"
          aria-label="Secondary"
          className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-ink-700/60 pt-6"
        >
          <a
            href="/app/clients"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300 hover:text-brand"
          >
            <UsersThree size={14} weight="bold" />
            Clients
          </a>
          <a
            href="/app/settings"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300 hover:text-brand"
          >
            <GearSix size={14} weight="bold" />
            Settings
          </a>
        </nav>
      </main>
    </div>
  );
}
