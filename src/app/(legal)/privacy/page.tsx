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
  { id: "location", label: "Location" },
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

/** "05": a section's number, from its place in the list above. */
const num = (id: string) => String(SECTIONS.findIndex((s) => s.id === id) + 1).padStart(2, "0");

export default function PrivacyPage() {
  return (
    <article className="bg-ink-900">
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-16 md:py-24">
        <div className="t2q-section-label-pro mb-4">{"// legal · privacy"}</div>
        <h1 className="font-display text-4xl sm:text-5xl uppercase tracking-tight text-white">
          Privacy <span className="text-brand">Policy</span>
        </h1>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
          Last updated {LEGAL.privacyLastUpdatedDisplay}
        </p>

        <div className="mt-10 rounded-md border border-ink-600 bg-ink-800 p-6">
          <div className="font-mono text-xs uppercase tracking-[0.25em] text-brand mb-3">
            {"// the short version"}
          </div>
          <p className="text-ink-100 leading-relaxed">
            We collect the minimum we need to run {LEGAL.productName}: your
            account details, the quotes you create, the voice memos you
            record to build them and, only if you turn location on, where
            you start and finish work. We do not sell your data. We do not
            train AI models on it. You can ask us to delete your account and all
            of your data at any time by emailing{" "}
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

        <LegalSection id="who-we-are" number={num("who-we-are")} title="Who we are">
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

        <LegalSection id="what-we-collect" number={num("what-we-collect")} title="What we collect">
          <p>We collect four kinds of information.</p>
          <p>
            <strong>1. Account information</strong> — your name, email
            address, business name, hashed password, country, and any
            branding (logo, business number, contact details) you choose to
            add for your quotes.
          </p>
          <p>
            <strong>2. Job and quote content</strong> — the audio you record,
            the cleaned-up transcript of that audio, plan and site photos
            you scan, the line items and prices that go into each quote,
            the client contact details you save against a job, the hours
            you log in the Timesheet, messages your clients send in the
            quote chat, and — if you use the
            weather feature — the job-site address you check.
            This is the working data of the product.
          </p>
          <p>
            <strong>3. Location</strong> — only if you turn it on, in the
            Timesheet: where you start and finish work, and your route while
            you&apos;re clocked in. See <a href="#location">Location</a> below
            for exactly what is kept, who sees it and for how long.
          </p>
          <p>
            <strong>4. Technical information</strong> — IP address, browser
            and device type, basic usage events (e.g. &ldquo;quote
            generated&rdquo;, &ldquo;PDF exported&rdquo;), and error logs.
            We use this to keep the service running and to spot problems.
          </p>
          <p>
            We do <strong>not</strong> collect payment card details
            ourselves. Card payments are handled by Stripe — your card
            never touches our servers.
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

        <LegalSection id="how-we-use" number={num("how-we-use")} title="How we use it">
          <ul>
            <li>To create your account and let you sign in.</li>
            <li>
              To transcribe your voice memos and turn them into a quote.
            </li>
            <li>
              To generate, store, and deliver your quote and invoice PDFs.
            </li>
            <li>
              If you turn location on: to pin where you start and finish
              work, work out travel kilometres, and clock you in and out at
              job sites automatically if you ask for that.
            </li>
            <li>
              To send you transactional emails (sign-in links, password
              resets, your client&apos;s opened-quote notifications).
            </li>
            <li>
              To debug, monitor, and improve the service. Where we look at
              usage to improve the product, we work from aggregated data, not
              from the content of your individual quotes.
            </li>
            <li>To detect, prevent, and respond to abuse or fraud.</li>
            <li>To comply with our legal obligations.</li>
          </ul>
          <p>
            We do not sell your personal information. We do not share it
            with advertisers. We do not use it to train AI models — see the
            next section for what happens to your voice memos.
          </p>
        </LegalSection>

        <LegalSection
          id="voice-recordings"
          number={num("voice-recordings")}
          title="Voice, photos & AI processing"
        >
          <p>
            {LEGAL.productName} uses two external AI providers, Anthropic and
            OpenAI, to turn what you give it into a quote. Content is
            processed as follows:
          </p>
          <ul>
            <li>
              <strong>Typed descriptions and transcripts</strong> — sent to
              Anthropic&apos;s Claude models to draft your quote, tidy the
              transcript and write a short job summary.
            </li>
            <li>
              <strong>Voice memos</strong> — sent to OpenAI to turn the
              recording into text. We keep the text, not the audio.
            </li>
            <li>
              <strong>Photos and documents</strong> — site drawings, plan
              scans and photographed supplier quotes are read by
              Anthropic&apos;s Claude. Job photos, including photos a client
              adds to a quote request, are described by OpenAI.
            </li>
            <li>
              <strong>Customer quote chat</strong> — when your client uses
              the chat on their quote page, their messages are answered by
              Anthropic&apos;s Claude. The chat is clearly labelled as AI, the
              conversation is visible to you, and both sides of it are
              screened by an automated content filter.
            </li>
          </ul>
          <p>
            Anthropic and OpenAI process this content to return the result.
            Under their commercial API terms they do not use it to train their
            models, and neither do we. Their processing may take place outside
            New Zealand, including in the United States.
          </p>
          <p>
            The text description or transcript lives inside your quote and is
            deleted when you delete the quote or close your account. Plan and
            site images you attach are stored with your account so your quotes
            keep their source documents; delete the quote (or your account) and
            they go with it.
          </p>
        </LegalSection>

        <LegalSection id="location" number={num("location")} title="Location">
          <p>
            Location is off until you turn it on yourself, in the Timesheet.
            We never use it for advertising and we never sell it.
          </p>
          <ul>
            <li>
              <strong>Timesheet</strong> — only if you turn location on. When
              you start or finish work, the app saves where you are, for
              example &ldquo;At the Hemi Walker job&rdquo;. While you&apos;re
              clocked in it also keeps your route, to work out kilometres for
              travel: precise while the app is open, and rough while it&apos;s
              in the background. Nothing is recorded while you&apos;re not
              clocked in.
            </li>
            <li>
              <strong>Automatic clock-in</strong> — only if you turn it on, in
              the iPhone app. During the work hours you choose, your phone
              watches for you arriving at and leaving your job sites, using
              iOS region monitoring (iPhone asks you to allow location
              &ldquo;Always&rdquo; for this). The check happens on your phone;
              nothing is sent until you arrive or leave. Outside your work
              hours nothing happens.
            </li>
            <li>
              <strong>Who sees it</strong> — you see your own. If you work for
              a business that uses {LEGAL.productName} (you&apos;ve joined its
              team), the business owner can see your hours, where you clocked
              in and out, and where you were while you were clocked in.
            </li>
            <li>
              <strong>How long it&apos;s kept</strong> — route points are
              deleted after 90 days. Where you clocked in and out stays with
              hours that have been invoiced; otherwise it is cleared after 90
              days too.
            </li>
            <li>
              <strong>Maps and addresses</strong> — job-site addresses are
              looked up with OpenStreetMap&apos;s Nominatim service, and maps
              are drawn with OpenStreetMap map tiles, which your phone loads
              straight from OpenStreetMap. To name the town on the weather
              button, your location rounded to about 1 km is looked up there
              too. Only the address, the rounded area, or the area of the map
              on screen is sent — not who you are.
            </li>
            <li>
              <strong>Weather</strong> — the weather button shows the forecast
              where you are when you&apos;ve allowed location (or when you tap
              &ldquo;Use my location&rdquo;), and otherwise for your business
              address. Your location is rounded to about 1 km before the
              forecast is requested from Open-Meteo. It isn&apos;t saved with
              your account or anywhere else; only that area&apos;s forecast
              is kept for up to 30 minutes, so it loads quicker.
            </li>
          </ul>
          <p>
            You can turn location off at any time in the Timesheet (Location
            settings), and in the iPhone&apos;s Settings under{" "}
            {LEGAL.productName}, Location. Turning it off stops collection
            straight away; what was already saved is deleted on the schedule
            above.
          </p>
        </LegalSection>

        <LegalSection
          id="service-providers"
          number={num("service-providers")}
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
              centre in Sydney, Australia. Your account data, quotes,
              clients, and uploaded images live on that server (we run the database
              and file storage software ourselves — no third-party
              database service holds your data).
            </li>
            <li>
              <strong>Anthropic</strong> — AI processing of text and images:
              quote drafting, transcript clean-up, reading drawings and
              supplier quotes, and the customer quote chat and its content
              filter. Receives the text or image needed for that task.
            </li>
            <li>
              <strong>OpenAI</strong> — voice transcription and job-photo
              descriptions. Receives the recording or photo needed for that
              task.
            </li>
            <li>
              <strong>Open-Meteo</strong> — job-site weather. Receives
              the job-site or business address (to find it on the map) and/or
              coordinates — including your device location, rounded to about
              1 km, when the weather is for where you are — and returns the
              forecast.
              No account identifiers are sent with it.
            </li>
            <li>
              <strong>OpenStreetMap</strong> — maps. Its Nominatim service
              turns job-site addresses into map points and names the town
              for the weather button, and its map tiles draw the maps.
              Receives only the address, a location rounded to about 1 km, or
              the map area; no account identifiers are sent with it.
            </li>
            <li>
              <strong>Stripe</strong> — payment processing, including
              client deposit payments where a tradie turns them on.
              Handles card details. We never see your card number.
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery.
              Sends sign-in links, quote and invoice emails to your
              clients, and account notifications.
            </li>
            <li>
              <strong>Apple</strong> — push notifications on iOS. If you
              turn notifications on in the iOS app, a device push token is
              stored and notifications are delivered through the Apple
              Push Notification service.
            </li>
          </ul>
          <p>
            Text-message quote links are sent from <strong>your own
            phone&apos;s Messages app</strong> — no SMS provider receives
            your client&apos;s number or the message from us.
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
          number={num("where-stored")}
          title="Where data is stored"
        >
          <p>
            Your account data, quote content and any location you let the
            app record are stored on a server we operate, hosted by Contabo
            GmbH in <strong>Sydney, Australia</strong>. Backups live on the
            same infrastructure.
          </p>
          <p>
            Typed descriptions, transcripts, AI chat messages, voice memos and
            photos you ask the app to read are processed by Anthropic and
            OpenAI, which may process them in the United States. Weather
            lookups go to Open-Meteo in the EU; address look-ups and map
            tiles come from OpenStreetMap; emails are delivered via Resend
            in the US.
          </p>
          <p>
            That means your personal information is transferred to and
            processed in countries outside New Zealand and the United
            Kingdom, including Australia and the United States. We rely on
            the contractual safeguards our providers offer (including
            standard contractual clauses where required)
            to keep your data protected to a comparable standard.
          </p>
        </LegalSection>

        <LegalSection
          id="retention"
          number={num("retention")}
          title="How long we keep it"
        >
          <ul>
            <li>
              <strong>Active account data</strong> — we keep it for as long
              as your account is open.
            </li>
            <li>
              <strong>Deleted quotes</strong> — purged within 30 days of
              deletion.
            </li>
            <li>
              <strong>Location</strong> — route points are deleted after 90
              days. Clock-in and clock-out places stay with invoiced hours;
              others are cleared after 90 days.
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
              tax invoices and similar records may be retained for the
              period required by NZ law (typically 7 years).
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="your-rights" number={num("your-rights")} title="Your rights">
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
              in the app (Delete account, at the bottom of your account
              settings) — this removes your
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

        <LegalSection id="cookies" number={num("cookies")} title="Cookies">
          <p>
            We use a small number of essential cookies. They keep you
            signed in, remember your theme preference, and protect against
            cross-site request forgery. Without them, the app cannot
            function.
          </p>
          <p>
            We do <strong>not</strong> use advertising cookies or tracking
            pixels, and nothing follows you around the web. On our website,
            if you choose Accept on the cookie banner, a small analytics
            script also runs to show us what&apos;s working; choose Decline
            and it never loads. The iPhone app uses essential cookies only:
            it shows no cookie banner and never loads that script.
          </p>
        </LegalSection>

        <LegalSection id="children" number={num("children")} title="Children">
          <p>
            {LEGAL.productName} is built for self-employed tradespeople and
            registered trade businesses. It is not directed at children
            and we do not knowingly collect information from anyone under
            the age of 16. If you believe a child has signed up, contact
            us and we will delete the account.
          </p>
        </LegalSection>

        <LegalSection id="security" number={num("security")} title="Security">
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
          number={num("changes")}
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

        <LegalSection id="contact" number={num("contact")} title="Contact">
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
