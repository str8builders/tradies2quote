import {
  MapPin,
  ShieldCheck,
  PencilSimple,
  HandPalm,
} from "@phosphor-icons/react/dist/ssr";

// Wave 19.2 — removed the Unsplash stock portrait that was being shown
// next to the bio with the alt text "Challis Samu, founder of
// tradies2Quote". Reverse-image-searchable credibility risk. Bio reads
// honestly on its own; swap a real on-site photo back in here when one
// is ready.

const PILLARS = [
  {
    slug: "nz-first",
    icon: MapPin,
    title: "Built for NZ tradies",
    body: "NZ first. NZBN, NZD, GST 15% — all baked in. Australia, UK and the rest come next.",
  },
  {
    slug: "gst-ready",
    icon: ShieldCheck,
    title: "GST-ready out of the box",
    body: "Inc-GST, ex-GST, both shown on the PDF. Set your tax once and every quote calculates it for you.",
  },
  {
    slug: "edit-before-send",
    icon: PencilSimple,
    title: "Editable before sending",
    body: "The first draft is a starting point, not a contract. Tweak any line, any price, any note before it goes out.",
  },
  {
    slug: "no-auto-send",
    icon: HandPalm,
    title: "Nothing sends without your tap",
    body: "No auto-send. No surprise emails to your client. Quotes only leave when you tap send. Your name, your call.",
  },
];

export function FounderStory() {
  return (
    <section
      id="trust"
      data-testid="section-trust"
      className="relative border-b border-ink-600 bg-ink-800 py-24 md:py-32 overflow-hidden"
    >
      <div className="absolute inset-0 t2q-noise opacity-40 pointer-events-none" />
      <div className="absolute -top-32 -left-20 w-[500px] h-[500px] rounded-full bg-brand/10 blur-3xl pointer-events-none animate-blob" />

      <div className="relative max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 mb-14">
          <div className="lg:col-span-5">
            <div className="t2q-section-label mb-4">{"// why you can trust this"}</div>
            <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tighter uppercase leading-[0.95]">
              Built by a builder. <br />
              <span className="text-brand">For builders.</span>
            </h2>
          </div>
          <div className="lg:col-span-7 lg:pt-4">
            <p className="text-lg text-ink-200 leading-relaxed">
              I&apos;m Challis — a qualified builder based in New Zealand. I built
              this for myself first because I was sick of losing Sundays to
              quoting. It&apos;s been proven on real jobs with a small crew of
              mates — now I&apos;m opening it up.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map(({ slug, icon: Icon, title, body }) => (
            <div
              key={slug}
              data-testid={`trust-pillar-${slug}`}
              className="rounded-lg border border-white/10 bg-ink-900/90 p-7 shadow-[0_16px_42px_-34px_rgba(0,0,0,0.85)] md:p-8"
            >
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-lg border border-brand/30 bg-brand/10">
                <Icon size={26} weight="bold" className="text-brand" />
              </div>
              <h3 className="font-display text-lg md:text-xl uppercase tracking-tight mb-2">
                {title}
              </h3>
              <p className="text-ink-100 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-ink-900 px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-hivis animate-pulse" />
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-200">
            NZ tradies only · onboarding new crews each week
          </span>
        </div>
      </div>
    </section>
  );
}
