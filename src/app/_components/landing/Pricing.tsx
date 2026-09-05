import Link from "next/link";
import { Check, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
const TIERS = [
  {
    name: "Solo",
    slug: "solo",
    tag: "For your own business",
    price: 49,
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
    tag: "For a small team",
    price: 79,
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
    tag: "For a growing business",
    price: 199,
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
      className="studio-section"
    >
      <div className="studio-container">
        <div className="studio-section-heading">
          <div>
            <div className="studio-eyebrow">06 / STRAIGHT-UP PRICING</div>
            <h2>
              A small business expense.
              <br />
              <em>A better end to your day.</em>
            </h2>
          </div>
          <p>
            Try Solo free for 7 days.
            <br />
            No credit card up front. Cancel anytime.
          </p>
        </div>
        <div className="studio-pricing-grid">
          {TIERS.map((t) => (
            <article
              key={t.slug}
              data-testid={`pricing-tier-${t.slug}`}
              className={`studio-price-card ${!t.comingSoon ? "studio-price-live" : ""}`}
            >
              <div
                className="studio-price-status"
                data-testid={
                  t.comingSoon ? `pricing-coming-soon-${t.slug}` : undefined
                }
              >
                {t.comingSoon ? "COMING SOON" : "AVAILABLE NOW"}
              </div>
              <h3>{t.name}</h3>
              <p>{t.tag}</p>
              <div className="studio-price">
                <strong>${t.price}</strong>
                <span>NZD / month</span>
              </div>
              <span className="studio-price-tax">
                GST inclusive{t.comingSoon ? " · planned pricing" : ""}
              </span>
              <Link
                href="/signup"
                data-testid={`pricing-cta-${t.slug}`}
                className={`studio-button ${t.comingSoon ? "studio-button-secondary" : ""}`}
              >
                {t.comingSoon ? "Start with Solo" : "Start your free trial"}
                <ArrowUpRight size={19} />
              </Link>
              <ul>
                {t.features.map((f) => (
                  <li key={f}>
                    <Check size={16} />
                    {f}
                  </li>
                ))}
              </ul>
              {t.comingSoon && (
                <p className="studio-coming-note">
                  Team features are in development.
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
