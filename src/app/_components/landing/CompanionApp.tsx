import Image from "next/image";
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
          <article className="studio-app-card flex flex-col rounded-2xl border border-ink-700 bg-ink-900 p-6 sm:p-8">
            <div className="studio-app-shot" aria-hidden="true">
              <Image src="/screens/screen-2.jpg" alt="" width={360} height={780} sizes="200px" />
            </div>
            <Receipt size={36} className="text-brand" aria-hidden />
            <h3 className="mt-5 font-display text-2xl text-white">Tradies2Quote</h3>
            <p className="mt-3 flex-1 text-ink-300">Quotes from voice, notes or a scanned plan. Supplier quotes scanned from photos into your materials. Invoices, clients, a job calendar and your own QR request code for the van.</p>
            <Link href="/app" className="studio-button studio-button-secondary mt-7">Open &amp; install Tradies2Quote <ArrowUpRight size={20} /></Link>
            <p className="mt-3 text-sm text-ink-400">Sign in, then use Install or Add to Home Screen.</p>
          </article>
          <article className="studio-app-card flex flex-col rounded-2xl border border-brand/50 bg-ink-900 p-6 sm:p-8">
            <div className="studio-app-shot" aria-hidden="true">
              <Image src="/screens/t2qcal-drawing.jpg" alt="" width={360} height={780} sizes="200px" />
            </div>
            <Calculator size={36} className="text-brand" aria-hidden />
            <h3 className="mt-5 font-display text-2xl text-white">T2QCAL</h3>
            <p className="mt-3 flex-1 text-ink-300">95 construction calculators that draw the job as you type. Camera measuring for pitch, fall, height and photo lengths. Calibrated PDF plan takeoff with quantities and source details for your quote. NZ standards and manuals under every calculator, kept offline for site. Quantities land in a Tradies2Quote draft.</p>
            <Link href="/t2qcal" className="studio-button studio-button-secondary mt-7">Open &amp; install T2QCAL web app <ArrowUpRight size={20} /></Link>
            <p className="mt-3 text-sm text-ink-400">Calculators open without signing in. Device saves work without an account. Sign in with your Tradies2Quote login to queue calculator backups and send quantities to a quote.</p>
          </article>
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-400">On iPhone, open your chosen web app in Safari, tap Share, then Add to Home Screen. Repeat for the other app if you want both. T2QCAL is available as an installable web app now. The native iPhone version is retained for a future App Store release.</p>
      </div>
    </section>
  );
}
