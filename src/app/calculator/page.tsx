import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CheckSquare,
  Info,
  MagnifyingGlass,
  UserCircle,
  WifiSlash,
} from "@phosphor-icons/react/dist/ssr";
import { Footer } from "../_components/landing/Footer";
import { NativeAppRedirect } from "../_components/landing/NativeAppRedirect";
import { WaitlistForm } from "../_components/landing/WaitlistForm";
import { isNativeShellRequest } from "@/lib/native-shell";

export const metadata: Metadata = {
  title: "T2QCAL — the calculator that quotes",
  description:
    "A construction calculator for iPhone that signs in with your Tradies2Quote account. 94 calculators with live measured drawings, 74 trade manuals that read offline, and quantities that cross straight into a draft quote at your own markup and GST.",
  alternates: { canonical: "/calculator" },
  openGraph: {
    title: "T2QCAL — the calculator that quotes",
    description:
      "94 construction calculators, 74 trade manuals offline, and quantities that go straight into a Tradies2Quote draft. One account, both apps.",
    url: "/calculator",
  },
};

/**
 * `/calculator` — the companion app in full.
 *
 * Written to the same standard as the landing page: every number is counted
 * from T2QCAL's own source, every screenshot is a capture of the running app,
 * and the availability is stated rather than implied. There is no download to
 * offer yet, so the page takes an email instead of pretending otherwise.
 *
 * Guideline 3.1.3(f) / 2.5.2 — inside the iOS App Store shell this page must
 * not appear at all: it points at an iOS app that is not distributed through
 * the App Store. <NativeAppRedirect> bounces the shell back into the product,
 * and the landing's own link to here is withheld server-side.
 */

const TRADES = [
  { name: "Materials & quantities", count: 13 },
  { name: "Concrete & masonry", count: 11 },
  { name: "Roof & rafters", count: 10 },
  { name: "Centers & spacing", count: 10 },
  { name: "Convert & measure", count: 10 },
  { name: "Decks & fencing", count: 8 },
  { name: "Metal & tubing", count: 8 },
  { name: "Printable templates", count: 8 },
  { name: "General geometry", count: 8 },
  { name: "Stairs & balustrades", count: 6 },
  { name: "Drainage & spouting", count: 2 },
];

// Counted from T2QCAL/Models/Resources.swift, by publisher, exactly as the
// app attributes them. Sums to 74.
const PUBLISHERS = [
  { name: "MiTek NZ", count: 25 },
  { name: "James Hardie NZ", count: 14 },
  { name: "MBIE Building Performance", count: 10 },
  { name: "Winstone Wallboards (GIB)", count: 6 },
  { name: "Pryda NZ", count: 5 },
  { name: "CHH Woodproducts", count: 3 },
  { name: "Concrete NZ", count: 3 },
  { name: "WorkSafe NZ", count: 3 },
  { name: "Firth", count: 1 },
  { name: "MBIE Building CodeHub", count: 1 },
  { name: "MBIE, Standards NZ & BRANZ", count: 1 },
  { name: "NZ Metal Roofing Manufacturers", count: 1 },
  { name: "Standards New Zealand", count: 1 },
];

const HONEST = [
  {
    q: "What does it cost?",
    a: "Nothing on top of Tradies2Quote. It's part of the same account, not a second subscription.",
  },
  {
    q: "Do I need an account to use the calculators?",
    a: "No. Every calculator and the whole manual shelf work signed out. The account is only what ties a quantity to your quote list.",
  },
  {
    q: "Android?",
    a: "Yes. Open the T2QCAL web app on Android, iPhone, tablet or desktop. You can add it to your Home Screen separately from Tradies2Quote. The native iPhone companion is still awaiting App Store distribution.",
  },
  {
    q: "Does it store the manuals?",
    a: "It fetches each one from the publisher's own address onto your phone and keeps it for offline reading. They stay the publisher's files, and pulling one again gets whatever they're currently issuing — which for a span table is the difference that matters.",
  },
];

export default async function CalculatorPage() {
  const nativeShell = await isNativeShellRequest();
  // Withheld server-side, not merely hidden: inside the App Store binary this
  // page must not exist in the served HTML at all. <NativeAppRedirect> below
  // stays as defence-in-depth for shells built before the UA marker existed.
  if (nativeShell) redirect("/app");

  return (
    <div className="studio-public studio-calculator-page min-h-screen text-white">
      <NativeAppRedirect />

      {/* Slim brand bar — same shell as /install */}
      <header className="border-b border-ink-600">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="inline-flex rounded-md bg-[#0A0A0A] p-1">
              <Image
                src="/logo-mark.png"
                alt="Tradies2Quote"
                width={32}
                height={32}
                className="rounded-sm"
              />
            </span>
            <span className="font-display text-sm uppercase tracking-tight">
              tradies<span className="text-brand">2</span>quote
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:text-brand"
          >
            <ArrowLeft size={13} weight="bold" />
            Back to site
          </Link>
        </div>
      </header>

      <main>
        {/* ── What it is ──────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-ink-600 bg-ink-950 py-16 md:py-24">
          <div className="t2q-grid-bg pointer-events-none absolute inset-0 opacity-25" />
          <div className="pointer-events-none absolute -left-24 top-0 h-[380px] w-[380px] rounded-full bg-brand/10 blur-3xl" />

          <div className="relative mx-auto grid max-w-5xl gap-12 px-5 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div>
              <div className="t2q-section-label mb-4">
                {"// the companion app"}
              </div>
              {/* Sized so "the calculator" holds one line in this column —
                  at 6xl it broke after "the", which read as a stutter. */}
              <h1 className="font-display text-4xl uppercase leading-[0.95] tracking-tighter sm:text-5xl">
                <span className="text-white">T</span>
                <span className="text-brand">2</span>
                <span className="text-white">Q</span>
                <span className="text-hivis">CAL</span>
                <br />
                the calculator <br />
                <span className="text-brand">that quotes.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-200">
                Ninety-four construction calculators for iPhone, each drawing the
                job as you type it. It signs in with your Tradies2Quote account,
                so a quantity worked out standing in the trench goes onto your
                quote list before you&apos;ve got back to the ute.
              </p>
              <p className="mt-4 max-w-lg leading-relaxed text-ink-300">
                The manuals you&apos;d otherwise be googling — GIB, MiTek, James
                Hardie, Pryda, Concrete NZ — sit on the phone and read with no
                signal.
              </p>
              <a
                href="/t2qcal"
                className="t2q-btn-primary mt-8 inline-flex"
                data-testid="calculator-hero-cta"
              >
                Open T2QCAL web app <ArrowRight size={18} weight="bold" />
              </a>
            </div>

            <Shot
              src="/screens/t2qcal-drawing.jpg"
              alt="The straight stairs calculator in T2QCAL, drawing a stringer in section with the floor opening, headroom and pitch dimensioned"
              caption="Straight stairs · measured view"
            />
          </div>
        </section>

        {/* ── One account, two apps ───────────────────────────────────── */}
        <section className="border-b border-ink-600 bg-ink-900 py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-5">
            <Header
              label="// one account"
              lead="Same login."
              accent="Same rates."
            />
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-200">
              There is no second sign-up. T2QCAL authenticates against the same
              server Tradies2Quote does, so your email and password work in both
              — and your labour rate, markup, GST rate and currency are read from
              the same profile the website prices from. Change your markup in
              settings and the calculator quotes at the new one next time you
              open it. The two cannot drift apart, because there is only one
              copy.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <Card
                icon={UserCircle}
                title="Sign in once"
                body="Your Tradies2Quote email and password. No separate account, no extra subscription."
              />
              <Card
                icon={CheckSquare}
                title="Your own numbers"
                body="Markup, GST rate, tax label and currency come off your profile — not a default someone else picked."
              />
              <Card
                icon={Info}
                title="Signed out still works"
                body="Every calculator and the whole manual shelf run without an account. Signing in is only for sending a quote."
              />
            </div>
          </div>
        </section>

        {/* ── Measure → quote ─────────────────────────────────────────── */}
        <section className="border-b border-ink-600 bg-ink-800 py-16 md:py-24">
          <div className="mx-auto grid max-w-5xl gap-12 px-5 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <Shot
              src="/screens/t2qcal-quote.jpg"
              alt="The review sheet before sending: the concrete slab's order volume ticked at 2.592 cubic metres, with net volume and plan area left unticked"
              caption="The last look before it becomes a quote"
            />

            <div>
              <Header
                label="// measure → quote"
                lead="Measured."
                accent="Not guessed."
              />
              <p className="mt-5 text-lg leading-relaxed text-ink-200">
                Work out the slab, tap <em>Send to a quote</em>, and the
                quantities go across as a draft on your quote list — described,
                measured and priced at your markup and your GST. Open it in
                Tradies2Quote to add labour, pick the client and send it.
              </p>
              <ul className="mt-7 space-y-4">
                <Point title="Nothing goes across unseen">
                  Every quantity is listed with a tick and every figure stays
                  editable. You approve the list, not a black box.
                </Point>
                <Point title="It won't count the same concrete twice">
                  On a slab, &ldquo;order volume&rdquo; is ticked and the
                  &ldquo;net volume&rdquo; beside it isn&apos;t — they&apos;re
                  the same pour, once with waste and once without. Cut lengths
                  start unticked too: a rafter length is something you cut to,
                  not something you order.
                </Point>
                <Point title="It won't re-ask what you just measured">
                  The lines are marked as calculated, which is the flag
                  Tradies2Quote uses to tell a measured quantity from an
                  AI-guessed one. It doesn&apos;t make you confirm them again.
                </Point>
              </ul>
            </div>
          </div>
        </section>

        {/* ── 94 calculators ──────────────────────────────────────────── */}
        <section className="border-b border-ink-600 bg-ink-900 py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-5">
            <Header
              label="// the tools"
              lead="94 calculators."
              accent="Every one draws."
            />
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-200">
              Not a list of formulas — each tool draws the thing you&apos;re
              building as you type: a measured sheet with the dimensions on it,
              a set-out detail, and a 3D assembly of the actual job. A rafter
              calculator draws the birdsmouth. A stair calculator draws the
              stringer.
            </p>

            <ul
              data-testid="calculator-trades"
              className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {TRADES.map(({ name, count }) => (
                <li
                  key={name}
                  className="flex items-baseline justify-between gap-3 rounded-sm border border-ink-600 bg-ink-800/70 px-4 py-3"
                >
                  <span className="text-ink-100">{name}</span>
                  <span className="font-mono text-sm text-brand">{count}</span>
                </li>
              ))}
            </ul>

            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
              Metric and imperial throughout · 92 of the 94 produce something you
              can put on a quote
            </p>
          </div>
        </section>

        {/* ── The books ───────────────────────────────────────────────── */}
        <section className="border-b border-ink-600 bg-ink-800 py-16 md:py-24">
          <div className="mx-auto grid max-w-5xl gap-12 px-5 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div>
              <Header
                label="// the shelf"
                lead="74 manuals."
                accent="No signal needed."
              />
              <p className="mt-5 text-lg leading-relaxed text-ink-200">
                Span tables, fixing schedules, bracing ratings, wet-area details
                — pulled down once over wifi and readable in a subfloor, a
                stairwell or a valley with no reception. Searchable, with the
                page count and match counter right there. The Building Code
                clauses are on the shelf too, linked rather than stored, because
                MBIE will not serve the files to an app.
              </p>

              <ul
                data-testid="calculator-publishers"
                className="mt-8 flex flex-wrap gap-2"
              >
                {PUBLISHERS.map(({ name, count }) => (
                  <li
                    key={name}
                    className="rounded-sm border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm text-ink-100"
                  >
                    {name}{" "}
                    <span className="font-mono text-xs text-ink-400">
                      ×{count}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <Card
                  icon={WifiSlash}
                  title="62 download directly"
                  body="The other 12 sit behind a bot check or a free registration, so the app opens the publisher's page rather than quietly saving an error page."
                />
                <Card
                  icon={BookOpenText}
                  title="Always the current issue"
                  body="Nothing is bundled into the app. Pull a manual again and you get whatever the publisher is issuing today."
                />
              </div>
            </div>

            <Shot
              src="/screens/t2qcal-manual.jpg"
              alt="The MiTek lintel fixing schedule open in T2QCAL, showing the selection chart for lintel fixing against NZS 3604:2011"
              caption="MiTek lintel schedule · opened at “lintel”"
            />
          </div>
        </section>

        {/* ── What the book says ──────────────────────────────────────── */}
        <section className="border-b border-ink-600 bg-ink-900 py-16 md:py-24">
          <div className="mx-auto grid max-w-5xl gap-12 px-5 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <Shot
              src="/screens/t2qcal-clause.jpg"
              alt="The what the book says section under the stairs calculator, linking to D1 Access routes, F4 Safety from falling and the MiTek stair tread bracket sheet"
              caption="Under every calculator that has a rule"
            />

            <div>
              <Header
                label="// what the book says"
                lead="The number,"
                accent="and the clause behind it."
              />
              <p className="mt-5 text-lg leading-relaxed text-ink-200">
                76 of the 94 calculators carry a link to the rule that governs
                them, and it opens the manual{" "}
                <em>at the right search term</em> — not the front cover, and not
                a search box on a website.
              </p>
              <p className="mt-4 leading-relaxed text-ink-300">
                Set out joists and the GIB Site Guide opens at &ldquo;fixing
                centres&rdquo;; pour a slab and the CCANZ guide opens at
                &ldquo;slab&rdquo;. Work out a flight of stairs and MiTek&apos;s
                stair tread bracket sheet opens at &ldquo;tread&rdquo;, with D1
                Access routes and F4 Safety from falling listed beside it —
                those two go to MBIE&apos;s own page, because the Building Code
                site blocks downloads and the app says so rather than saving you
                an error page.
              </p>
              <p className="mt-4 leading-relaxed text-ink-300">
                The eighteen calculators that carry nothing are the ten
                converters and the eight printable templates. No clause governs a
                millimetres-to-inches conversion, and padding it with a
                plausible-looking reference would be worse than saying nothing.
              </p>
              <p className="mt-6 flex items-start gap-2.5 text-sm text-ink-400">
                <MagnifyingGlass
                  size={18}
                  weight="bold"
                  className="mt-0.5 shrink-0 text-brand"
                />
                Every one of those references is checked automatically against
                the library, so a link can&apos;t rot into a dead end.
              </p>
            </div>
          </div>
        </section>

        {/* ── Availability + waitlist ─────────────────────────────────── */}
        <section
          id="waitlist"
          className="relative overflow-hidden border-b border-ink-600 bg-ink-950 py-16 md:py-24"
        >
          <div className="pointer-events-none absolute -top-24 left-1/2 h-[320px] w-[560px] -translate-x-1/2 rounded-full bg-brand/12 blur-3xl" />

          <div className="relative mx-auto max-w-3xl px-5">
            <div className="rounded-lg border-2 border-brand bg-ink-900/95 p-7 shadow-[0_26px_70px_-36px_rgba(255,95,21,0.65)] md:p-10">
              <div className="t2q-section-label mb-4">{"// where it's at"}</div>
              <h2 className="font-display text-3xl uppercase leading-[0.98] tracking-tighter sm:text-4xl">
                Built and working. <br />
                <span className="text-brand">Not on the App Store yet.</span>
              </h2>
              <p className="mt-5 leading-relaxed text-ink-200">
                Use the T2QCAL web app now and add it to your Home Screen.
                The native iPhone app, including its offline manual shelf and
                device features, is awaiting App Store distribution. Leave your
                email for a message when the native app becomes available.
              </p>

              <div className="mt-8">
                <WaitlistForm source="calculator" />
              </div>
            </div>

            <dl className="mt-12 grid gap-6 sm:grid-cols-2">
              {HONEST.map(({ q, a }) => (
                <div key={q}>
                  <dt className="font-display text-lg uppercase tracking-tight text-white">
                    {q}
                  </dt>
                  <dd className="mt-2 leading-relaxed text-ink-300">{a}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-12 text-center text-sm text-ink-400">
              Already quoting with us?{" "}
              <Link href="/app" className="text-brand hover:underline">
                Open Tradies2Quote
              </Link>
              {" · "}
              <Link href="/" className="text-brand hover:underline">
                Back to the site
              </Link>
            </p>
          </div>
        </section>
      </main>

      <Footer hidePricingLinks={nativeShell} />
    </div>
  );
}

/* ── Small pieces ─────────────────────────────────────────────────────── */

function Header({
  label,
  lead,
  accent,
}: {
  label: string;
  lead: string;
  accent: string;
}) {
  return (
    <>
      <div className="t2q-section-label mb-4">{label}</div>
      <h2 className="font-display text-3xl uppercase leading-[0.98] tracking-tighter sm:text-4xl lg:text-5xl">
        {lead} <br />
        <span className="text-brand">{accent}</span>
      </h2>
    </>
  );
}

function Card({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ size?: number; weight?: "bold"; className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-ink-900/70 p-5">
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg border border-brand/35 bg-brand/10">
        <Icon size={18} weight="bold" className="text-brand" />
      </div>
      <h3 className="font-display text-lg uppercase tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-200">{body}</p>
    </div>
  );
}

function Point({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="border-l-2 border-brand/50 pl-4">
      <p className="font-display text-lg uppercase tracking-tight text-white">
        {title}
      </p>
      <p className="mt-1.5 leading-relaxed text-ink-300">{children}</p>
    </li>
  );
}

function Shot({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure>
      <div className="mx-auto max-w-[300px] overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.9)] md:max-w-none">
        <Image
          src={src}
          alt={alt}
          width={717}
          height={1560}
          sizes="(min-width: 768px) 34vw, 300px"
          className="h-auto w-full"
        />
      </div>
      <figcaption className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400 md:text-left">
        {caption}
      </figcaption>
    </figure>
  );
}
