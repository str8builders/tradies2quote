import Link from "next/link";
import type { Metadata } from "next";
import {
  CaretDown,
  EnvelopeSimple,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";
import { HideInNativeApp } from "@/app/_components/HideInNativeApp";
import { isNativeShellRequest } from "@/lib/native-shell";

/**
 * Public Help / FAQ page — answers the questions tradies actually
 * ask in the first 7 days. Lives at /help (no auth gate) so it's
 * linkable from outside the app, from emails, from a "Need help?"
 * footer link, and reachable when someone is locked out.
 *
 * Wrapped in `data-theme="dark"` so it picks up the same Xero-style
 * cream/white tokens as the in-app surface, even though it's outside
 * the `[data-shell="app"]` boundary.
 */
// The description is in the HTML too, so the iPhone app's copy leaves out
// "Trial, billing" like the page itself does (3.1.3(f)).
export async function generateMetadata(): Promise<Metadata> {
  const nativeShell = await isNativeShellRequest();
  return {
    title: "Help & FAQ — Tradies2Quote",
    description: nativeShell
      ? "Answers to common questions about Tradies2Quote — the voice-first AI quoting app for tradies. Sending quotes, the materials library."
      : "Answers to common questions about Tradies2Quote — the voice-first AI quoting app for tradies. Trial, billing, sending quotes, the materials library.",
  };
}

const SUPPORT_EMAIL = "support@tradies2quote.com";

// `billing: true` entries carry pricing / subscription mechanics. They are
// wrapped in <HideInNativeApp> below — Guideline 3.1.3(f) forbids ANY
// pricing or purchase-steering copy inside the iOS binary, and /help is
// reachable in the shell from the account menu.
const FAQS: ReadonlyArray<{ q: string; a: React.ReactNode; billing?: boolean }> = [
  {
    billing: true,
    q: "How does the 7-day free trial work?",
    a: (
      <>
        Every new account gets <strong>7 days of full access</strong> the moment
        you sign up — no card needed up front. You can record voice quotes,
        scan drawings, send to clients, and use every feature. Once the 7 days
        are up, the app goes read-only (you can still view + download your
        existing quotes) unless you start a subscription.
      </>
    ),
  },
  {
    billing: true,
    q: "What happens after the trial?",
    a: (
      <>
        Your account drops to read-only — you can still log in, view your past
        quotes, and download PDFs your clients accepted. To keep recording new
        quotes you subscribe to{" "}
        <strong>NZD $49 / month (GST inclusive)</strong> from the Upgrade page
        in your account menu. Cancel any time directly from your Stripe
        customer portal — no lock-in.
      </>
    ),
  },
  {
    q: "How do I record my first quote?",
    a: (
      <>
        Tap <strong>New</strong> in the bottom navigation bar. You
        get three tabs: <strong>Voice</strong> (record up to 3 minutes
        describing the job), <strong>Type</strong> (free-form text), and{" "}
        <strong>Scan</strong> (photograph a hand-drawn plan). Hit record →
        describe the job out loud as if explaining to a junior →
        Tradies2Quote turns it into a draft quote you can edit before sending.
      </>
    ),
  },
  {
    q: "Why are all the prices blank in my new quotes?",
    a: (
      <>
        This is deliberate. Tradies2Quote does <strong>not</strong>{" "}
        guess prices for you — AI-generated unit prices have been turned off so
        we never send a customer a number the AI made up. Every material starts
        with a <em>&ldquo;Needs price&rdquo;</em> badge and you fill in your real
        prices. Once you set them in the{" "}
        <Link href="/app/materials" className="text-brand hover:underline">
          Materials library
        </Link>
        , future quotes auto-fill from your library — no more re-typing the
        same numbers. We&apos;re also working on direct ITM and Mitre 10
        connections so prices auto-pull from your suppliers.
      </>
    ),
  },
  {
    q: "How do I add my materials and prices to the library?",
    a: (
      <>
        Three ways:{" "}
        <strong>
          <Link
            href="/app/materials/quick-start"
            className="text-brand hover:underline"
          >
            Quick start
          </Link>
        </strong>{" "}
        (60-second flow that asks for your 5-10 most-used materials),{" "}
        <strong>
          <Link
            href="/app/materials/import-quote"
            className="text-brand hover:underline"
          >
            Import a supplier quote
          </Link>
        </strong>{" "}
        (snap a photo of any ITM / Bunnings / Mitre 10 quote PDF and we pull
        every line into your library at the supplier&apos;s real prices), or{" "}
        <strong>
          <Link href="/app/materials/new" className="text-brand hover:underline">
            Add manually
          </Link>
        </strong>{" "}
        one at a time. After a few weeks of normal use your library will cover
        most jobs.
      </>
    ),
  },
  {
    q: "How does the AI know what materials to add to a quote?",
    a: (
      <>
        It listens to what you describe and matches it against:{" "}
        <strong>(1)</strong> the materials you&apos;ve added to your own
        library, <strong>(2)</strong> NZ building takeoff rules (deck framing,
        cladding, GIB, insulation, etc. with H3.2 / 90×45 / R-values sized
        correctly), and <strong>(3)</strong> compliance flags from the NZ
        Building Code. Whatever can&apos;t be matched is flagged as &quot;needs
        review&quot; so nothing slips through without your eyes on it.
      </>
    ),
  },
  {
    q: "How do I send a quote to a client?",
    a: (
      <>
        Once you&apos;ve reviewed the quote, hit the orange{" "}
        <strong>Email</strong> button at the bottom. We generate a PDF
        (branded with your business name from{" "}
        <Link href="/app/settings" className="text-brand hover:underline">
          Settings
        </Link>
        ), email it to the client, and give them a one-click accept link. You
        can also use <strong>Text</strong> to send it via SMS — most NZ
        tradies get faster reply rates on text than email.
      </>
    ),
  },
  {
    q: "How does the client accept the quote?",
    a: (
      <>
        The email and SMS each contain a unique secure link. The client opens
        it on their phone, reviews the quote, types their name as a digital
        signature, and taps <strong>Accept</strong>. You get an instant
        notification + an email + the quote moves to{" "}
        <strong>&quot;Accepted&quot;</strong> in your dashboard. No app
        download needed for the client — it&apos;s just a web page.
      </>
    ),
  },
  {
    q: "Can I edit a quote after I've sent it?",
    a: (
      <>
        Yes — until the client accepts. Open the quote, make changes, hit{" "}
        <strong>Save</strong>, then hit <strong>Email</strong> again. The
        client gets a fresh link to the updated version. Once they&apos;ve
        accepted, the quote is locked (audit trail reasons — they signed off
        on a specific number).
      </>
    ),
  },
  {
    q: "I sent a quote but my client says they didn't get the email or text.",
    a: (
      <>
        First check the quote&apos;s status in your dashboard — if it says{" "}
        <strong>Sent</strong> we delivered it. Ask the client to check spam /
        junk and add{" "}
        <span className="rounded-sm bg-ink-100 px-1.5 py-0.5 font-mono text-xs">
          {SUPPORT_EMAIL}
        </span>{" "}
        to their contacts. If the status is <strong>Draft</strong>, you
        haven&apos;t actually sent it yet — open the quote and hit Email.
        Still stuck? Email me at the address below with the quote number and
        I&apos;ll re-send manually from my end.
      </>
    ),
  },
  {
    q: "Where do I see my paid invoices and accepted quotes?",
    a: (
      <>
        Open <strong>Quotes</strong> from the bottom navigation bar. Filter to{" "}
        <em>Accepted</em> to see signed quotes; filter to <em>Completed</em>{" "}
        to see jobs you&apos;ve finished. Invoicing (turning an accepted quote
        into a chase-able invoice) is on the roadmap for the second post-launch
        update.
      </>
    ),
  },
  {
    q: "The app is broken / I found a bug. What do I do?",
    a: (
      <>
        Email <strong>{SUPPORT_EMAIL}</strong> with: a one-line description of
        what happened, the quote number (if there is one), and ideally a
        screenshot. I read every email personally. During launch week I aim to
        respond same-day, weekends included. If the bug stops you from
        finishing a quote you need to send today, write{" "}
        <strong>&quot;URGENT&quot;</strong> in the subject line.
      </>
    ),
  },
];

export default async function HelpPage() {
  // 3.1.3(f) — /help is reachable in the iOS shell from the account menu, and
  // the `billing: true` FAQs carry pricing/subscription mechanics. Withhold
  // them SERVER-side so their answers never reach the binary's HTML; the
  // <HideInNativeApp> wrapper below stays as defence-in-depth for pre-marker
  // shells (which the server can't detect).
  const nativeShell = await isNativeShellRequest();
  const faqs = nativeShell ? FAQS.filter((f) => !f.billing) : FAQS;
  return (
    <div
      data-theme="dark"
      className="studio-public studio-help min-h-[100dvh] text-white"
    >
      <div className="mx-auto max-w-2xl px-5 pt-12 pb-20 sm:px-8 sm:pt-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-brand">
          {"// help & faq"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Need a hand?
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-300 sm:text-lg">
          Quick answers to the things tradies ask most in the first week.
          Can&apos;t find what you need? Email me direct.
        </p>

        {/* FAQs — native <details> for zero-JS expand/collapse */}
        <div className="mt-10 space-y-3">
          {faqs.map((faq, i) => {
            const item = (
              <details
                key={i}
                className="group overflow-hidden rounded-2xl border bg-ink-800/70 shadow-[0_1px_2px_rgba(10,10,10,0.04)] transition-shadow open:shadow-[0_4px_14px_rgba(10,10,10,0.06)]"
                style={{ borderColor: "rgba(255,255,255,.12)" }}
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <h2 className="text-base font-semibold text-white sm:text-lg">
                    {faq.q}
                  </h2>
                  <CaretDown
                    size={18}
                    weight="bold"
                    className="mt-1 shrink-0 text-ink-400 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div
                  className="border-t px-5 py-4 text-sm leading-relaxed text-ink-200 sm:text-base"
                  style={{ borderColor: "rgba(255,255,255,.08)" }}
                >
                  {faq.a}
                </div>
              </details>
            );
            // 3.1.3(f) — billing/pricing FAQs never render in the iOS shell.
            return faq.billing ? (
              <HideInNativeApp key={i}>{item}</HideInNativeApp>
            ) : (
              item
            );
          })}
        </div>

        {/* Contact card */}
        <section
          className="mt-10 rounded-2xl border bg-ink-800/70 p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04)] sm:p-8"
          style={{ borderColor: "rgba(255,255,255,.12)" }}
        >
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand text-white"
            >
              <EnvelopeSimple size={22} weight="bold" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-white sm:text-xl">
                Still stuck? Email me direct.
              </h2>
              <p className="mt-1 text-sm text-ink-300 sm:text-base">
                I&apos;m Challis — qualified builder, the bloke who built this
                app. I read every email myself. Same-day during launch week,
                weekends included.
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Tradies2Quote%20help`}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
              >
                <EnvelopeSimple size={16} weight="bold" />
                {SUPPORT_EMAIL}
              </a>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-300">
                Write &quot;URGENT&quot; in the subject if a bug is stopping
                you finishing a quote today.
              </p>
            </div>
          </div>
        </section>

        {/* Back link */}
        <div className="mt-10 flex items-center justify-between text-sm">
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 font-semibold text-brand hover:text-brand-700"
          >
            Back to the app
            <ArrowRight size={14} weight="bold" />
          </Link>
          {/* Not in the iPhone app: the website's homepage carries its
              trial offers (3.1.3(f)); "Back to the app" is the way out. */}
          {nativeShell ? null : (
            <Link
              href="/"
              className="text-ink-300 hover:text-white"
            >
              Tradies2Quote home →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
