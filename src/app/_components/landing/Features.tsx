import Image from "next/image";
import {
  Microphone,
  FileText,
  Calculator,
  Stack,
  Camera,
  Ruler,
  Books,
  QrCode,
  ArrowUpRight,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
const FEATURES = [
  {
    slug: "voice-first",
    icon: Microphone,
    title: "Talk it through.",
    body: "Get your first draft out of your head and onto the page. Voice, typed notes, or a scanned plan.",
  },
  {
    slug: "branded-pdf",
    icon: FileText,
    title: "Look the business.",
    body: "Professional quote PDFs with your branding, terms, and a clear breakdown of the job.",
  },
  {
    slug: "tax-built-in",
    icon: Calculator,
    title: "Know your numbers.",
    body: "Materials, labour, markup and GST, laid out clearly. You check the figures before sending.",
  },
  {
    slug: "materials-labour",
    icon: Stack,
    title: "Keep it all together.",
    body: "Your clients, material rates, quotes, invoices and job calendar in one place, ready for the next job.",
  },
  {
    slug: "supplier-scan",
    icon: Camera,
    title: "Scan the supplier's quote.",
    body: "Photograph a quote or invoice from ITM, PlaceMakers or Mitre 10 — up to six pages at once — and the prices land in your materials library. CSV import too.",
  },
  {
    slug: "qr-requests",
    icon: QrCode,
    title: "Your QR code. Their request.",
    body: "Print your code on the van, the site fence or a card. Clients scan it, describe the job and add photos. It lands in the app as a draft quote, written up and waiting for you.",
  },
  {
    slug: "t2qcal",
    icon: Ruler,
    title: "Measure it. Draw it. Quote it.",
    body: "T2QCAL's 95 calculators draw the job as you type. The camera reads pitch, fall, height and lengths from a photo, and the quantities go straight into a draft quote at your markup and GST.",
  },
  {
    slug: "the-books",
    icon: Books,
    title: "The books, on the job.",
    body: "NZS 3604, the Building Code clauses and the GIB, MiTek, James Hardie and Pryda manuals sit under every calculator. Keep them on the phone and open them with no signal.",
  },
];
export function Features() {
  return (
    <section
      id="features"
      data-testid="section-features"
      className="studio-section studio-feature-section"
    >
      <div className="studio-container">
        <div className="studio-section-heading">
          <div>
            <div className="studio-eyebrow">03 / YOUR EVERYDAY TOOLBOX</div>
            <h2>
              Built for your work.
              <br />
              <em>And your working day.</em>
            </h2>
          </div>
          <Link className="studio-text-link" href="/signup">
            Put it to work <ArrowUpRight size={21} />
          </Link>
        </div>
        <div className="studio-feature-grid">
          {FEATURES.map(({ slug, icon: Icon, title, body }) => (
            <article
              className="studio-feature"
              key={slug}
              data-testid={`feature-${slug}`}
            >
              <div className="studio-icon-box">
                <Icon size={26} weight="duotone" />
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
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
            <h2>
              Your best work happens
              <br />
              <em>away from a desk.</em>
            </h2>
            <p>
              Take your quoting with you. On site, in the ute,
              <br />
              or wherever the next job takes you.
            </p>
          </div>
          <span className="studio-worksite-caption">
            ILLUSTRATIVE WORKSITE IMAGE
          </span>
        </div>
      </div>
    </section>
  );
}
