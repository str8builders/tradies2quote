"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Lightning,
  Microphone,
  PaperPlaneTilt,
  PencilSimple,
  Receipt,
  ShieldCheck,
  Wrench,
} from "@phosphor-icons/react";

/**
 * Marketing panel rendered on `/login` (right side) and `/signup`
 * (left side) via the existing AuthSplitShell.
 *
 * Wave 12.3 — extended from a single headline + 3 bullets to a real
 * scrollable story panel. Five sections, each fades + slides up as
 * the user scrolls. Framer-motion `whileInView` with `viewport.once`
 * so animations only fire once per visit. `prefers-reduced-motion` is
 * respected (framer-motion does this automatically) so iOS users with
 * Reduce Motion get the static layout.
 *
 * The aside it sits inside has `overflow-y-auto` so on short laptop
 * screens the panel scrolls independently of the form.
 *
 * No imagery, no fake stats, no testimonials. Just what the product
 * actually does in five honest steps.
 */
const TRUST_BULLETS = [
  "Voice in. Quote out. Under 60 seconds.",
  "Built by a builder · Tauranga, NZ.",
  "Cancel anytime — we don't lock you in.",
];

const STEPS = [
  {
    icon: Microphone,
    label: "Talk",
    body: "Walk the site, hit record, describe what you'd quote in your head. No forms, no menus.",
  },
  {
    icon: Wrench,
    label: "Takeoff",
    body: "We catch the materials, labour hours, GST, exclusions, and assumptions before you send.",
  },
  {
    icon: PencilSimple,
    label: "Review",
    body: "Tweak any line in the editor. Compliance agent flags risky wording and missing details.",
  },
  {
    icon: PaperPlaneTilt,
    label: "Send",
    body: "Branded PDF emailed to your client. Public quote link they can sign on their phone.",
  },
  {
    icon: Receipt,
    label: "Track + invoice",
    body: "Accepted quotes convert to invoices you can send in a tap. Follow-up agent reminds you when to chase.",
  },
] as const;

const BUILT_FOR = [
  "Builders + chippies",
  "Sparkies + plumbers",
  "Painters + plasterers",
  "Landscapers + roofers",
] as const;

const SAFE = [
  "Read-only T2Q agents",
  "No quote sent without you tapping send",
  "No invoice created without your approval",
];

interface Props {
  /** Heading flavour. */
  kind: "signin" | "signup";
}

export function AuthMarketingPanel({ kind }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * Wave 12.4 — ambient auto-scroll of the marketing aside.
   *
   * The aside is a long scrollable story (hero → 5 steps → features →
   * trade tags → safety promise) so most users on a 13" laptop only
   * ever see the top third. Walks up to the nearest scrollable
   * ancestor (AuthSplitShell's `overflow-y-auto` div inside the aside)
   * and ping-pongs it at ~24 px/sec with a small pause at each end.
   *
   * Pauses on hover, wheel, and touch — resumes after a short idle.
   * Respects `prefers-reduced-motion`. Bails if the panel isn't
   * actually scrollable (e.g. mobile where the aside is
   * `display:none`, or a very tall viewport).
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = rootRef.current;
    if (!root) return;

    // Walk up to find the nearest scrollable ancestor.
    let cursor: HTMLElement | null = root.parentElement;
    while (cursor && cursor !== document.body) {
      const overflowY = window.getComputedStyle(cursor).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") break;
      cursor = cursor.parentElement;
    }
    if (!cursor) return;
    const scrollEl: HTMLElement = cursor;

    // Bail if there's nothing meaningful to scroll.
    if (scrollEl.scrollHeight - scrollEl.clientHeight < 80) return;

    const PX_PER_SEC = 24;
    const PAUSE_AT_ENDS_MS = 1800;
    const RESUME_AFTER_USER_MS = 4000;

    let rafId = 0;
    let lastTime = performance.now();
    let hoverPaused = false;
    let pauseUntil = 0;
    let direction: 1 | -1 = 1;

    function step(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (!hoverPaused && now >= pauseUntil) {
        const max = scrollEl.scrollHeight - scrollEl.clientHeight;
        if (max > 0) {
          const next = scrollEl.scrollTop + direction * PX_PER_SEC * dt;
          if (next >= max) {
            scrollEl.scrollTop = max;
            direction = -1;
            pauseUntil = now + PAUSE_AT_ENDS_MS;
          } else if (next <= 0) {
            scrollEl.scrollTop = 0;
            direction = 1;
            pauseUntil = now + PAUSE_AT_ENDS_MS;
          } else {
            scrollEl.scrollTop = next;
          }
        }
      }
      rafId = requestAnimationFrame(step);
    }

    function onUserScroll() {
      pauseUntil = performance.now() + RESUME_AFTER_USER_MS;
    }
    function onEnter() {
      hoverPaused = true;
    }
    function onLeave() {
      hoverPaused = false;
      lastTime = performance.now();
    }

    scrollEl.addEventListener("wheel", onUserScroll, { passive: true });
    scrollEl.addEventListener("touchstart", onUserScroll, { passive: true });
    scrollEl.addEventListener("mouseenter", onEnter);
    scrollEl.addEventListener("mouseleave", onLeave);

    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      scrollEl.removeEventListener("wheel", onUserScroll);
      scrollEl.removeEventListener("touchstart", onUserScroll);
      scrollEl.removeEventListener("mouseenter", onEnter);
      scrollEl.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const headline =
    kind === "signin" ? (
      <>
        Voice in.
        <br />
        <span className="text-brand">Quote out.</span>
        <br />
        Under 60 seconds.
      </>
    ) : (
      <>
        Start free.
        <br />
        <span className="text-brand">7 days.</span>
        <br />
        No card.
      </>
    );

  const subtitle =
    kind === "signin"
      ? "Built by a builder. No drag-and-drop, no menus, no time-suckers — just talk."
      : "90 seconds to set up. Voice your first quote tonight. Send it before knock-off.";

  return (
    <div ref={rootRef} className="relative flex h-full flex-col">
      {/* Hero — intentional NO motion on this block; it should land at
          first paint so the panel never looks blank. */}
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-hivis mb-3">
          {"// for the tools"}
        </div>
        <h2 className="font-display text-4xl uppercase tracking-tighter leading-[0.9] sm:text-5xl">
          {headline}
        </h2>
        <p className="mt-6 max-w-md text-ink-200 leading-relaxed">{subtitle}</p>

        <ul className="mt-8 max-w-md space-y-3">
          {TRUST_BULLETS.map((b) => (
            <li key={b} className="flex items-start gap-3 text-sm text-ink-100">
              <Check
                size={16}
                weight="bold"
                className="mt-0.5 shrink-0 text-brand"
              />
              {b}
            </li>
          ))}
        </ul>
      </div>

      {/* How it works — fade-up on scroll. */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -10% 0px" }}
        transition={{ duration: 0.5, ease: [0.21, 0.61, 0.27, 1] }}
        className="mt-14 max-w-md"
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
          {"// how it works"}
        </div>
        <h3 className="mt-2 font-display text-2xl uppercase tracking-tight text-white">
          Five steps. No paperwork.
        </h3>
        <ol className="mt-5 space-y-4">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{
                duration: 0.45,
                delay: i * 0.07,
                ease: [0.21, 0.61, 0.27, 1],
              }}
              className="flex items-start gap-3"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-ink-600 bg-ink-900 text-brand"
              >
                <s.icon size={16} weight="bold" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm uppercase tracking-tight text-white">
                  <span className="font-mono text-[10px] tracking-[0.2em] text-ink-400">
                    {String(i + 1).padStart(2, "0")} ·
                  </span>{" "}
                  {s.label}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-200">
                  {s.body}
                </p>
              </div>
            </motion.li>
          ))}
        </ol>
      </motion.section>

      {/* What you get — small feature strip. */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -10% 0px" }}
        transition={{ duration: 0.5, ease: [0.21, 0.61, 0.27, 1] }}
        className="mt-14 max-w-md"
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
          {"// what you get"}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Tile
            icon={<Lightning size={16} weight="bold" />}
            title="Branded PDFs"
            body="Your logo, business details, GST number, signed by the client on their phone."
          />
          <Tile
            icon={<ShieldCheck size={16} weight="bold" />}
            title="Compliance Agent"
            body="Flags missing scope, exclusions, GST, and NZ building notes before you send."
          />
          <Tile
            icon={<Microphone size={16} weight="bold" />}
            title="Voice → quote"
            body="T2Q transcribes the voice memo and extracts scope. You stay in the editor."
          />
          <Tile
            icon={<Receipt size={16} weight="bold" />}
            title="Materials library"
            body="Capture supplier prices once. Quotes reuse them instead of T2Q estimates."
          />
        </div>
      </motion.section>

      {/* Built for which trades */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -10% 0px" }}
        transition={{ duration: 0.5, ease: [0.21, 0.61, 0.27, 1] }}
        className="mt-14 max-w-md"
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
          {"// built for"}
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {BUILT_FOR.map((t) => (
            <li
              key={t}
              className="rounded-sm border border-ink-600 bg-ink-900/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-200"
            >
              {t}
            </li>
          ))}
        </ul>
      </motion.section>

      {/* Safety promise */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -10% 0px" }}
        transition={{ duration: 0.5, ease: [0.21, 0.61, 0.27, 1] }}
        className="mt-14 max-w-md rounded-sm border border-brand/30 bg-brand/5 p-4"
      >
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
          <ShieldCheck size={12} weight="bold" />
          you stay in control
        </div>
        <ul className="mt-3 space-y-2">
          {SAFE.map((s) => (
            <li
              key={s}
              className="flex items-start gap-2 text-sm leading-relaxed text-ink-100"
            >
              <Check
                size={14}
                weight="bold"
                className="mt-0.5 shrink-0 text-brand"
              />
              {s}
            </li>
          ))}
        </ul>
      </motion.section>

      <div className="h-8" />
    </div>
  );
}

function Tile({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-sm border border-ink-700 bg-ink-900/60 p-3">
      <span
        aria-hidden="true"
        className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand"
      >
        {icon}
      </span>
      <p className="mt-2 font-display text-sm uppercase tracking-tight text-white">
        {title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-200">{body}</p>
    </div>
  );
}
