import type { Metadata } from "next";
import Link from "next/link";
import {
  EnvelopeSimple,
  ChatCircleDots,
  Microphone,
  FilePdf,
  CreditCard,
  Trash,
  DownloadSimple,
  LockKey,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";
import { LEGAL } from "@/lib/legal";
import { isNativeShellRequest } from "@/lib/native-shell";

export const metadata: Metadata = {
  title: "Support",
  description: `Get help with ${LEGAL.productName}. Contact us, learn how to delete your account, or export your data.`,
  alternates: { canonical: "/support" },
};

const MIC_TOPIC = {
  icon: Microphone,
  title: "The mic won't record",
  body: "Make sure your browser has permission to use the microphone. On iOS Safari, tap the AA icon in the address bar and check Microphone is set to Allow. Reload the page and try again.",
};

const BILLING_TOPIC = {
  icon: CreditCard,
  title: "Trial, plans & billing",
  body: `New accounts get a 7-day free trial with no card required. Paid plans (when they launch) auto-renew monthly until you cancel. To cancel a paid plan, email ${LEGAL.supportEmail} from the address on your account — your access continues until the end of the current period.`,
};

/** The same answer for the iPhone app, which has no Safari address bar. */
const MIC_TOPIC_IN_APP = {
  ...MIC_TOPIC,
  body: "Make sure Tradies2Quote is allowed to use the microphone: open the iPhone's Settings, then Tradies2Quote, and turn Microphone on. Then open the app and try again.",
};

const TOPICS = [
  MIC_TOPIC,
  {
    icon: FilePdf,
    title: "The quote PDF looks wrong",
    body: "Every quote can be edited line-by-line before you export. Open the quote, tap a line item to change the price, quantity, or description, then re-export. If your logo or business details look off, update them in Settings.",
  },
  BILLING_TOPIC,
  {
    icon: LockKey,
    title: "I can't sign in",
    body: "Use Forgot password on the sign-in screen to send yourself a reset link. If the link doesn't arrive within a few minutes, check your spam folder. Still stuck? Email us — we'll help you get back in.",
  },
];

/**
 * Inside the iPhone app (decided on the server): no trial, plan or billing
 * card (App Store 3.1.3(f)), and the app's own steps for the microphone and
 * for deleting an account. The website is unchanged.
 */
function topicsFor(inApp: boolean) {
  return inApp
    ? TOPICS.filter((topic) => topic !== BILLING_TOPIC).map((topic) => (topic === MIC_TOPIC ? MIC_TOPIC_IN_APP : topic))
    : TOPICS;
}

export default async function SupportPage() {
  const inApp = await isNativeShellRequest();
  return (
    <div className="bg-ink-900">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-ink-700">
        <div className="absolute inset-0 t2q-aurora opacity-40 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 md:px-12 py-16 md:py-24">
          <div className="t2q-section-label-pro mb-4">{"// support · help"}</div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl uppercase tracking-tight text-white">
            How can we <span className="text-brand">help?</span>
          </h1>
          <p className="mt-4 text-lg text-ink-200 max-w-2xl leading-relaxed">
            Real humans answer support. Most messages get a reply within
            one business day. We&apos;re based in {LEGAL.address} (NZST).
          </p>

          <div className="mt-10 grid sm:grid-cols-2 gap-4 max-w-3xl">
            <a
              href={`mailto:${LEGAL.supportEmail}`}
              data-testid="support-email-cta"
              className="group flex min-w-0 items-center gap-4 rounded-md border border-ink-600 bg-ink-800 p-4 sm:p-5 hover:border-brand transition-colors"
            >
              <EnvelopeSimple
                size={28}
                weight="bold"
                className="text-brand shrink-0"
              />
              <div className="min-w-0">
                <div className="font-mono text-xs uppercase tracking-[0.25em] text-ink-400">
                  Email us
                </div>
                <div className="font-display text-base uppercase tracking-tight text-white truncate sm:text-lg">
                  {LEGAL.supportEmail}
                </div>
              </div>
              <ArrowRight
                size={20}
                weight="bold"
                className="ml-auto text-ink-500 group-hover:text-brand transition-colors"
              />
            </a>

            <a
              href={`mailto:${LEGAL.privacyEmail}`}
              data-testid="support-privacy-cta"
              className="group flex min-w-0 items-center gap-4 rounded-md border border-ink-600 bg-ink-800 p-4 sm:p-5 hover:border-brand transition-colors"
            >
              <ChatCircleDots
                size={28}
                weight="bold"
                className="text-brand shrink-0"
              />
              <div className="min-w-0">
                <div className="font-mono text-xs uppercase tracking-[0.25em] text-ink-400">
                  Privacy &amp; data
                </div>
                <div className="font-display text-base uppercase tracking-tight text-white truncate sm:text-lg">
                  {LEGAL.privacyEmail}
                </div>
              </div>
              <ArrowRight
                size={20}
                weight="bold"
                className="ml-auto text-ink-500 group-hover:text-brand transition-colors"
              />
            </a>
          </div>
        </div>
      </section>

      {/* Common topics */}
      <section className="py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <div className="t2q-section-label-pro mb-3">{"// common topics"}</div>
          <h2 className="font-display text-3xl sm:text-4xl uppercase tracking-tight text-white">
            Quick <span className="text-brand">answers.</span>
          </h2>
          <p className="mt-3 text-ink-300 max-w-2xl">
            Most of the questions we get fall into one of these. If your
            issue isn&apos;t here, email us and we&apos;ll sort it.
          </p>

          <div className="mt-10 grid md:grid-cols-2 gap-4">
            {topicsFor(inApp).map((topic) => {
              const Icon = topic.icon;
              return (
                <div
                  key={topic.title}
                  className="rounded-md border border-ink-600 bg-ink-800 p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ink-900 border border-ink-600 shrink-0">
                      <Icon size={20} weight="bold" className="text-brand" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg uppercase tracking-tight text-white">
                        {topic.title}
                      </h3>
                      <p className="mt-2 text-ink-300 text-sm leading-relaxed">
                        {topic.body}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Account & data */}
      <section className="py-16 md:py-24 border-t border-ink-700 bg-ink-950">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <div className="t2q-section-label-pro mb-3">
            {"// your account · your data"}
          </div>
          <h2 className="font-display text-3xl sm:text-4xl uppercase tracking-tight text-white">
            Your data, <span className="text-brand">your call.</span>
          </h2>

          <div className="mt-10 grid md:grid-cols-2 gap-6">
            <div className="rounded-md border border-ink-600 bg-ink-900 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Trash size={22} weight="bold" className="text-brand" />
                <h3 className="font-display text-xl uppercase tracking-tight text-white">
                  Delete your account
                </h3>
              </div>
              <p className="text-ink-300 text-sm leading-relaxed">
                Email{" "}
                <a
                  href={`mailto:${LEGAL.privacyEmail}`}
                  className="text-brand underline underline-offset-4 hover:text-hivis"
                >
                  {LEGAL.privacyEmail}
                </a>{" "}
                from the address on your account and ask us to close it.
                We remove your account, quotes, and client data within 30
                days. Backups holding a copy are overwritten within a
                further 30 days.
              </p>
              {inApp ? (
                <p className="mt-4 text-ink-300 text-sm leading-relaxed">
                  Prefer self-serve? Delete your account right here in the
                  app: tap your photo at the top left, choose{" "}
                  <strong>Your profile</strong>, then{" "}
                  <strong>Delete my account</strong> at the bottom. It
                  removes your quotes, clients and account on the spot, no
                  email needed.
                </p>
              ) : (
                <p className="mt-4 text-ink-300 text-sm leading-relaxed">
                  Prefer self-serve? You can delete your account directly
                  in the app — open <strong>Settings</strong> and scroll to
                  the delete-account section. It removes your quotes,
                  clients and account on the spot, no email needed.
                </p>
              )}
            </div>

            <div className="rounded-md border border-ink-600 bg-ink-900 p-6">
              <div className="flex items-center gap-3 mb-4">
                <DownloadSimple
                  size={22}
                  weight="bold"
                  className="text-brand"
                />
                <h3 className="font-display text-xl uppercase tracking-tight text-white">
                  Export your data
                </h3>
              </div>
              <p className="text-ink-300 text-sm leading-relaxed">
                Every quote PDF can be downloaded from its quote screen
                inside the app — sign in, open the quote, hit{" "}
                <strong className="text-white">Download PDF</strong>.
              </p>
              <p className="mt-4 text-ink-300 text-sm leading-relaxed">
                Need a full export of your quotes and clients as a CSV
                or JSON? Email{" "}
                <a
                  href={`mailto:${LEGAL.privacyEmail}`}
                  className="text-brand underline underline-offset-4 hover:text-hivis"
                >
                  {LEGAL.privacyEmail}
                </a>{" "}
                and we&apos;ll prepare one for you within 20 working
                days.
              </p>
            </div>
          </div>

          <div className="mt-10 rounded-md border border-ink-700 bg-ink-800 p-6 text-sm text-ink-300">
            Full details of what we collect and how it&apos;s handled live
            in our{" "}
            <Link
              href="/privacy"
              className="text-brand underline underline-offset-4 hover:text-hivis"
            >
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link
              href="/terms"
              className="text-brand underline underline-offset-4 hover:text-hivis"
            >
              Terms of Service
            </Link>
            .
          </div>
        </div>
      </section>

      {/* Operator info */}
      <section className="py-12 border-t border-ink-700">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <div className="font-mono text-xs uppercase tracking-[0.25em] text-ink-500 mb-3">
            {"// operator"}
          </div>
          <div className="text-ink-300 text-sm leading-relaxed">
            <p>
              <strong className="text-white">{LEGAL.productName}</strong>{" "}
              is operated by {LEGAL.companyName}
              {LEGAL.nzbn ? <> (NZBN {LEGAL.nzbn})</> : null},{" "}
              {LEGAL.address}.
            </p>
            <p className="mt-2">
              Support hours are Monday to Friday, 8am – 6pm NZST. We do
              our best to answer faster, but one-business-day response is
              what we promise.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
