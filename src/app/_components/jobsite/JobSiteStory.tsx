import Link from "next/link";
import { ArrowUpRight, Check, Microphone, TextAa, FileImage, QrCode } from "@phosphor-icons/react/dist/ssr";
import { PLANS } from "@/lib/plans";
import { LEGAL } from "@/lib/legal";
import { getPlanPriceId, isStripeConfigured } from "@/lib/stripe-client";
import { FAQS } from "../landing/FAQ";
import { Footer } from "../landing/Footer";
import { Logo } from "../landing/Logo";
import { WorkflowExample } from "../landing/WorkflowExample";
import { faqPageLd, softwareApplicationLd } from "../landing/structured-data";
import { DemoButton } from "./DemoButton";
import { JobSiteExperience } from "./JobSiteExperience";
import { StillDawn } from "./StillDawn";
import { HERO, PAID, PORTAL_LINE, PROOF, QUOTE, TALK, TOOLS_DOWN, TRADES, TRIAL_LINE } from "./story";
import "./jobsite.css";

const WAY_ICONS = [Microphone, TextAa, FileImage] as const;

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

/**
 * The job-site website: one job followed from first light to tools down.
 *
 * Everything readable is real HTML in this component, in story order, so
 * search engines, screen readers, slow phones and the still version get the
 * whole story. <JobSiteExperience> adds the 3D world behind it on devices
 * that can take it. Tier prices and the FAQ never render inside the iOS
 * App Store shell (3.1.3(f)), the same rule as the current homepage.
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

        {/* 2 · Into the phone */}
        <section id="portal" data-scene="portal" className="jobsite-scene jobsite-scene--portal" aria-label="Voice in, quote out">
          <div className="jobsite-portal-track">
            <p className="jobsite-portal-line">{PORTAL_LINE}</p>
          </div>
        </section>

        {/* 3 · TALK */}
        <section id="talk" data-scene="talk" className="jobsite-chapter" aria-labelledby="talk-heading">
          <div className="jobsite-container">
            <p className="jobsite-eyebrow">{"// 01 · Talk the job through"}</p>
            <h2 id="talk-heading" className="jobsite-word">{TALK.title}</h2>
            <p className="jobsite-kicker">{TALK.kicker}</p>
            <p className="jobsite-body jobsite-body--lead">{TALK.what}</p>
            <ul className="jobsite-trades" aria-label="Who it’s for">
              {TRADES.map((trade) => (
                <li key={trade}>{trade}</li>
              ))}
            </ul>
            <div className="jobsite-grid">
              {TALK.ways.map((way, i) => {
                const Icon = WAY_ICONS[i];
                return (
                  <article key={way.name} className="jobsite-station">
                    <Icon size={28} weight="duotone" aria-hidden="true" className="text-brand" />
                    <h3>{way.name}</h3>
                    <p>{way.body}</p>
                  </article>
                );
              })}
            </div>
            <article className="jobsite-station jobsite-station--wide">
              <QrCode size={28} weight="duotone" aria-hidden="true" className="text-brand" />
              <h3>{TALK.qr.title}</h3>
              <p>{TALK.qr.body}</p>
            </article>
            <figure className="jobsite-founder">
              <blockquote>“{TALK.founder.quote}”</blockquote>
              <figcaption>
                <span className="jobsite-founder-badge" aria-hidden="true">
                  {TALK.founder.initials}
                </span>
                <span>
                  <strong>{TALK.founder.name}</strong>
                  <br />
                  {TALK.founder.role}
                </span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* 4 · QUOTE */}
        <section id="quote" data-scene="quote" className="jobsite-chapter" aria-labelledby="quote-heading">
          <div className="jobsite-container">
            <p className="jobsite-eyebrow">{"// 02 · The quote builds itself"}</p>
            <h2 id="quote-heading" className="jobsite-word">{QUOTE.title}</h2>
            <p className="jobsite-kicker">{QUOTE.kicker}</p>
            <div className="jobsite-grid">
              <article id="draft" className="jobsite-station">
                <h3>{QUOTE.draft.title}</h3>
                <p>{QUOTE.draft.body}</p>
              </article>
              <article className="jobsite-station">
                <h3>{QUOTE.supplier.title}</h3>
                <p>{QUOTE.supplier.body}</p>
              </article>
              <article className="jobsite-station">
                <h3>{QUOTE.numbers.title}</h3>
                <p>{QUOTE.numbers.body}</p>
              </article>
            </div>
            <article id="check" className="jobsite-station jobsite-station--loud">
              <h3>{QUOTE.check.title}</h3>
              <p>{QUOTE.check.body}</p>
            </article>
            <div className="jobsite-t2qcal">
              <div>
                <h3>{QUOTE.t2qcal.title}</h3>
                <p>{QUOTE.t2qcal.body}</p>
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
          </div>
        </section>

        {/* 5 · PAID */}
        <section id="paid" data-scene="paid" className="jobsite-chapter" aria-labelledby="paid-heading">
          <div className="jobsite-container">
            <p className="jobsite-eyebrow">{"// 03 · Sent, signed, invoiced"}</p>
            <h2 id="paid-heading" className="jobsite-word">{PAID.title}</h2>
            <p className="jobsite-kicker">{PAID.kicker}</p>
            <div className="jobsite-grid">
              <article id="send" className="jobsite-station">
                <h3>{PAID.send.title}</h3>
                <p>{PAID.send.body}</p>
              </article>
              <article className="jobsite-station">
                <h3>{PAID.sign.title}</h3>
                <p>{PAID.sign.body}</p>
              </article>
              <article id="invoice" className="jobsite-station">
                <h3>{PAID.invoice.title}</h3>
                <p>{PAID.invoice.body}</p>
              </article>
            </div>
            <article className="jobsite-station jobsite-station--wide">
              <h3>{PAID.together.title}</h3>
              <p>{PAID.together.body}</p>
            </article>
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
                <h3 className="jobsite-pricing-title">{PAID.pricing.title}</h3>
                <p className="jobsite-pricing-note">
                  {PAID.pricing.note} · {TRIAL_LINE}
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
          </div>
        </section>

        {/* 6 · Tools down */}
        <section id="tools-down" data-scene="tools" className="jobsite-chapter jobsite-chapter--end" aria-labelledby="end-heading">
          <div className="jobsite-container">
            <h2 id="end-heading" className="jobsite-end-title">{TOOLS_DOWN.title}</h2>
            <p className="jobsite-kicker">{TOOLS_DOWN.body}</p>
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
            <p className="jobsite-help">
              {TOOLS_DOWN.help}{" "}
              <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>
            </p>
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
