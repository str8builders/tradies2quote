import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
export function FinalCta() {
  return (
    <section className="studio-final" data-testid="section-final-cta">
      <div className="studio-container">
        <div className="studio-eyebrow">
          <span className="studio-status-dot" /> YOUR NEXT JOB STARTS HERE
        </div>
        <h2>
          Tools down.
          <br />
          <em>Quote sent.</em>
        </h2>
        <p>Get your evenings back. Start with your next quote.</p>
        <Link href="/signup" className="studio-button">
          Give it a go — 7 days free <ArrowUpRight size={21} />
        </Link>
        <div className="studio-final-note">
          No credit card needed · Built for NZ tradies
        </div>
      </div>
    </section>
  );
}
