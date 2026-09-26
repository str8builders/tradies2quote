import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check } from "@phosphor-icons/react/dist/ssr";
import { PLANS } from "@/lib/plans";
import { LEGAL } from "@/lib/legal";
import { getPlanPriceId, isStripeConfigured } from "@/lib/stripe-client";
import { FAQS } from "../landing/FAQ";
import { Footer } from "../landing/Footer";
import { Logo } from "../landing/Logo";
import { WorkflowExample } from "../landing/WorkflowExample";
import { faqPageLd, softwareApplicationLd } from "../landing/structured-data";
import { DemoButton } from "./DemoButton";
import { HouseWalk } from "./HouseWalk";
import { JobSiteExperience } from "./JobSiteExperience";
import { StillDawn } from "./StillDawn";
import { FILMED_ON, FINISHED, FOUNDER, HELP_LINE, HERO, PRICING, PROOF, T2QCAL, TRADES, TRIAL_LINE } from "./story";
import "./jobsite.css";

/** Crew and Builder are on sale only when team plans and their Stripe prices are live (as on the current homepage). */
function onSale(id: keyof typeof PLANS): boolean {
  if (id === "solo") return true;
  return process.env.TEAM_PLANS_ENABLED === "true" && isStripeConfigured() && Boolean(getPlanPriceId(id));
}

function StartButton({ className = "" }: { className?: string }) {
  return (
    <Link href="/signup" className={`jobsite-start ${className}`} data-testid="jobsite-start">
      Start your free trial <ArrowUpRight size={20} weight="bold" aria-hidden="true" />
    </Link>
  );
}

const tradesLine = `For ${TRADES.slice(0, -1).map((t) => t.toLowerCase()).join(", ")} and ${TRADES[TRADES.length - 1].toLowerCase()}.`;

/**
 * The job-site website: one job followed from first light to tools down.
 *
 *   1. site    — a 3D building site at dawn; the camera walks through the frame
 *   2. portal  — into the phone on the sawhorse, ending in a warm flash
 *   3. house   — one of the owner's builds, a room per step (Talk → Invoice)
 *   4. details — the finished home, T2QCAL, pricing, the FAQ, the sign-up
 *
 * Everything readable is real HTML in this component, in story order, so
 * search engines, screen readers, slow phones and the still version get the
 * whole story. <JobSiteExperience> adds the 3D; <HouseWalk> adds the walk.
 * Tier prices and the FAQ never render inside the iOS App Store shell
 * (3.1.3(f)), the same rule as the current homepage.
 */
export function JobSiteStory({ nativeShell }: { nativeShell: boolean }) {
  return (
    <div className="jobsite" data-jobsite-root data-level="still">
      <JobSiteExperience />

      <header className="jobsite-header">
        <Link href="/" aria-label="Tradies2Quote home" className="flex items-center">
          <Logo size={40} wordmarkClassName="hidden sm:inline" />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/login" className="jobsite-header-link">
            Log in
          </Link>
          <Link href="/signup" className="jobsite-header-start">
            Start free
          </Link>
        </nav>
      </header>

      <main id="main-content" className="relative z-10">
        {/* 1 · The site at first light */}
        <section id="site" data-scene="site" className="jobsite-scene jobsite-scene--site" aria-labelledby="hero-heading">
          <div className="jobsite-backdrop" aria-hidden="true">
            <StillDawn className="jobsite-poster" />
          </div>
          <div className="jobsite-hero-screen">
            <div className="jobsite-scrim" aria-hidden="true" />
            <div className="jobsite-hero">
              <p className="jobsite-eyebrow">{"// "}{HERO.eyebrow}</p>
              <h1 id="hero-heading" className="jobsite-hero-title">
                {HERO.title[0]}
                <br />
                <span>{HERO.title[1]}</span>
              </h1>
              <p className="jobsite-lede">{HERO.lede}</p>
              <div className="jobsite-actions">
                <StartButton />
                <DemoButton className="jobsite-secondary">Watch the 30-second demo</DemoButton>
              </div>
              <p className="jobsite-assure">
                <Check size={15} aria-hidden="true" /> {TRIAL_LINE}
              </p>
            </div>
          </div>
          <div className="jobsite-caption-track" aria-hidden="true">
            <p className="jobsite-caption">{HERO.caption}</p>
          </div>
        </section>

        {/* 2 · Into the phone: the camera's push and the flash (3D only) */}
        <div data-scene="portal" className="jobsite-scene jobsite-scene--portal" aria-hidden="true" />

        {/* 3 · Inside the house: Talk, Draft, Check, Send, Invoice */}
        <div data-scene="house" className="jobsite-scene jobsite-scene--house">
          <HouseWalk />
        </div>

        {/* 4 · The finished home, then the details */}
        <section id="tools-down" data-scene="details" className="jobsite-details" aria-labelledby="finished-heading">
          <div className="finished">
            <Image src={FINISHED.photo} alt={FINISHED.photoAlt} fill sizes="100vw" className="finished-photo" />
            <div className="finished-scrim" aria-hidden="true" />
            <div className="finished-copy">
              <p className="jobsite-eyebrow">{"// "}{FILMED_ON}</p>
              <h2 id="finished-heading" className="finished-title">
                {FINISHED.title}
              </h2>
              <p className="finished-body">{FINISHED.body}</p>
              <p className="finished-trades">{tradesLine}</p>
              <div className="jobsite-actions" data-final-cta>
                <StartButton />
                <DemoButton className="jobsite-secondary">Watch the 30-second demo</DemoButton>
                {nativeShell ? null : (
                  <Link href="/t2qcal" className="jobsite-secondary">
                    Open T2QCAL
                  </Link>
                )}
              </div>
              <p className="jobsite-assure">
                <Check size={15} aria-hidden="true" /> {TRIAL_LINE}
              </p>
            </div>
          </div>

          <div className="jobsite-container details">
            <figure className="jobsite-founder">
              <blockquote>“{FOUNDER.quote}”</blockquote>
              <figcaption>
                <span className="jobsite-founder-badge" aria-hidden="true">
                  {FOUNDER.initials}
                </span>
                <span>
                  <strong>{FOUNDER.name}</strong>
                  <br />
                  {FOUNDER.role}
                </span>
              </figcaption>
            </figure>

            <div className="jobsite-t2qcal">
              <div>
                <h3>{T2QCAL.title}</h3>
                <p>{T2QCAL.body}</p>
                {nativeShell ? null : (
                  <Link href="/t2qcal" className="jobsite-inline-link">
                    Open T2QCAL <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                  </Link>
                )}
              </div>
              {nativeShell ? null : (
                <div className="jobsite-tryit" aria-label="Price a floor">
                  <WorkflowExample />
                </div>
              )}
            </div>

            <ul className="jobsite-proof" aria-label="The numbers">
              {PROOF.map((p) => (
                <li key={p.label}>
                  <span className="jobsite-proof-value">{p.value}</span>
                  <span className="jobsite-proof-label">{p.label}</span>
                </li>
              ))}
            </ul>

            {nativeShell ? null : (
              <div id="pricing" className="jobsite-pricing" data-testid="jobsite-pricing">
                <h3 className="jobsite-pricing-title">{PRICING.title}</h3>
                <p className="jobsite-pricing-note">
                  {PRICING.note} · {TRIAL_LINE}
                </p>
                <div className="jobsite-pillars">
                  {Object.values(PLANS).map((plan) => {
                    const live = onSale(plan.id);
                    return (
                      <article key={plan.id} className="jobsite-pillar" data-testid={`jobsite-plan-${plan.id}`}>
                        <p className="jobsite-pillar-name">{plan.name}</p>
                        <p className="jobsite-pillar-price">
                          <span>${plan.price}</span> /month
                        </p>
                        <p className="jobsite-pillar-tag">{live ? plan.tag : "Coming soon"}</p>
                        <ul>
                          {plan.features.map((f) => (
                            <li key={f}>
                              <Check size={14} aria-hidden="true" /> {f}
                            </li>
                          ))}
                        </ul>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {nativeShell ? null : (
              <div id="faq" className="jobsite-faq">
                <h3>Questions tradies ask</h3>
                {FAQS.map((item) => (
                  <details key={item.slug}>
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            )}

            <div className="jobsite-closing">
              <StartButton />
              <p className="jobsite-help">
                {HELP_LINE} <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer hidePricingLinks={nativeShell} />

      {nativeShell ? null : (
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationLd) }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageLd(FAQS)) }} />
        </>
      )}
    </div>
  );
}
