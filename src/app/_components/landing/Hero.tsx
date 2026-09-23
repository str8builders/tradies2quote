import Link from "next/link";
import { Play, Check, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { MarketingVideo } from "./MarketingVideo";

export function Hero() {
  return (
    <section className="studio-hero" aria-labelledby="hero-heading">
      <div className="studio-container studio-hero-grid">
        <div className="studio-hero-copy">
          <div className="studio-eyebrow">
            <span className="studio-status-dot" /> BUILT ON SITE. MADE FOR THE
            TRADES.
          </div>
          <h1 id="hero-heading">
            Great at the job.
            <br />
            Done with the
            <br />
            <em>paperwork.</em>
          </h1>
          <p>
            Turn your site notes into a professional quote. Talk it through,
            check the details, send it off. Then get back to what you do best.
          </p>
          <div className="studio-actions">
            <Link
              href="/signup"
              className="studio-button"
              data-testid="hero-cta-start-trial"
            >
              Start your free trial <ArrowUpRight size={20} weight="bold" />
            </Link>
            <a
              href="#demo-reel"
              className="studio-button studio-button-secondary"
              data-testid="hero-cta-how-it-works"
            >
              <Play size={17} weight="fill" /> Watch the 30-second demo
            </a>
          </div>
          <ul className="studio-hero-assurances" aria-label="Why tradies trust it">
            <li>
              <Check size={15} aria-hidden="true" /> Built in NZ by a qualified builder
            </li>
            <li>
              <Check size={15} aria-hidden="true" /> 7 days free, no card
            </li>
            <li>
              <Check size={15} aria-hidden="true" /> You check every quote before it goes
            </li>
          </ul>
        </div>
        <div className="studio-hero-media">
          <div className="studio-hero-phone">
            <MarketingVideo variant="hero" className="studio-hero-phone-screen" />
          </div>
          <span className="studio-demo-caption">
            EXAMPLE JOB · SCREENS REDRAWN FROM THE APP
          </span>
        </div>
      </div>
      <div className="studio-container studio-trade-strip">
        <span>FOR THE PEOPLE WHO BUILD IT.</span>
        <div>
          Builders <i /> Plumbers <i /> Sparkies <i /> Painters <i />{" "}
          Landscapers <i /> Roofers
        </div>
      </div>
    </section>
  );
}
