import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";
import { LegalSection } from "../_components/LegalSection";
import { isNativeShellRequest } from "@/lib/native-shell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The agreement between you and ${LEGAL.companyName} when you use ${LEGAL.productName}.`,
  alternates: { canonical: "/terms" },
};

const SECTIONS = [
  { id: "agreement", label: "The agreement" },
  { id: "the-service", label: "The service" },
  { id: "your-account", label: "Your account" },
  { id: "trial", label: "Free trial" },
  { id: "billing", label: "Plans & billing" },
  { id: "cancellation", label: "Cancellation & refunds" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "your-content", label: "Your content" },
  { id: "ai-output", label: "AI-generated quotes" },
  { id: "our-ip", label: "Our intellectual property" },
  { id: "availability", label: "Service availability" },
  { id: "termination", label: "Suspension & termination" },
  { id: "disclaimer", label: "Disclaimer" },
  { id: "liability", label: "Limitation of liability" },
  { id: "indemnity", label: "Indemnity" },
  { id: "ios", label: "If you use the iOS app" },
  { id: "law", label: "Governing law" },
  { id: "changes", label: "Changes to these terms" },
  { id: "contact", label: "Contact" },
];

/**
 * Withheld inside the iPhone app (decided on the server): the free trial and
 * paid-plan sections (App Store 3.1.3(f): the app is free and never offers
 * plans). They still apply, and still show, on the website, where plans are
 * taken up. Section numbers follow what is shown.
 */
const HIDDEN_IN_APP: ReadonlySet<string> = new Set(["trial", "billing", "cancellation"]);

export default async function TermsPage() {
  const inApp = await isNativeShellRequest();
  const sections = inApp ? SECTIONS.filter((s) => !HIDDEN_IN_APP.has(s.id)) : SECTIONS;
  const num = (id: string) => String(sections.findIndex((s) => s.id === id) + 1).padStart(2, "0");
  return (
    <article className="bg-ink-900">
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-16 md:py-24">
        <div className="t2q-section-label-pro mb-4">{"// legal · terms"}</div>
        <h1 className="font-display text-4xl sm:text-5xl uppercase tracking-tight text-white">
          Terms of <span className="text-brand">Service</span>
        </h1>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
          Last updated {LEGAL.lastUpdatedDisplay}
        </p>

        <div className="mt-10 rounded-md border border-ink-600 bg-ink-800 p-6">
          <div className="font-mono text-xs uppercase tracking-[0.25em] text-brand mb-3">
            {"// the short version"}
          </div>
          <p className="text-ink-100 leading-relaxed">
            Use {LEGAL.productName} to write quotes faster. Review every
            quote before you send it — AI helps but you are the qualified
            tradie.{inApp ? "" : " Cancel any time."} Don&apos;t use the service to break
            the law. Standard stuff.
          </p>
        </div>

        <nav aria-label="On this page" className="mt-10">
          <div className="font-mono text-xs uppercase tracking-[0.25em] text-ink-500 mb-3">
            On this page
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-ink-300 list-decimal pl-5">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:text-brand">
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <LegalSection id="agreement" number={num("agreement")} title="The agreement">
          <p>
            These terms form a binding agreement between you and{" "}
            <strong>{LEGAL.companyName}</strong>
            {LEGAL.nzbn ? <> (NZBN {LEGAL.nzbn})</> : null}, based in{" "}
            {LEGAL.address}. By creating an account or using{" "}
            {LEGAL.productName}, you accept these terms. If you do not
            agree, do not use the service.
          </p>
          <p>
            You must be at least 18 years old and using {LEGAL.productName}{" "}
            for a legitimate trade business (sole trader or registered
            company).
          </p>
        </LegalSection>

        <LegalSection id="the-service" number={num("the-service")} title="The service">
          <p>
            {LEGAL.productName} is a voice-first quoting and invoicing
            tool for tradespeople. You record a voice memo describing a
            job, the service transcribes it, generates a structured quote
            with line items and pricing, and renders a branded PDF you can
            send to your client.
          </p>
          <p>
            The product is in active development. Features will be added
            and refined. We may change, suspend, or remove specific
            features with reasonable notice.
          </p>
        </LegalSection>

        <LegalSection id="your-account" number={num("your-account")} title="Your account">
          <p>
            You are responsible for the security of your account. Keep
            your password private. Tell us straight away if you think
            someone else has accessed your account.
          </p>
          <p>
            You are responsible for everything that happens under your
            account, including any users you invite to your crew.
          </p>
        </LegalSection>

        {inApp ? null : (
          <>
            <LegalSection id="trial" number={num("trial")} title="Free trial">
              <p>
                New accounts get a 7-day free trial. We do not ask for a
                credit card up front to start your trial. When the trial ends,
                you choose whether to subscribe — there is no automatic charge
                without your explicit consent.
              </p>
            </LegalSection>

            <LegalSection id="billing" number={num("billing")} title="Plans & billing">
              <p>
                Paid plans are billed monthly in advance. The price shown on
                our pricing page is the price you pay, in New Zealand dollars
                and inclusive of GST.
              </p>
              <p>
                Subscriptions <strong>auto-renew</strong> at the start of each
                billing period until you cancel. We send a receipt by email
                after every successful payment. If a payment fails, we will
                retry for up to 7 days and then pause your account.
              </p>
              <p>
                We may change pricing from time to time. If we change the
                price of your current plan, we will tell you by email at least
                30 days before the new price applies. You can cancel before
                the new price takes effect.
              </p>
            </LegalSection>

            <LegalSection
              id="cancellation"
              number={num("cancellation")}
              title="Cancellation & refunds"
            >
              <p>
                You can cancel at any time by emailing{" "}
                <a href={`mailto:${LEGAL.supportEmail}`}>
                  {LEGAL.supportEmail}
                </a>{" "}
                from the address on your account. Cancellation takes effect
                at the end of your current billing period — you keep access
                until then.
              </p>
              <p>
                <strong>Refunds.</strong> If you are in the United Kingdom or
                European Union, you have the statutory right to cancel within
                14 days of your first paid charge and receive a full refund.
                Outside that period, we do not offer pro-rata refunds for
                partial months, but we will always consider individual
                requests in good faith.
              </p>
            </LegalSection>
          </>
        )}

        <LegalSection
          id="acceptable-use"
          number={num("acceptable-use")}
          title="Acceptable use"
        >
          <p>You agree not to:</p>
          <ul>
            <li>
              Use the service for any illegal, fraudulent, or harmful
              purpose.
            </li>
            <li>
              Send quotes or invoices for work you are not licensed or
              qualified to do, where licensing is required.
            </li>
            <li>
              Impersonate another person or business, or send quotes
              under a business name you are not entitled to use.
            </li>
            <li>
              Upload audio that contains personal information of people
              who have not consented to be recorded.
            </li>
            <li>
              Probe, scrape, or attempt to bypass our security or
              rate-limits.
            </li>
            <li>
              Resell, sublicense, or white-label the service without our
              written agreement.
            </li>
          </ul>
          <p>
            <strong>Zero tolerance for objectionable content and abuse.</strong>{" "}
            Content you (or your clients, in the quote chat) submit must not
            contain hate speech, harassment, threats, sexual content, or
            other objectionable material. Chat messages are screened by an
            automated content filter, every chat carries a{" "}
            <strong>Report</strong> control (and tradies can turn a
            quote&apos;s chat off entirely), and we review reports within 24
            hours. We may remove content, disable a chat, or suspend or
            terminate an account that breaches this clause, without notice.
          </p>
        </LegalSection>

        <LegalSection id="your-content" number={num("your-content")} title="Your content">
          <p>
            You own your content — your voice recordings, your transcripts,
            your quotes, your client list, your business branding. We
            claim no ownership over any of it.
          </p>
          <p>
            You grant us a limited licence to host, process, and transmit
            your content for the sole purpose of running the service for
            you. That licence ends when you delete the content or close
            your account.
          </p>
        </LegalSection>

        <LegalSection
          id="ai-output"
          number={num("ai-output")}
          title="AI-generated quotes"
        >
          <p>
            {LEGAL.productName} uses third-party AI models (currently
            OpenAI and Anthropic Claude) throughout the product: voice
            memos are transcribed and turned into structured quotes, plan
            and site photos are read for dimensions and materials, and
            the chat on your client&apos;s quote page is answered by an
            AI assistant acting on your behalf (it cannot change pricing,
            and its replies pass through an automated content filter).
            AI can and does make mistakes.
          </p>
          <p>
            <strong>
              You are the qualified tradie. You are responsible for
              reviewing every quote before you send it to a client.
            </strong>{" "}
            That includes scope, materials, quantities, pricing, GST
            calculations, and any safety or compliance language. We are
            not liable for losses caused by an unchecked AI-generated
            quote that turns out to be wrong.
          </p>
        </LegalSection>

        <LegalSection
          id="our-ip"
          number={num("our-ip")}
          title="Our intellectual property"
        >
          <p>
            The {LEGAL.productName} software, brand, templates, and
            documentation are owned by {LEGAL.companyName}. Using the
            service does not give you any right to copy, modify, or
            redistribute them.
          </p>
        </LegalSection>

        <LegalSection
          id="availability"
          number={num("availability")}
          title="Service availability"
        >
          <p>
            We aim to keep {LEGAL.productName} available 24/7 but cannot
            guarantee uninterrupted access. Outages can happen because of
            maintenance, third-party provider failures, or events beyond
            our reasonable control. We do not offer a formal uptime
            SLA{inApp ? "." : " on current plans."}
          </p>
        </LegalSection>

        <LegalSection
          id="termination"
          number={num("termination")}
          title="Suspension & termination"
        >
          <p>
            We may suspend or close your account if you breach these
            terms, fail to pay, or use the service in a way that risks
            harm to us or other users. Where reasonable, we will warn you
            first.
          </p>
          <p>
            You can close your account at any time by emailing{" "}
            <a href={`mailto:${LEGAL.privacyEmail}`}>
              {LEGAL.privacyEmail}
            </a>{" "}
            from the address on your account. On closure we delete your
            personal information as described in our{" "}
            <a href="/privacy">Privacy Policy</a>.
          </p>
        </LegalSection>

        <LegalSection id="disclaimer" number={num("disclaimer")} title="Disclaimer">
          <p>
            To the extent permitted by law, {LEGAL.productName} is
            provided <strong>&ldquo;as is&rdquo;</strong> and{" "}
            <strong>&ldquo;as available&rdquo;</strong>. We make no
            warranties or guarantees, express or implied, that the service
            will be error-free, secure, or fit for any particular purpose.
          </p>
          <p>
            <strong>Consumer rights.</strong> Nothing in these terms
            excludes the rights you have under the New Zealand Consumer
            Guarantees Act 1993, the UK Consumer Rights Act 2015, or any
            other consumer protection law that applies to you and cannot
            lawfully be excluded.
          </p>
        </LegalSection>

        <LegalSection
          id="liability"
          number={num("liability")}
          title="Limitation of liability"
        >
          <p>
            To the maximum extent permitted by law:
          </p>
          <ul>
            <li>
              We are not liable for indirect, incidental, consequential,
              or punitive losses, or for lost profits or lost business
              opportunities.
            </li>
            <li>
              Our total liability for any claim arising out of or
              relating to these terms or the service is capped at the
              total fees you have paid us in the 12 months immediately
              before the event giving rise to the claim, or NZ$100,
              whichever is greater.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="indemnity" number={num("indemnity")} title="Indemnity">
          <p>
            You agree to indemnify {LEGAL.companyName} against any claim
            brought by a third party arising from your use of the service
            in breach of these terms — for example, a client claiming
            harm caused by a quote you sent them without review.
          </p>
        </LegalSection>

        <LegalSection id="ios" number={num("ios")} title="If you use the iOS app">
          <p>
            If you download {LEGAL.productName} from the Apple App Store,
            you also agree to Apple&apos;s Licensed Application End User
            Licence Agreement (the standard EULA). Where these terms
            differ from Apple&apos;s EULA, these terms apply between you
            and us; Apple&apos;s EULA applies between you and Apple.
          </p>
          <p>
            Apple is not responsible for the {LEGAL.productName} service,
            its content, or any support related to it. Apple is a
            third-party beneficiary of these terms and may enforce them
            against you.
          </p>
        </LegalSection>

        <LegalSection id="law" number={num("law")} title="Governing law">
          <p>
            These terms are governed by the laws of New Zealand. You
            agree the New Zealand courts have exclusive jurisdiction over
            any dispute, unless mandatory consumer-protection law in your
            country says otherwise.
          </p>
        </LegalSection>

        <LegalSection
          id="changes"
          number={num("changes")}
          title="Changes to these terms"
        >
          <p>
            We may update these terms from time to time. If we make a
            material change, we will notify you by email and inside the
            app at least 14 days before the change takes effect. If you
            keep using the service after that, you accept the updated
            terms. If you do not agree, you can cancel.
          </p>
        </LegalSection>

        <LegalSection id="contact" number={num("contact")} title="Contact">
          <p>
            Questions about these terms?
          </p>
          <ul>
            <li>
              Email{" "}
              <a href={`mailto:${LEGAL.supportEmail}`}>
                {LEGAL.supportEmail}
              </a>
            </li>
            <li>Post: {LEGAL.companyName}, {LEGAL.address}</li>
          </ul>
        </LegalSection>
      </div>
    </article>
  );
}
