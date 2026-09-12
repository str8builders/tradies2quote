import Link from "next/link";
import {
  ArrowRight,
  Play,
  Check,
  ArrowUpRight,
  FileText,
} from "@phosphor-icons/react/dist/ssr";
import { VoiceSignal } from "../VoiceSignal";
import InstallPWAButton from "./InstallPWAButton";

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
              <Play size={17} weight="fill" /> See it in action
            </a>
          </div>
          <div className="studio-hero-assurances">
            <span>
              <Check size={15} /> 7 days free
            </span>
            <span>
              <Check size={15} /> No credit card
            </span>
            <span>
              <Check size={15} /> You review. You send.
            </span>
          </div>
          <div className="studio-install">
            <InstallPWAButton variant="hero" />
          </div>
        </div>
        <div
          className="studio-product-stage"
          aria-label="Example of a voice note becoming an editable quote"
        >
          <div className="studio-stage-orbit" aria-hidden="true" />
          <div className="studio-stage-label">
            <span /> FROM A QUICK SITE NOTE
          </div>
          <div className="studio-voice-card">
            <VoiceSignal compact />
            <div>
              <strong>Your words. Your quote.</strong>
              <p>“New timber deck, 24 square metres...”</p>
            </div>
            <div className="studio-wave" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height: `${12 + ((i * 17) % 25)}px`,
                    animationDelay: `${i * -0.12}s`,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="studio-quote-card">
            <div className="studio-quote-top">
              <span className="studio-quote-brand">
                YOUR BUSINESS<span>PROFESSIONAL QUOTE</span>
              </span>
              <FileText size={26} weight="duotone" />
            </div>
            <div className="studio-quote-title">
              <div>
                <span className="studio-small-label">QUOTE / EXAMPLE</span>
                <h2>
                  One great-looking
                  <br />
                  timber deck.
                </h2>
              </div>
              <span className="studio-draft">Draft</span>
            </div>
            <div className="studio-quote-lines">
              <div>
                <span>
                  Decking &amp; fixings<small>Materials</small>
                </span>
                <strong>$2,640.00</strong>
              </div>
              <div>
                <span>
                  Site preparation &amp; installation<small>Labour</small>
                </span>
                <strong>$1,560.00</strong>
              </div>
            </div>
            <div className="studio-quote-subtotal">
              <span>Subtotal</span>
              <span>$4,200.00</span>
            </div>
            <div className="studio-quote-subtotal">
              <span>GST (15%)</span>
              <span>$630.00</span>
            </div>
            <div className="studio-quote-total">
              <span>Total NZD</span>
              <strong>$4,830.00</strong>
            </div>
            <div className="studio-quote-review">
              <Check size={18} weight="bold" /> Ready for your review{" "}
              <ArrowRight size={19} />
            </div>
          </div>
          <div className="studio-approval">
            <span>
              <Check size={17} weight="bold" />
            </span>
            <div>
              Your name on it.<strong>Your final say.</strong>
            </div>
          </div>
          <span className="studio-demo-caption">
            ILLUSTRATIVE QUOTE · YOU SET YOUR OWN RATES
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
