import {
  MapPin,
  ShieldCheck,
  PencilSimple,
  HandPalm,
} from "@phosphor-icons/react/dist/ssr";
const PILLARS = [
  {
    slug: "nz-first",
    icon: MapPin,
    title: "Built in New Zealand",
    body: "NZD, NZBN and 15% GST. Built around the way local tradies work.",
  },
  {
    slug: "gst-ready",
    icon: ShieldCheck,
    title: "Your rates. Your margin.",
    body: "Set your labour rate and markup. Check the total before you send.",
  },
  {
    slug: "edit-before-send",
    icon: PencilSimple,
    title: "A draft you can change",
    body: "Edit the scope, line items and terms. Nothing is locked in.",
  },
  {
    slug: "no-auto-send",
    icon: HandPalm,
    title: "You're in charge",
    body: "No surprise client emails. Your quote only leaves when you send it.",
  },
];
export function FounderStory() {
  return (
    <section id="trust" data-testid="section-trust" className="studio-section">
      <div className="studio-container">
        <div className="studio-founder">
          <div>
            <div className="studio-eyebrow">
              05 / FROM ONE TRADIE TO ANOTHER
            </div>
            <h2>
              Built by a builder.
              <br />
              <em>Who gets it.</em>
            </h2>
          </div>
          <div className="studio-founder-story">
            <p>
              “I built this for myself first because I was sick of losing
              Sundays to quoting.”
            </p>
            <div>
              <span className="studio-founder-initials" aria-hidden="true">
                CS
              </span>
              <span>
                <strong>Challis Samu</strong>
                <small>Qualified builder · Founder · New Zealand</small>
              </span>
            </div>
          </div>
        </div>
        <div className="studio-trust-grid">
          {PILLARS.map(({ slug, icon: Icon, title, body }) => (
            <article key={slug} data-testid={`trust-pillar-${slug}`}>
              <Icon size={23} weight="duotone" />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
