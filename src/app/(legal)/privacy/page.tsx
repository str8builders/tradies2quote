import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";
import { LegalSection } from "../_components/LegalSection";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${LEGAL.productName} collects, uses, and protects your data. Built to NZ Privacy Act 2020 and UK/EU GDPR standards.`,
  alternates: { canonical: "/privacy" },
};

const SECTIONS = [
  { id: "who-we-are", label: "Who we are" },
  { id: "what-we-collect", label: "What we collect" },
  { id: "how-we-use", label: "How we use it" },
  { id: "voice-recordings", label: "Voice recordings" },
  { id: "service-providers", label: "Service providers" },
  { id: "where-stored", label: "Where data is stored" },
  { id: "retention", label: "How long we keep it" },
  { id: "your-rights", label: "Your rights" },
  { id: "cookies", label: "Cookies" },
  { id: "children", label: "Children" },
  { id: "security", label: "Security" },
  { id: "changes", label: "Changes to this policy" },
  { id: "contact", label: "Contact" },
];

const PRIVACY_LAST_UPDATED_DISPLAY = "21 September 2026";

export default function PrivacyPage() {
  return (
    <article className="bg-ink-900">
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-16 md:py-24">
        <div className="t2q-section-label-pro mb-4">{"// legal · privacy"}</div>
        <h1 className="font-display text-4xl sm:text-5xl uppercase tracking-tight text-white">
          Privacy <span className="text-brand">Policy</span>
        </h1>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
          Last updated {PRIVACY_LAST_UPDATED_DISPLAY}
        </p>

        <div className="mt-10 rounded-md border border-ink-600 bg-ink-800 p-6">
          <div className="font-mono text-xs uppercase tracking-[0.25em] text-brand mb-3">
            {"// the short version"}
          </div>
          <p className="text-ink-100 leading-relaxed">
            We collect the minimum we need to run {LEGAL.productName}: your
            account details, the quotes you create, and the voice memos you
            record to build them. We do not sell your data. We do not train
            AI models on it. You can ask us to delete your account and all
            personal content in Settings, or request help by emailing{" "}
            <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
          </p>
        </div>

        <nav aria-label="On this page" className="mt-10">
          <div className="font-mono text-xs uppercase tracking-[0.25em] text-ink-500 mb-3">
            On this page
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-ink-300 list-decimal pl-5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:text-brand">
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <LegalSection id="who-we-are" number="01" title="Who we are">
          <p>
            {LEGAL.productName} is operated by{" "}
            <strong>{LEGAL.companyName}</strong>
            {LEGAL.nzbn ? <> (NZBN {LEGAL.nzbn})</> : null}, based in{" "}
            {LEGAL.address}. In this policy, &ldquo;we&rdquo;,
            &ldquo;us&rdquo; and &ldquo;our&rdquo; refer to{" "}
            {LEGAL.companyName}. &ldquo;You&rdquo; means the tradie or
            business that signs up to use {LEGAL.productName}.
          </p>
          <p>
            We are the data controller for the personal information you give
            us. This policy explains what we collect, why we collect it, who
            we share it with, and the rights you have over it.
          </p>
          <p>
            This policy also covers T2QCAL, our separate construction calculator
            app. T2QCAL uses the same Tradies2Quote account when you choose to
            sign in.
          </p>
        </LegalSection>

        <LegalSection id="what-we-collect" number="02" title="What we collect">
          <p>We collect three kinds of information.</p>
          <p>
            <strong>1. Account information</strong> — your name, email
            address, business name, hashed password, country, and any
            branding (logo, business number, contact details) you choose to
            add for your quotes. If you save bank details or other payment
            instructions for your invoices, we store and print those instructions
            on the documents you choose to share.
          </p>
          <p>
            <strong>2. Job and quote content</strong> — the audio you record,
            the cleaned-up transcript of that audio, plan and site photos
            you scan, the line items and prices that go into each quote,
            the client contact details you save against a job, messages
            your clients send in the quote chat, and — if you use the
            weather feature — the job-site address or location you check.
            This is the working data of the product.
          </p>
          <p>
            <strong>3. Technical information</strong> — IP address, browser
            and device type, basic usage events (e.g. &ldquo;quote
            generated&rdquo;, &ldquo;PDF exported&rdquo;), and error logs.
            We use this to keep the service running and to spot problems.
          </p>
          <p>
            We do <strong>not</strong> collect payment card details
            ourselves. Website subscriptions use Stripe and iOS subscriptions use Apple.
            Your card details never reach our servers.
          </p>
          <p>
            <strong>T2QCAL on-device work</strong> — calculator inputs, drawings,
            saved jobs and room measurements are stored on your device. Saving a
            calculation locally does not send it to Tradies2Quote. When you
            choose to send selected work to your account, its job details,
            quantities, prices and calculation evidence are sent to our service.
            Optional voice and plan-reading features send the recording or image
            you select for processing, after AI consent. The provider disclosures
            below apply to those features too.
          </p>
          <p>
            PDFs imported into T2QCAL remain on your device, separate from the
            public reference-manual cache. Signed-in imports are shown only for
            the account that added them; signed-out imports stay in the device
            library. Older imports without an owner require a recovery choice.
            Importing a PDF does not upload it for AI processing.
          </p>
        </LegalSection>

        <LegalSection id="how-we-use" number="03" title="How we use it">
          <ul>
            <li>To create your account and let you sign in.</li>
            <li>
              To transcribe your voice memos and turn them into a quote.
            </li>
            <li>
              To generate, store, and deliver your quote and invoice PDFs.
            </li>
            <li>
              To send you transactional emails (sign-in links, password
              resets, your client&apos;s opened-quote notifications).
            </li>
            <li>
              To debug, monitor, and improve the service. We store account-linked
              quote edits and differences from generated drafts to assess quote
              quality. These records may include the quote content and client
              details, rather than only anonymous totals.
            </li>
            <li>
              To update your own materials library from corrections you make and
              retain account-specific preferences, such as materials, prices and
              markup. These records are kept with your account and are not used
              to train our own AI models.
            </li>
            <li>To detect, prevent, and respond to abuse or fraud.</li>
            <li>To comply with our legal obligations.</li>
          </ul>
          <p>
            We do not sell your personal information. We do not share it
            with advertisers. We do not use it to train our own AI models — see the
            next section for what happens to your voice memos.
          </p>
        </LegalSection>

        <LegalSection
          id="voice-recordings"
          number="04"
          title="Voice, photos & AI processing"
        >
          <p>
            When you allow AI processing, selected job information is sent to
            the providers below to prepare editable draft content. You can
            create quotes manually without enabling these features.
          </p>
          <ul>
            <li><strong>Descriptions and transcripts</strong> — Anthropic processes
              job text to prepare quotes, clean up transcripts and answer quote-chat questions.</li>
            <li><strong>Voice recordings</strong> — OpenAI transcribes your recording;
              the resulting text may then be processed by Anthropic to prepare a quote.</li>
            <li><strong>Drawings and supplier documents</strong> — Anthropic reads
              selected images. OpenAI analyses photos for enabled photo-assistance features.</li>
            <li><strong>Customer requests and chat</strong> — customers choose whether
              to allow AI processing before their content is sent to these providers.
              Requests can be submitted without AI. Chat is labelled as AI and is visible
              to the business receiving the quote request.</li>
          </ul>
          <p>
            These providers may process information overseas, including in the United States.
            We do not use your content to train our own AI models. External providers
            process content under their applicable business-service terms and retention policies.
            Review every result before relying on it. You can withdraw your permission
            for future AI requests in Settings; this does not undo processing already completed.
          </p>
          <p>
            Quote descriptions, transcripts and attachments are linked to your account.
            Account deletion removes their active copies. Limited billing records and
            backups are subject to the retention terms below.
          </p>
        </LegalSection>

        <LegalSection
          id="service-providers"
          number="05"
          title="Service providers"
        >
          <p>
            We use a small set of third-party providers to run the
            service. Each one only receives the data it needs to do its
            job.
          </p>
          <ul>
            <li>
              <strong>Contabo GmbH</strong> — infrastructure. The
              application and its database run on a virtual private
              server we operate ourselves, hosted in Contabo&apos;s data
              centre in Sydney, Australia. Your account data, quotes, clients, and
              uploaded images live on that server (we run the database
              and file storage software ourselves — no third-party
              database service holds your data).
            </li>
            <li>
              <strong>Anthropic</strong> — quote generation, transcript cleanup,
              customer quote chat, drawings and supplier-document analysis. Enabled
              features send the relevant job text or images to Anthropic for processing.
            </li>
            <li>
              <strong>OpenAI</strong> — voice transcription and enabled photo
              analysis. These features send the recording or selected image to OpenAI.
              Authenticated AI features require your current, affirmative consent;
              you can withdraw it in Settings.
            </li>
            <li>
              <strong>Open-Meteo</strong> — job-site weather. Receives
              the job-site address (to geocode it) and/or coordinates —
              including your device location if you tap &ldquo;use my
              location&rdquo; — and returns the forecast. No account
              identifiers are sent with it.
            </li>
            <li>
              <strong>Stripe</strong> — payment processing for paid plans
              (billed on our website) and, where a tradie enables it,
              client deposit payments. Handles billing details. We never
              see your card number.
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery.
              Sends sign-in links, quote and invoice emails to your
              clients, and account notifications.
            </li>
            <li>
              <strong>Apple</strong> — in-app subscriptions and push notifications on iOS.
              Apple processes the purchase; we receive transaction identifiers and
              subscription status to provide access. We do not receive your card details. If you
              turn notifications on in the iOS app, a device push token is
              stored and notifications are delivered through the Apple
              Push Notification service.
            </li>
          </ul>
          <p>
            When you share through your phone&apos;s Messages app, your mobile
            provider handles the message. If server SMS is enabled, Twilio receives
            the recipient number and message to deliver it. The sending screen
            identifies which method you are using.
          </p>
          <p>
            Error monitoring runs on our own server; crash and error
            reports are not sent to any third-party analytics service.
          </p>
          <p>
            Each of these providers is bound by their own privacy policy
            and by contractual data-processing terms with us.
          </p>
        </LegalSection>

        <LegalSection
          id="where-stored"
          number="06"
          title="Where data is stored"
        >
          <p>
            Your account data and quote content are stored on a server we
            operate, hosted by Contabo GmbH in <strong>Sydney, Australia</strong>. Backups live on the same infrastructure.
          </p>
          <p>
            Enabled AI features send relevant descriptions, transcripts, audio or
            images to Anthropic or OpenAI, whose processing may take place outside
            your country, including the United States.
            Weather lookups go to Open-Meteo in the EU; emails are delivered
            via Resend in the US.
          </p>
          <p>
            That means your personal information is transferred to and
            processed in countries outside New Zealand and the United
            Kingdom. We rely on the contractual safeguards our providers
            offer (including standard contractual clauses where required)
            to keep your data protected to a comparable standard.
          </p>
        </LegalSection>

        <LegalSection
          id="retention"
          number="07"
          title="How long we keep it"
        >
          <ul>
            <li>
              <strong>Active account data</strong> — we keep it for as long
              as your account is open.
            </li>
            <li>
              <strong>Deleted quotes</strong> — hidden from active lists and public
              sharing. Underlying records may remain until your account is deleted
              or the records are permanently purged.
            </li>
            <li>
              <strong>Closed accounts</strong> — we delete your personal
              information within 30 days of account closure. Routine
              backups holding a copy are overwritten within a further 30
              days.
            </li>
            <li>
              <strong>Aggregated usage metrics</strong> — we may keep
              de-identified statistics (e.g. &ldquo;quotes generated this
              month&rdquo;) indefinitely. These do not identify you.
            </li>
            <li>
              <strong>Records we are legally required to keep</strong> —
              billing transactions, including Apple transaction identifiers used to prevent
              duplicate or misassigned purchases, and similar records may be retained for the
              period required by NZ law (typically 7 years).
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="your-rights" number="08" title="Your rights">
          <p>
            Under the New Zealand Privacy Act 2020 and, where it applies
            to you, the UK GDPR / EU GDPR, you have the right to:
          </p>
          <ul>
            <li>
              <strong>Access</strong> — ask for a copy of the personal
              information we hold about you.
            </li>
            <li>
              <strong>Correct</strong> — ask us to fix information that
              is wrong or out of date.
            </li>
            <li>
              <strong>Delete</strong> — remove your personal information.
              You can delete your account and its data yourself, right now,
              in the app (Settings &rarr; Delete account) — this removes your
              data immediately. If you&apos;d rather we did it, email us from
              the address on your account and we&apos;ll action it within 20
              working days. Either way, copies in routine backups are
              overwritten within 30 days.
            </li>
            <li>
              <strong>Export</strong> — get a copy of your quotes and
              client data in a machine-readable format.
            </li>
            <li>
              <strong>Object</strong> — tell us to stop processing your
              information for a particular purpose.
            </li>
            <li>
              <strong>Complain</strong> — to the New Zealand Office of the
              Privacy Commissioner (privacy.org.nz) or, in the UK, the
              Information Commissioner&apos;s Office (ico.org.uk).
            </li>
          </ul>
          <p>
            To exercise any of these rights, email{" "}
            <a href={`mailto:${LEGAL.privacyEmail}`}>
              {LEGAL.privacyEmail}
            </a>
            . We respond within 20 working days.
          </p>
        </LegalSection>

        <LegalSection id="cookies" number="09" title="Cookies">
          <p>
            We use a small number of essential cookies. They keep you
            signed in, remember your theme preference, and protect against
            cross-site request forgery. Without them, the app cannot
            function.
          </p>
          <p>
            We do <strong>not</strong> use advertising cookies, tracking
            pixels, or third-party analytics that follow you around the
            web. If we add product-analytics in future (for example,
            anonymised usage measurement), we will update this policy
            before turning it on.
          </p>
        </LegalSection>

        <LegalSection id="children" number="10" title="Children">
          <p>
            {LEGAL.productName} is built for self-employed tradespeople and
            registered trade businesses. It is not directed at children
            and we do not knowingly collect information from anyone under
            the age of 16. If you believe a child has signed up, contact
            us and we will delete the account.
          </p>
        </LegalSection>

        <LegalSection id="security" number="11" title="Security">
          <p>
            Data is encrypted in transit using TLS 1.2 or higher. It is
            stored on access-controlled infrastructure that only we
            administer. Passwords are hashed using industry-standard
            algorithms — we never store them in plain text.
          </p>
          <p>
            Your account data is isolated at the database level using
            row-level security: a query running as your account literally
            cannot return another user&apos;s rows. No security is
            perfect, but we work to make a breach as costly and as small
            as possible.
          </p>
        </LegalSection>

        <LegalSection
          id="changes"
          number="12"
          title="Changes to this policy"
        >
          <p>
            We may update this policy as the product evolves. When we make
            a material change (something that affects your rights or
            changes how we use your data), we will notify you by email and
            inside the app before the change takes effect. The
            &ldquo;Last updated&rdquo; date at the top of this page
            always reflects the current version.
          </p>
        </LegalSection>

        <LegalSection id="contact" number="13" title="Contact">
          <p>
            Questions about this policy, or want to exercise a right under
            it?
          </p>
          <ul>
            <li>
              Email{" "}
              <a href={`mailto:${LEGAL.privacyEmail}`}>
                {LEGAL.privacyEmail}
              </a>
            </li>
            <li>Post: {LEGAL.companyName}, {LEGAL.address}</li>
          </ul>
        </LegalSection>
      </div>
    </article>
  );
}
