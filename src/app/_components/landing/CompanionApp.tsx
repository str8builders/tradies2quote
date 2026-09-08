import Link from "next/link";
import { ArrowUpRight, Calculator, Receipt } from "@phosphor-icons/react/dist/ssr";

/** Public install choice. Neither app is presented as a feature inside the other. */
export function CompanionApp() {
  return (
    <section id="calculator" data-testid="section-companion-app" className="studio-section">
      <div className="studio-container">
        <div className="studio-eyebrow">TWO APPS / YOUR CHOICE</div>
        <h2 className="mt-4 font-display text-3xl uppercase text-white sm:text-5xl">Choose your app.</h2>
        <p className="mt-5 max-w-2xl text-lg text-ink-300">Install Tradies2Quote, T2QCAL, or both. Each opens as its own app on your Home Screen.</p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <article className="flex flex-col rounded-2xl border border-ink-700 bg-ink-900 p-6 sm:p-8">
            <Receipt size={36} className="text-brand" aria-hidden />
            <h3 className="mt-5 font-display text-2xl text-white">Tradies2Quote</h3>
            <p className="mt-3 flex-1 text-ink-300">Create and manage your quotes, invoices, clients and material prices.</p>
            <Link href="/app" className="studio-button studio-button-secondary mt-7">Open &amp; install Tradies2Quote <ArrowUpRight size={20} /></Link>
            <p className="mt-3 text-sm text-ink-400">Sign in, then use Install or Add to Home Screen.</p>
          </article>
          <article className="flex flex-col rounded-2xl border border-brand/50 bg-ink-900 p-6 sm:p-8">
            <Calculator size={36} className="text-brand" aria-hidden />
            <h3 className="mt-5 font-display text-2xl text-white">T2QCAL</h3>
            <p className="mt-3 flex-1 text-ink-300">Your separate construction calculator app, with measurements, drawings and saved working.</p>
            <Link href="/t2qcal" className="studio-button studio-button-secondary mt-7">Open &amp; install T2QCAL web app <ArrowUpRight size={20} /></Link>
            <p className="mt-3 text-sm text-ink-400">Calculators open without signing in. Use Install T2QCAL to add this web app.</p>
          </article>
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-400">On iPhone, open your chosen web app in Safari, tap Share, then Add to Home Screen. Repeat for the other app if you want both. T2QCAL is available as an installable web app now. The native iPhone version is retained for a future App Store release.</p>
      </div>
    </section>
  );
}
