import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Camera,
  Ruler,
} from "@phosphor-icons/react/dist/ssr";
import { WorkflowExample } from "./WorkflowExample";

const POINTS = [
  {
    slug: "draws",
    icon: Ruler,
    title: "Draws the job as you type.",
    body: "Rafters, stairs, decks, framing, concrete, spacing and more, each with a live drawing you can show the client.",
  },
  {
    slug: "camera",
    icon: Camera,
    title: "Measure from a photo.",
    body: "The camera reads pitch, fall, height and lengths on site.",
  },
  {
    slug: "standards",
    icon: BookOpen,
    title: "The standards, on site.",
    body: "Each calculator links to NZS 3604, the Building Code clauses and the manufacturers' own published guides. Save them to your phone for no-signal days.",
  },
];

/**
 * T2QCAL, the companion calculator web app. Withheld server-side inside the
 * iOS App Store shell (see page.tsx), because it is distributed outside the
 * App Store.
 */
export function CompanionApp() {
  return (
    <section
      id="calculator"
      data-testid="section-companion-app"
      className="studio-section"
      aria-labelledby="calculator-heading"
    >
      <div className="studio-container">
        <div className="studio-section-heading">
          <div>
            <div className="studio-eyebrow">03 / T2QCAL CALCULATORS</div>
            <h2 id="calculator-heading">
              Measure it. Draw it.
              <br />
              <em>Quote it.</em>
            </h2>
          </div>
          <p>
            95 construction calculators that draw the job as you type. They
            open without signing in.
          </p>
        </div>
        <div className="studio-calc-grid">
          <div>
            <ul className="studio-calc-points">
              {POINTS.map(({ slug, icon: Icon, title, body }) => (
                <li key={slug} data-testid={`calculator-point-${slug}`}>
                  <span className="studio-icon-box" aria-hidden="true">
                    <Icon size={22} weight="duotone" />
                  </span>
                  <span>
                    <strong>{title}</strong> {body}
                  </span>
                </li>
              ))}
            </ul>
            <div className="studio-actions">
              <Link href="/t2qcal" className="studio-button" data-testid="calculator-open">
                Open T2QCAL <ArrowUpRight size={20} weight="bold" />
              </Link>
              <Link
                href="/t2qcal/install"
                className="studio-button studio-button-secondary"
                data-testid="calculator-install"
              >
                Install it on your phone
              </Link>
            </div>
            <p className="studio-fineprint">
              Signed in, a calculator&apos;s quantities drop straight into a
              Tradies2Quote draft. T2QCAL is not affiliated with the
              manufacturers whose guides it links to.
            </p>
          </div>
          <div className="studio-calc-shot">
            <Image
              src="/screens/t2qcal-drawing.jpg"
              alt="T2QCAL drawing a staircase with its rise, going and stringer measurements"
              width={717}
              height={1560}
              sizes="(max-width: 800px) 62vw, 300px"
            />
          </div>
        </div>
        <WorkflowExample />
      </div>
    </section>
  );
}
