import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Ruler,
  UserCircle,
} from "@phosphor-icons/react/dist/ssr";

/**
 * T2QCAL — the companion calculator app — on the landing page.
 *
 * The point of the section is the JOIN, not the calculator: a quantity worked
 * out on site crosses into a Tradies2Quote draft priced at the tradie's own
 * markup and GST, because both apps read the same profile row.
 *
 * Every figure here is counted from the app's own source (94 calculator slugs
 * in T2QCAL/Models/Tools*.swift; 74 documents in Models/Resources.swift) and
 * every screenshot is a capture of the running app. Nothing is claimed about
 * downloads, users or time saved — the app isn't on the App Store yet and the
 * section says so.
 */

const PROOF = [
  {
    slug: "calculators",
    icon: Ruler,
    stat: "94",
    title: "calculators",
    body: "Rafters, stairs, spacings, slabs, cladding, tube — each with a live measured drawing you can check against the job.",
  },
  {
    slug: "account",
    icon: UserCircle,
    stat: "1",
    title: "login, both apps",
    body: "The same Tradies2Quote account. Your labour rate, markup and GST come from the same profile the website prices from.",
  },
  {
    slug: "library",
    icon: BookOpenText,
    stat: "74",
    title: "manuals on the phone",
    body: "GIB, MiTek, James Hardie, Pryda, Concrete NZ. Sixty-two pull down over wifi and read in a subfloor with no signal; the Building Code clauses are listed alongside them.",
  },
];

export function CompanionApp() {
  return (
    <section
      id="calculator"
      data-testid="section-companion-app"
      className="relative overflow-hidden border-b border-ink-600 bg-ink-950 py-24 md:py-32"
    >
      <div className="t2q-grid-bg pointer-events-none absolute inset-0 opacity-25" />
      <div className="pointer-events-none absolute -right-32 top-10 h-[420px] w-[420px] rounded-full bg-brand/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6 md:px-12">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          {/* ── The pitch ─────────────────────────────────────────────── */}
          <div>
            <div className="t2q-section-label mb-4">{"// the second app"}</div>

            <h2 className="font-display text-4xl uppercase leading-[0.95] tracking-tighter sm:text-5xl lg:text-6xl">
              Measure it <br />
              <span className="text-brand">on the way</span> <br />
              to quoting it.
            </h2>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-200">
              <span className="font-display uppercase tracking-tight text-white">
                T<span className="text-brand">2</span>Q
                <span className="text-hivis">CAL</span>
              </span>{" "}
              is a construction calculator that signs in with your Tradies2Quote
              account. Work out the concrete on site, tick the lines you&apos;re
              actually ordering, and they land in a draft quote — priced at your
              markup and your GST, flagged as measured so the app doesn&apos;t
              ask you to confirm them twice.
            </p>

            <dl className="mt-10 space-y-5">
              {PROOF.map(({ slug, icon: Icon, stat, title, body }) => (
                <div
                  key={slug}
                  data-testid={`companion-proof-${slug}`}
                  className="flex gap-4"
                >
                  <div className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-brand/35 bg-brand/10">
                    <Icon size={20} weight="bold" className="text-brand" />
                  </div>
                  <div>
                    <dt className="font-display text-xl uppercase tracking-tight">
                      <span className="text-brand">{stat}</span> {title}
                    </dt>
                    <dd className="mt-1 max-w-md leading-relaxed text-ink-200">
                      {body}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                href="/calculator"
                data-testid="companion-cta"
                className="t2q-btn-primary"
              >
                See how it links up <ArrowRight size={18} weight="bold" />
              </Link>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
                In beta · not on the App Store yet
              </p>
            </div>
          </div>

          {/* ── The proof ─────────────────────────────────────────────── */}
          <div className="relative grid grid-cols-2 gap-4 sm:gap-6">
            <PhoneShot
              src="/screens/t2qcal-tools.jpg"
              alt="T2QCAL calculator list showing a search across 94 construction calculators, with roof and rafter tools listed below"
              caption="94 calculators"
              className="mt-8"
            />
            <PhoneShot
              src="/screens/t2qcal-quote.jpg"
              alt="The Send to quote review sheet in T2QCAL, with the slab's order volume ticked and its net volume left unticked"
              caption="Straight to a draft"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PhoneShot({
  src,
  alt,
  caption,
  className = "",
}: {
  src: string;
  alt: string;
  caption: string;
  className?: string;
}) {
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.9)]">
        <Image
          src={src}
          alt={alt}
          width={717}
          height={1560}
          sizes="(min-width: 1024px) 22vw, 45vw"
          className="h-auto w-full"
        />
      </div>
      <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
        {caption}
      </figcaption>
    </figure>
  );
}
