import Link from "next/link";
import { Microphone, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { Magnetic } from "./Magnetic";

export function FinalCta() {
  return (
    <section
      id="get-started"
      data-testid="section-final-cta"
      className="relative border-b border-ink-600 bg-ink-950 py-24 md:py-32 overflow-hidden"
    >
      <div className="absolute inset-0 t2q-grid-bg opacity-30 pointer-events-none" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[680px] h-[400px] rounded-full bg-brand/15 blur-3xl pointer-events-none animate-blob-slow" />
      <div className="absolute -bottom-32 right-0 w-[420px] h-[420px] rounded-full bg-hivis/10 blur-3xl pointer-events-none animate-blob" />

      <div className="relative max-w-7xl mx-auto px-6 md:px-12">
        <div className="rounded-lg border-2 border-brand bg-ink-900/95 p-8 shadow-[0_26px_70px_-36px_rgba(255,95,21,0.65)] md:p-14">
          <div className="grid md:grid-cols-2 gap-10 items-end">
            <div>
              <div className="t2q-section-label mb-4">{"// stop quoting on sundays"}</div>
              <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tighter uppercase leading-[0.95]">
                Get quoting <br />
                <span className="text-brand">at site speed.</span>
              </h2>
              <p className="mt-5 text-lg text-ink-200 max-w-md leading-relaxed">
                Built for NZ tradies. 7-day free trial — no credit card to
                start, cancel anytime. We&apos;ll onboard you personally.
              </p>
              <ul className="mt-6 grid sm:grid-cols-2 gap-2 text-sm text-ink-100">
                <li className="flex items-center gap-2">
                  <ShieldCheck size={16} weight="bold" className="text-brand" />
                  Editable before sending
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck size={16} weight="bold" className="text-brand" />
                  GST 15% baked in
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck size={16} weight="bold" className="text-brand" />
                  Quote &amp; invoice in one
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck size={16} weight="bold" className="text-brand" />
                  Built by a builder, in NZ
                </li>
              </ul>
            </div>
            <div className="flex flex-col gap-4 md:items-end">
              <Magnetic strength={0.22}>
                <Link
                  href="/signup"
                  data-testid="final-cta-primary"
                  className="t2q-btn-primary"
                >
                  <Microphone size={20} weight="bold" /> Start free trial
                </Link>
              </Magnetic>
              <Link
                href="/login"
                data-testid="final-cta-signin"
                className="font-mono text-xs uppercase tracking-[0.18em] text-ink-200 hover:text-white transition-colors"
              >
                Already have an account? Sign in →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
