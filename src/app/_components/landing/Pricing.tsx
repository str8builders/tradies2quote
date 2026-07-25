"use client";

import Link from "next/link";
import { Check, Lightning } from "@phosphor-icons/react";
import { TiltCard } from "./TiltCard";
import { Magnetic } from "./Magnetic";

/**
 * Pricing tiers — three TiltCards. The middle "Most popular" tier gets a
 * brand border + brutal shadow + a hi-vis ribbon tab anchored to the top.
 *
 * Ported from the Emergent landing-export bundle. Wrapping each CTA in
 * Magnetic gives the card a satisfying pull-to-cursor moment when the
 * tradie is reaching for the button. TiltCards (with extra depth on this
 * section, liftZ 40) make the whole tier feel like it's lifting off the
 * page on hover.
 */

const TIERS = [
  {
    name: "Solo",
    slug: "solo",
    tag: "Solo operators",
    price: 49,
    highlight: false,
    comingSoon: false,
    features: [
      "Unlimited quotes & invoices",
      "1 user account",
      "Branded PDF + email",
      "Client list",
      "Email support",
    ],
  },
  {
    name: "Crew",
    slug: "crew",
    tag: "Most tradies pick this",
    price: 79,
    highlight: true,
    // Multi-user features (shared client list, 5-user accounts) aren't
    // built yet — selling Crew today would mean refunds. Stamp the card
    // as Coming Soon so the offer stays visible but the CTA shifts to
    // a soft "notify me" instead of a hard checkout.
    comingSoon: true,
    features: [
      "Everything in Solo",
      "Up to 5 users",
      "Shared client list",
      "Photo attachments",
      "Priority support",
    ],
  },
  {
    name: "Builder",
    slug: "builder",
    tag: "Growing crews",
    price: 199,
    highlight: false,
    comingSoon: true,
    features: [
      "Everything in Crew",
      "Up to 20 users",
      "Custom terms templates",
      "Dedicated success support",
    ],
  },
];

export function Pricing() {
  return (
    <section
      id="pricing"
      data-testid="section-pricing"
      className="relative border-b border-ink-600 bg-ink-900 py-24 md:py-32 overflow-hidden"
    >
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-brand/10 blur-3xl pointer-events-none animate-blob-slow" />
      <div className="absolute bottom-0 right-1/4 w-[420px] h-[420px] rounded-full bg-hivis/8 blur-3xl pointer-events-none animate-blob" />

      <div className="relative max-w-7xl mx-auto px-6 md:px-12">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="t2q-section-label mb-4 mx-auto inline-block">{"// pricing"}</div>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tighter uppercase leading-[0.95]">
            Less than a box of screws. <br />
            <span className="text-brand">Saves your Sundays.</span>
          </h2>
          <p className="mt-5 text-lg text-ink-200">
            7-day free trial. No credit card up front. Cancel any time.
          </p>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-hivis">
            {"// gst inclusive · nz tradies · built by a tradie"}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {TIERS.map((t) => (
            <TiltCard
              key={t.slug}
              className={`border-2 ${
                t.highlight
                  ? "border-brand bg-ink-800 t2q-shadow-brutal"
                  : "border-white/10 bg-ink-800/85 shadow-[0_18px_48px_-34px_rgba(0,0,0,0.9)]"
              } rounded-lg`}
              innerClassName="p-8 md:p-10 flex flex-col h-full relative"
              maxTiltX={8}
              maxTiltY={10}
              liftZ={36}
              testid={`pricing-tier-${t.slug}`}
            >
              {t.highlight && (
                <div className="absolute -top-3 left-6 bg-hivis text-ink-900 font-display text-xs px-3 py-1 uppercase tracking-tight flex items-center gap-1.5 z-10">
                  <Lightning size={12} weight="fill" /> Most popular
                </div>
              )}
              {/* COMING SOON stamp — diagonal brutalist badge top-right
                  for tiers that aren't yet sellable (multi-user features
                  not built). The angle + double-border + uppercase font
                  reads as a rubber stamp without leaning on imagery. */}
              {t.comingSoon && (
                <div
                  data-testid={`pricing-coming-soon-${t.slug}`}
                  aria-label="Coming soon"
                  className="absolute -top-3 -right-3 z-20 rotate-[8deg] border-2 border-brand bg-ink-900/90 px-3 py-1.5 font-display text-xs uppercase tracking-tight text-brand shadow-lg"
                >
                  <span className="block leading-none">Coming</span>
                  <span className="block leading-none">Soon</span>
                </div>
              )}
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-display text-3xl uppercase tracking-tight">{t.name}</h3>
                <span className="max-w-[8.5rem] text-right text-xs font-mono uppercase tracking-[0.16em] text-ink-200">
                  {t.tag}
                </span>
              </div>
              <div className="mt-6 flex items-end gap-1">
                <span className="font-display text-6xl text-white">${t.price}</span>
                <span className="text-ink-200 mb-2">/mo</span>
              </div>
              <ul className="mt-8 space-y-3 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <Check size={20} weight="bold" className="text-brand shrink-0 mt-0.5" />
                    <span className="text-ink-100">{f}</span>
                  </li>
                ))}
              </ul>
              <Magnetic strength={t.comingSoon ? 0 : 0.18} className="mt-8 w-full">
                {/* Coming-soon tiers still link to /signup so a tradie
                    who picks Crew or Builder lands on the same trial
                    flow. The CTA copy shifts to set the expectation
                    that the multi-user features aren't live yet. */}
                <Link
                  href="/signup"
                  data-testid={`pricing-cta-${t.slug}`}
                  className={`${t.highlight && !t.comingSoon ? "t2q-btn-primary" : "t2q-btn-ghost"} w-full`}
                >
                  {t.comingSoon ? "Notify me when ready" : "Start free trial"}
                </Link>
              </Magnetic>
            </TiltCard>
          ))}
        </div>
      </div>
    </section>
  );
}
