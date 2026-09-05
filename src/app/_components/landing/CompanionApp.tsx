import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check } from "@phosphor-icons/react/dist/ssr";
export function CompanionApp() {
  return (
    <section
      id="calculator"
      data-testid="section-companion-app"
      className="studio-section"
    >
      <div className="studio-container studio-calculator">
        <div className="studio-calculator-art">
          <div className="studio-calculator-title">
            T<span>2</span>Q<span>CAL</span>
          </div>
          <div className="studio-calculator-screen">
            <Image
              src="/screens/t2qcal-drawing.jpg"
              alt="T2QCAL showing a measured stair drawing"
              width={720}
              height={1560}
              sizes="(max-width: 800px) 240px, 300px"
            />
          </div>
          <div className="studio-calculator-badge">
            <span>MEASURE. CHECK. QUOTE.</span>
            <strong>Built to work together.</strong>
          </div>
        </div>
        <div className="studio-calculator-copy">
          <div className="studio-eyebrow">04 / MEET YOUR OTHER POWER TOOL</div>
          <h2>
            From a measurement.
            <br />
            <em>To a priced quote.</em>
          </h2>
          <p>
            T2QCAL brings construction calculations and measured drawings to
            your iPhone. Send selected quantities into a Tradies2Quote draft,
            using your own rates, markup and GST.
          </p>
          <div className="studio-calculator-stats">
            <div data-testid="companion-proof-calculators">
              <strong>94</strong>
              <span>trade calculators</span>
            </div>
            <div data-testid="companion-proof-library">
              <strong>74</strong>
              <span>manuals &amp; resources</span>
            </div>
            <div data-testid="companion-proof-account">
              <strong>01</strong>
              <span>account for both</span>
            </div>
          </div>
          <p className="studio-calculator-note">
            <Check size={17} /> Calculators work signed out. Sign in to connect
            your quotes.
          </p>
          <Link
            href="/calculator"
            className="studio-button studio-button-secondary"
          >
            Explore T2QCAL <ArrowUpRight size={20} />
          </Link>
          <span className="studio-availability">
            iPhone companion in beta · Register your interest
          </span>
        </div>
      </div>
    </section>
  );
}
