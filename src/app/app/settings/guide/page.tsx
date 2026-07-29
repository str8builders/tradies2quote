import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle,
  ChatCircle,
  DownloadSimple,
  EnvelopeSimple,
  Eye,
  Gear,
  House,
  ListBullets,
  Microphone,
  Money,
  PencilSimple,
  Question,
  Robot,
  Ruler,
  ShieldCheck,
  Sparkle,
  Stack,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { isNativeShellRequest } from "@/lib/native-shell";
import { shouldOfferCalculatorApp } from "@/lib/calculator-app";
import { AppHeader } from "../../_components/AppHeader";

/**
 * /app/settings/guide — Wave 36 — the full T2Q user manual.
 *
 * Lives under Settings (not its own top-level route) because it's
 * the kind of thing tradies reference, not a primary surface. The
 * OnboardingTour is the FIRST-RUN intro; this page is the
 * ANYTIME reference for "how does X work".
 *
 * Structure:
 *   - Sticky-ish top bar with a back link to Settings
 *   - Table of contents linking to anchor sections
 *   - One section per major feature with: icon + title + body +
 *     tip(s) + (optional) deep-link to the relevant /app page
 *
 * Pure server component. No client JS. Tailwind only.
 */
export const metadata: Metadata = {
  title: "How to use T2Q",
};

export const dynamic = "force-dynamic";

type Section = {
  id: string;
  title: string;
  icon: PhosphorIcon;
  intro: ReactNode;
  steps?: Array<{ label: string; body: ReactNode }>;
  tips?: ReactNode[];
  deepLink?: { label: string; href: string };
};

const SECTIONS: ReadonlyArray<Section> = [
  {
    id: "getting-started",
    title: "Getting started",
    icon: House,
    intro: (
      <>
        <p>
          T2Q turns a 60-second voice memo into a branded quote PDF, emails
          it to your client, and gives them a one-tap accept link. You can
          run the whole flow from your phone on a job site.
        </p>
        <p className="mt-2">
          Before you send your first quote, fill out{" "}
          <strong className="text-white">Settings</strong> — your business
          name, contact details, tax rate, default labour rate and markup
          all appear on every quote PDF.
        </p>
      </>
    ),
    steps: [
      {
        label: "Open Settings",
        body: (
          <>
            Tap the orange{" "}
            <strong className="text-white">Me</strong> circle bottom-right of
            the app, then{" "}
            <strong className="text-white">Settings</strong>.
          </>
        ),
      },
      {
        label: "Fill in your business profile",
        body: (
          <>
            Business name, phone, address, GST number, default labour rate
            ($/hour), default markup % on materials. These flow through to
            every quote.
          </>
        ),
      },
      {
        label: "Save",
        body: (
          <>
            Hit{" "}
            <strong className="text-white">Save changes</strong>. The
            dashboard&apos;s &ldquo;Set your business name first&rdquo;
            banner disappears once you have a business name on file.
          </>
        ),
      },
    ],
    tips: [
      "If you skip Settings and try to send a quote, the PDF and email will be branded 'Your business' — your client will trust it less. Always set this up first.",
    ],
    deepLink: { label: "Open Settings", href: "/app/settings" },
  },
  {
    id: "recording-a-quote",
    title: "Recording a quote",
    icon: Microphone,
    intro: (
      <>
        <p>
          The fastest way to make a quote is to record a voice memo on the
          job. Speak naturally — T2Q&apos;s transcription is tuned for NZ
          trade vocabulary (GIB, Pink Batts, H1.2 / H3.2 timber, dwangs,
          weatherboard, ITM, PlaceMakers, etc.) so jargon comes through
          right.
        </p>
      </>
    ),
    steps: [
      {
        label: "Tap the orange Record button",
        body: (
          <>
            On the{" "}
            <strong className="text-white">Quotes</strong> tab or from the
            dashboard&apos;s &ldquo;New quote&rdquo; button.
          </>
        ),
      },
      {
        label: "Speak the job",
        body: (
          <>
            Cover: <strong className="text-white">who</strong> (client
            name + email/phone),{" "}
            <strong className="text-white">where</strong> (site address),{" "}
            <strong className="text-white">what</strong> (the scope and
            rough materials), and{" "}
            <strong className="text-white">how long</strong> (your labour
            estimate). Don&apos;t worry about being neat — talk like
            you&apos;re briefing your apprentice.
          </>
        ),
      },
      {
        label: "Tap Stop, review the transcript",
        body: (
          <>
            T2Q shows you the cleaned text. Tap{" "}
            <strong className="text-white">Continue</strong> when it looks
            right (you can edit the text inline first if you want).
          </>
        ),
      },
    ],
    tips: [
      "Prefer typing? The same screen has a 'Type instead' tab — the rest of the pipeline works the same.",
      "Whisper still mis-hears sometimes (Kiwi pronunciation of 'GIB' / 'jib' for example). The next step (clarification modal) catches the homophones.",
    ],
    deepLink: { label: "Start a new quote", href: "/app/quotes/new" },
  },
  {
    id: "clarification-modal",
    title: "T2Q asks before guessing",
    icon: Question,
    intro: (
      <>
        <p>
          After you hit Continue, T2Q runs a cleanup pass and pops up a
          modal with the questions it isn&apos;t sure about — usually 3–5
          multi-choice questions, never more than 7. Each question has
          radio-button options (e.g.{" "}
          <em>GIB Standard 10mm, GIB Standard 13mm, GIB Aqualine 13mm
          wet-area, GIB Braceline 13mm bracing</em>) plus an &ldquo;Other
          — type below&rdquo; escape.
        </p>
      </>
    ),
    steps: [
      {
        label: "Tap an option per question",
        body:
          "Each pick locks T2Q in to what you actually want — no more 'it just made it up'.",
      },
      {
        label: "Skip what you don't care about",
        body: (
          <>
            The{" "}
            <strong className="text-white">Skip</strong> button moves
            past a single question. The{" "}
            <strong className="text-white">Skip the rest</strong> link
            ends the modal early if you&apos;ve answered the important
            ones already.
          </>
        ),
      },
      {
        label: "Hit Generate quote on the last question",
        body:
          "T2Q builds the full quote with your answers baked in. Land on the editor in ~10s.",
      },
    ],
    tips: [
      "Clean recordings produce no questions — the modal won't open if T2Q is confident.",
      "Questions are filtered to things that change the QUOTE PRICE: material grade, labour hours, compliance critical items. Cosmetic preferences (paint colour, scheduling) don't appear — those don't change the bill.",
    ],
  },
  {
    id: "review-edit",
    title: "Review and edit the quote",
    icon: PencilSimple,
    intro: (
      <>
        <p>
          T2Q drops you on the editor with every line, price, quantity and
          client field editable. Look for the yellow{" "}
          <strong className="text-white">{"// review these"}</strong> notes box
          and any red{" "}
          <strong className="text-white">MISSING PRICE</strong> pills —
          those are the lines that need your eye before sending.
        </p>
      </>
    ),
    steps: [
      {
        label: "Fix the client info",
        body:
          "Name, site address, email, phone. The email field is mandatory before sending — the customer needs somewhere to receive the quote.",
      },
      {
        label: "Edit any line item",
        body: (
          <>
            Tap the description, quantity, unit, or unit price to change
            them. Line totals recalculate automatically. Add new lines with{" "}
            <strong className="text-white">+ ADD MATERIAL</strong> or{" "}
            <strong className="text-white">+ ADD LABOUR</strong> at the
            bottom of each section.
          </>
        ),
      },
      {
        label: "Save changes",
        body: (
          <>
            Tap{" "}
            <strong className="text-white">Save</strong> in the sticky
            bottom bar to persist your edits. Send doesn&apos;t happen
            until you separately tap{" "}
            <strong className="text-white">Send</strong>.
          </>
        ),
      },
    ],
    tips: [
      "Yellow 'T2Q estimate' pills mean T2Q guessed the price. Replace those with your real numbers — and save the material to your library so future quotes use your real price automatically.",
      "The terms section is editable. Standard terms are baked in but you can tweak per quote.",
    ],
  },
  {
    id: "send-quote",
    title: "Sending the quote",
    icon: EnvelopeSimple,
    intro: (
      <>
        <p>
          When the quote looks right, hit the orange{" "}
          <strong className="text-white">Send</strong> button in the bottom
          bar. T2Q generates a branded PDF, uploads it, emails it to your
          client via Resend with the &ldquo;Accept Quote&rdquo; button
          embedded, and flips the status to{" "}
          <strong className="text-white">Sent</strong>.
        </p>
      </>
    ),
    steps: [
      {
        label: "Tap Send",
        body:
          "Button shows 'Saving edits → Generating PDF → Sending email' progress states. Takes about 5–10 seconds end to end.",
      },
      {
        label: "Customer receives the email",
        body: (
          <>
            From{" "}
            <strong className="text-white">
              T2Q &lt;hello@tradies2quote.com&gt;
            </strong>{" "}
            with the PDF attached and a one-tap accept link. They see your
            business name, not T2Q&apos;s, so it reads as a real quote from
            you.
          </>
        ),
      },
      {
        label: "Watch the status flip",
        body:
          "Sent → Viewed (when the customer opens the link) → Accepted (when they sign). The dashboard pipeline tiles update automatically.",
      },
    ],
    tips: [
      "Need to resend? The Send button changes to 'Resend' once a quote is in the Sent or Viewed state — it reuses the same PDF + token.",
      "The PDF gets saved to Supabase storage on first send. Re-sending doesn't regenerate it unless you've edited the quote since.",
    ],
  },
  {
    id: "customer-chat",
    title: "T2Q chat inside every quote",
    icon: ChatCircle,
    intro: (
      <>
        <p>
          When the customer opens the quote link, they see an orange chat
          bubble bottom-right. Tap it → a T2Q assistant that knows the
          exact quote answers their questions in seconds:{" "}
          <em>&ldquo;what does line 3 mean?&rdquo;</em>,{" "}
          <em>&ldquo;can we use cheaper insulation?&rdquo;</em>,{" "}
          <em>&ldquo;when can you start?&rdquo;</em>.
        </p>
      </>
    ),
    steps: [
      {
        label: "Customer asks anything",
        body:
          "T2Q uses the actual line items, totals, and your terms — never invents prices or warranties.",
      },
      {
        label: "T2Q flags actionable items for you",
        body: (
          <>
            If the customer wants something you have to decide (cheaper
            alternative, scope change, scheduling), T2Q flags a note
            for you. Open the quote in your app → Review Tools →{" "}
            <strong className="text-white">Customer chat</strong>{" "}
            collapsible — pending notes appear in a yellow panel at the
            top.
          </>
        ),
      },
      {
        label: "Full thread is logged",
        body:
          "Every customer question and every T2Q reply is stored against the quote. You see exactly what was discussed.",
      },
    ],
    tips: [
      "Safety: T2Q NEVER agrees to a price drop, NEVER quotes a new total for a scope change, NEVER accepts the quote on the customer's behalf. It always defers price/scope decisions back to you.",
      "Rate limited at 25 customer messages per quote per UTC day — stops abuse.",
    ],
  },
  {
    id: "materials-library",
    title: "Materials library",
    icon: Stack,
    intro: (
      <>
        <p>
          The more materials you save to your library, the more accurate
          future quotes get. T2Q matches the generated line items
          against your library by name and replaces estimates with your
          real prices and supplier links automatically.
        </p>
      </>
    ),
    steps: [
      {
        label: "Add manually",
        body: (
          <>
            Tap{" "}
            <strong className="text-white">Materials</strong> tab → orange{" "}
            <strong className="text-white">+ New material</strong>. Enter
            the name, unit, default unit price, and supplier link.
          </>
        ),
      },
      {
        label: "Capture from a URL",
        body: (
          <>
            Got a Mitre 10 / Bunnings / ITM / PlaceMakers product page?
            Tap{" "}
            <strong className="text-white">Capture from URL</strong> on
            the Materials page and paste the link — T2Q extracts the
            product name, unit, and price automatically.
          </>
        ),
      },
      {
        label: "Import from CSV",
        body: (
          <>
            Already have a price list? Use the{" "}
            <strong className="text-white">Import CSV</strong> page to
            upload it in one shot. T2Q maps the columns interactively.
          </>
        ),
      },
    ],
    tips: [
      "Materials with a yellow 'T2Q' pill came from a T2Q estimate — confirm the price and the yellow pill goes away.",
      "When you edit a line price on a quote, T2Q doesn't auto-write that price back to the library — you save the material explicitly so you don't accidentally overwrite known good prices.",
    ],
    deepLink: { label: "Open Materials", href: "/app/materials" },
  },
  {
    id: "quotes-pipeline",
    title: "Your pipeline at a glance",
    icon: ListBullets,
    intro: (
      <>
        <p>
          The{" "}
          <strong className="text-white">Quotes</strong> tab is your
          pipeline view. Every quote is grouped by stage so you can see
          where each one sits.
        </p>
      </>
    ),
    steps: [
      {
        label: "Quote stages",
        body: (
          <>
            Draft → Sent → Viewed → Accepted → Scheduled → In progress →
            Completed. Declined and Expired are terminal states that show
            in their own sub-section.
          </>
        ),
      },
      {
        label: "Filter by stage",
        body:
          "Tap any pipeline tile on the dashboard to land on the Quotes list filtered to that stage. The URL ?stage= param controls the filter.",
      },
      {
        label: "Archive or soft-delete",
        body: (
          <>
            Tap the{" "}
            <strong className="text-white">⋯</strong> menu on any row in
            the Quotes list to archive (hide from the active view) or
            soft-delete (gone from your list, still in the database for
            audit). Archived quotes can be unarchived from the same menu.
          </>
        ),
      },
    ],
    deepLink: { label: "Open Quotes", href: "/app/quotes" },
  },
  {
    id: "lifecycle-card",
    title: "Lifecycle card on each quote",
    icon: Robot,
    intro: (
      <>
        <p>
          Every quote preview opens with a{" "}
          <strong className="text-white">Lifecycle</strong> card at the
          top. It tells you what stage the quote is in, what to do next,
          and surfaces the right agent for the current stage.
        </p>
      </>
    ),
    steps: [
      {
        label: "Stage + status pill",
        body:
          "The pill matches the colour of the same stage on your dashboard tiles.",
      },
      {
        label: "Next action button",
        body:
          "One primary action button (Send, Resend, Accept, Mark in progress, etc.) — what the orchestrator thinks is the next logical move.",
      },
      {
        label: "Suggested agent",
        body: (
          <>
            A &ldquo;Suggested agent → Open&rdquo; row appears when an
            agent is specifically helpful for the current state.
            Tapping{" "}
            <strong className="text-white">Open</strong> jumps you to
            that agent inside the Review Tools sheet.
          </>
        ),
      },
    ],
  },
  {
    id: "review-tools",
    title: "Review tools (the agents)",
    icon: ShieldCheck,
    intro: (
      <>
        <p>
          Behind the{" "}
          <strong className="text-white">Open review tools</strong> button
          on mobile (or inline on tablet/desktop), every quote has a stack
          of read-only agents that audit different aspects of the quote.
        </p>
      </>
    ),
    steps: [
      {
        label: "Customer chat",
        body:
          "The conversation thread between your customer and T2Q on the public quote link. Pending tradie-action notes are surfaced at the top.",
      },
      {
        label: "Quote Review Agent",
        body:
          "Checks the quote is complete and ready to send — flags missing client info, missing prices, suspicious quantities.",
      },
      {
        label: "Forgotten-Cost Detector",
        body:
          "Scans for commonly-missed costs (dump fees, scaffolding, consents, fasteners, sundries) and flags possible margin leaks.",
      },
      {
        label: "Compliance Agent",
        body: (
          <>
            Rule-based NZ Building Code review of the quote. Flags
            treatment-class issues (H1.2 vs H3.2 in exposed framing),
            insulation R-values, fire-rated linings, fastener finish.
          </>
        ),
      },
      {
        label: "Voice Cleanup Agent",
        body:
          "Available only when the quote came from a voice recording. Lets you regenerate the cleaned-up transcript after editing.",
      },
      {
        label: "Follow-up Agent",
        body: (
          <>
            Drafts a follow-up message to copy and paste once the quote
            is sent (or sent + viewed + not accepted). Adjusts tone based
            on how long it&apos;s been since you sent.
          </>
        ),
      },
    ],
    tips: [
      "All agents are read-only and synchronous. None of them sends emails or modifies the quote without you tapping a button.",
      "Agents only run when you open their panel — opening the Review Tools sheet doesn't fire them all at once.",
    ],
  },
  {
    id: "public-quote",
    title: "What the customer sees",
    icon: Eye,
    intro: (
      <>
        <p>
          The link in the customer&apos;s email opens a public quote view at{" "}
          <code className="font-mono text-xs text-ink-300">
            tradies2quote.com/quote/[token]
          </code>
          . No login required. They see:
        </p>
      </>
    ),
    steps: [
      {
        label: "Your business header",
        body:
          "Logo, business name, contact email/phone — clean, branded, looks like it came from you not from a SaaS app.",
      },
      {
        label: "The quote breakdown",
        body:
          "Materials, labour, markup, GST, total. Same line items you see in the editor.",
      },
      {
        label: "Accept Quote button",
        body:
          "Big green button. Tap → sign their name on a signature pad → tap Accept. Quote status flips to Accepted instantly and you get a quote_event logged.",
      },
      {
        label: "Chat bubble",
        body:
          "Bottom-right corner. T2Q assistant for asking questions. See the 'T2Q chat inside every quote' section above.",
      },
      {
        label: "PDF download",
        body:
          "If the customer wants the printable PDF, there's a 'View full PDF' link below the summary — opens in a new tab.",
      },
    ],
    tips: [
      "The public quote view is the customer-facing surface. The Install button, your in-app navigation, and any owner-only features are all hidden — customers only see the quote.",
      "Once a quote is accepted, the public view switches to an 'Accepted' view with the signed name and date. The chat bubble disappears.",
    ],
  },
  {
    id: "install-app",
    title: "Install T2Q as an app",
    icon: DownloadSimple,
    intro: (
      <>
        <p>
          T2Q is a Progressive Web App — you can install it on your phone
          like a native app. Once installed it opens from your home screen
          with no Safari URL bar, faster loading, and a real app icon.
        </p>
      </>
    ),
    steps: [
      {
        label: "On iPhone (Safari)",
        body: (
          <>
            Tap the{" "}
            <strong className="text-white">Share</strong> button in
            Safari&apos;s bottom toolbar → scroll down → tap{" "}
            <strong className="text-white">Add to Home Screen</strong> →{" "}
            <strong className="text-white">Add</strong>.
          </>
        ),
      },
      {
        label: "On Android (Chrome / Edge)",
        body: (
          <>
            Tap the{" "}
            <strong className="text-white">⋮ menu</strong> in the browser
            → tap{" "}
            <strong className="text-white">Install app</strong> or{" "}
            <strong className="text-white">Add to Home Screen</strong>.
          </>
        ),
      },
      {
        label: "Open from home screen",
        body:
          "The orange T2Q icon opens the app full-screen with no browser chrome. Cookie + session persistence carries over from Safari so you stay signed in.",
      },
    ],
    tips: [
      "The floating orange install button at the bottom-right of /app pages opens this same instructions modal. Available until the app is installed.",
    ],
  },
  {
    id: "t2qcal",
    title: "T2QCAL — the site calculator",
    icon: Ruler,
    intro: (
      <>
        <p>
          T2QCAL is the companion calculator app for iPhone — 94 construction
          calculators (rafters, stairs, slabs, spacings, drainage), each one
          drawing the job as you type it, plus camera measuring and set-out.
          It signs in with your Tradies2Quote account, so a quantity worked
          out on site lands back here as a draft quote at your own markup and
          GST.
        </p>
      </>
    ),
    steps: [
      {
        label: "Open it from the dashboard",
        body: (
          <>
            Tap the{" "}
            <strong className="text-white">T2QCAL</strong> card near the
            bottom of your dashboard. If the app is on your phone it opens
            straight away.
          </>
        ),
      },
      {
        label: "Sign in once",
        body: (
          <>
            Use your{" "}
            <strong className="text-white">Tradies2Quote email and
            password</strong> — there is no second account and nothing extra
            to pay. Your labour rate, markup and GST come off the same
            profile this app prices from.
          </>
        ),
      },
      {
        label: "Work it out, tick it, send it",
        body: (
          <>
            Run the calculator, then tap{" "}
            <strong className="text-white">Send to a quote</strong>. You tick
            the lines you&apos;re actually ordering; they arrive on your
            quote list as a draft, marked as measured so T2Q won&apos;t ask
            you to confirm them again.
          </>
        ),
      },
      {
        label: "Finish it here",
        body: (
          <>
            Open the draft in Tradies2Quote to add labour, pick the client
            and send it — same as any other quote.
          </>
        ),
      },
    ],
    tips: [
      "74 trade manuals — GIB, MiTek, James Hardie, Pryda, Concrete NZ — download to the phone and read with no signal.",
      "Every calculator works signed out. The account only matters when you want a quantity to become a quote.",
    ],
  },
  {
    id: "settings-deep",
    title: "Settings — every field explained",
    icon: Gear,
    intro: (
      <>
        <p>
          Every field on the Settings page shows up somewhere on your
          quotes. Here&apos;s what each one does:
        </p>
      </>
    ),
    steps: [
      {
        label: "Business name",
        body:
          "Appears on the quote PDF header and as the sender on the customer's email. The dashboard banner nags you until this is set.",
      },
      {
        label: "Business email / phone / address",
        body:
          "Footer of the quote PDF, contact info for the customer to reach you back. Email + phone are also used by T2Q's chat to direct the customer if it can't answer.",
      },
      {
        label: "GST number",
        body:
          "Appears under your business name on the quote — required by IRD if you're GST registered.",
      },
      {
        label: "Country / Currency / Tax label / Tax rate",
        body:
          "Country drives default tax label + rate (NZ: GST 15%, AU: GST 10%, UK: VAT 20%). You can override per-account if you bill in a different currency.",
      },
      {
        label: "Default labour rate ($/hour)",
        body:
          "What T2Q assigns to labour line items in generated quotes. You can override per-line in the editor — the default is just the starting point.",
      },
      {
        label: "Default materials markup %",
        body:
          "Applied to the materials subtotal to compute the markup amount. Shows as its own line on the customer's PDF. Set to 0 if you want to bake markup into individual unit prices instead.",
      },
    ],
    deepLink: { label: "Open Settings", href: "/app/settings" },
  },
  {
    id: "billing",
    title: "Your plan",
    icon: Money,
    intro: (
      <>
        <p>
          Every account starts with a 7-day free trial — every feature
          unlocked, no card needed. After the trial your existing quotes
          and invoices stay viewable and downloadable, whatever you decide.
        </p>
      </>
    ),
    tips: [
      "Your data stays yours. Export your quotes and materials any time — contact support if you need a hand.",
    ],
  },
];

export default async function GuidePage() {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");

  // Guideline 2.5.2 — the App Store shell must not point at software that is
  // not itself on the store, so the T2QCAL section is withheld there until
  // the calculator is published. Same gate, same reasoning, same env var as
  // the dashboard card (see CalculatorLaunch.tsx).
  const nativeShell = await isNativeShellRequest();
  const offerCalculator = shouldOfferCalculatorApp({
    nativeShell,
    appStoreUrl: process.env.NEXT_PUBLIC_T2QCAL_APPSTORE_URL,
  });
  const sections = offerCalculator
    ? SECTIONS
    : SECTIONS.filter((s) => s.id !== "t2qcal");

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Guide" />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Header + back link */}
        <Link href="/app/settings" className="t2q-btn-back mb-4">
          <ArrowLeft weight="bold" className="h-3.5 w-3.5" />
          Back to settings
        </Link>
        <div className="mb-10">
          <div className="t2q-section-label-pro mb-3">{"// the manual"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            How to use <span className="text-brand">T2Q.</span>
          </h1>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            Every feature, what it does, how to use it. Bookmark this — it
            answers any &ldquo;wait, where do I find X?&rdquo; you&apos;ll
            have over the next month.
          </p>
        </div>

        {/* Table of contents */}
        <nav
          aria-label="Sections"
          className="t2q-card-pro mb-10 p-4 sm:p-5"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300">
            {`// ${sections.length} sections — tap to jump`}
          </p>
          <ol className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex items-center gap-2 rounded-sm border border-ink-700/60 bg-ink-900/40 px-3 py-2 text-sm text-ink-200 transition-colors hover:border-brand/60 hover:text-white"
                >
                  <span className="font-mono text-[10px] text-ink-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <s.icon
                    size={14}
                    weight="bold"
                    aria-hidden="true"
                    className="shrink-0 text-brand"
                  />
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <div className="space-y-10">
          {sections.map((s, i) => (
            <SectionBlock key={s.id} number={i + 1} section={s} />
          ))}
        </div>

        {/* Bottom CTA back to the app */}
        <div className="mt-14 flex flex-col items-center gap-3 border-t border-ink-700/60 pt-10 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-400">
            {"// any more questions"}
          </p>
          <p className="text-sm text-ink-200">
            Email{" "}
            <a
              href="mailto:hello@tradies2quote.com"
              className="text-brand hover:underline"
            >
              hello@tradies2quote.com
            </a>{" "}
            — we read every message.
          </p>
          <Link href="/app" className="t2q-btn-ghost-pro mt-2">
            <House size={16} weight="bold" />
            Back to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}

function SectionBlock({
  number,
  section,
}: {
  number: number;
  section: Section;
}) {
  const SectionIcon = section.icon as ComponentType<{
    size?: number;
    weight?: "regular" | "bold" | "fill" | "duotone" | "light" | "thin";
    className?: string;
    "aria-hidden"?: boolean;
  }>;
  return (
    <section
      id={section.id}
      data-testid={`guide-section-${section.id}`}
      className="scroll-mt-20 t2q-card-pro p-5 sm:p-6"
    >
      <header className="mb-4 flex items-start gap-3 sm:items-center">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand"
        >
          <SectionIcon size={20} weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-400">
            {`// section ${String(number).padStart(2, "0")}`}
          </p>
          <h2 className="mt-0.5 font-display text-xl uppercase tracking-tight text-white sm:text-2xl">
            {section.title}
          </h2>
        </div>
      </header>

      <div className="space-y-4 text-sm text-ink-200 sm:text-base">
        <div className="space-y-2 leading-relaxed">{section.intro}</div>

        {section.steps && section.steps.length > 0 && (
          <ol className="space-y-3 border-t border-ink-700/60 pt-4">
            {section.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-brand font-display text-xs text-ink-900"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm uppercase tracking-tight text-white sm:text-base">
                    {step.label}
                  </p>
                  <div className="mt-1 leading-relaxed text-ink-200">
                    {step.body}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        {section.tips && section.tips.length > 0 && (
          <ul className="space-y-2 rounded-sm border border-hivis/30 bg-hivis/5 p-3 text-sm text-ink-200 sm:p-4">
            {section.tips.map((tip, i) => (
              <li key={i} className="flex gap-2">
                <Sparkle
                  size={14}
                  weight="bold"
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-hivis"
                />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        )}

        {section.deepLink && (
          <div>
            <Link
              href={section.deepLink.href}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-brand hover:text-hivis"
            >
              <CheckCircle size={12} weight="bold" />
              {section.deepLink.label}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

