import Image from "next/image";
import {
  Microphone,
  FileText,
  Calculator,
  Stack,
  Camera,
  QrCode,
  ArrowUpRight,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

/**
 * Six things the app does, each with a screen from the marketing kit
 * (src/remotion, rendered by `npm run render:marketing`). The screens are
 * redrawn from the real app with one fictional example job, so no real
 * account, client or figure ever appears on the public site.
 */
const FEATURES = [
  {
    slug: "voice-first",
    icon: Microphone,
    title: "Talk it through.",
    body: "Record a walkthrough, type a few lines or scan a plan. Your words become the first draft.",
    image: "/images/marketing/feature-voice.webp",
    alt: "Recording a site note about a new timber deck",
  },
  {
    slug: "supplier-scan",
    icon: Camera,
    title: "Scan the supplier's quote.",
    body: "Photograph a quote or invoice from ITM, PlaceMakers, Mitre 10 or any supplier, up to six pages at once. The lines land in your materials.",
    image: "/images/marketing/feature-supplier-scan.webp",
    alt: "A supplier quote being read into material lines",
  },
  {
    slug: "qr-request",
    icon: QrCode,
    title: "Your QR code. Their request.",
    body: "Put your code on the van, the site fence or a card. Clients describe the job and add photos, and a draft is waiting for you.",
    image: "/images/marketing/feature-qr-request.webp",
    alt: "A client sending a job request with photos from a QR code",
  },
  {
    slug: "branded-pdf",
    icon: FileText,
    title: "Look the business.",
    body: "A branded quote your client reads, accepts and signs on their phone. You get told the moment they do.",
    image: "/images/marketing/feature-client-accept.webp",
    alt: "A client accepting and signing a quote on their phone",
  },
  {
    slug: "tax-built-in",
    icon: Calculator,
    title: "Know your numbers.",
    body: "Your rates, your markup and GST, line by line. You check every figure before it goes.",
    image: "/images/marketing/feature-numbers.webp",
    alt: "Quote totals showing materials, labour, GST and the total",
  },
  {
    slug: "materials-labour",
    icon: Stack,
    title: "Keep it all together.",
    body: "Clients, material prices, quotes, invoices and your job calendar in one place.",
    image: "/images/marketing/feature-invoices.webp",
    alt: "The invoices list with a paid invoice",
  },
];

export function Features() {
  return (
    <section
      id="features"
      data-testid="section-features"
      className="studio-section studio-feature-section"
      aria-labelledby="features-heading"
    >
      <div className="studio-container">
        <div className="studio-section-heading">
          <div>
            <div className="studio-eyebrow">02 / WHAT YOU GET</div>
            <h2 id="features-heading">
              Built for your work.
              <br />
              <em>And your working day.</em>
            </h2>
          </div>
          <Link className="studio-text-link" href="/signup">
            Start your free trial <ArrowUpRight size={21} />
          </Link>
        </div>
        <ul className="studio-feature-cards" aria-label="Features">
          {FEATURES.map(({ slug, icon: Icon, title, body, image, alt }) => (
            <li
              className="studio-feature-card"
              key={slug}
              data-testid={`feature-${slug}`}
            >
              <div className="studio-feature-shot">
                <Image
                  src={image}
                  alt={alt}
                  width={960}
                  height={1200}
                  sizes="(max-width: 800px) 70vw, 300px"
                />
              </div>
              <div className="studio-feature-text">
                <h3>
                  <Icon size={20} weight="duotone" aria-hidden="true" />
                  {title}
                </h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="studio-worksite">
          <Image
            src="/images/worksite.webp"
            alt="A carpenter measuring timber during a residential renovation"
            fill
            sizes="(max-width: 800px) 100vw, 1240px"
            className="studio-worksite-image"
          />
          <div className="studio-worksite-shade" />
          <div className="studio-worksite-copy">
            <div className="studio-eyebrow">
              <span className="studio-status-dot" /> MADE FOR DAYS LIKE THIS
            </div>
            <p className="studio-worksite-title">
              Your best work happens
              <br />
              <em>away from a desk.</em>
            </p>
            <p>
              Take your quoting with you. On site, in the ute, or wherever the
              next job takes you.
            </p>
          </div>
          <span className="studio-worksite-caption">ILLUSTRATIVE PHOTO</span>
        </div>
      </div>
    </section>
  );
}
