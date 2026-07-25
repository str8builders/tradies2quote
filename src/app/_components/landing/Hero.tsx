"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Fragment, useRef } from "react";
import { FileText, Receipt, ArrowRight, Check } from "@phosphor-icons/react";
import TapeProgress from "./TapeProgress";
import { Magnetic } from "./Magnetic";
import InstallPWAButton from "./InstallPWAButton";

// Wave 19.3 — Hero motion amplification.
//
// The Hero already had a 3D phone with cursor parallax + animated
// background blobs, but the headline, CTAs and floating cards were
// doing flat fade+y entrances that read as polite. This pass swaps
// them for spring-driven, overlapping motion that matches the
// brutalist tradie voice:
//
//   - H1 white lines slide up word-by-word out of an overflow-hidden
//     line wrapper (each word as its own motion.span).
//   - The orange brand line ("Send the quote.") gets a left-to-right
//     clip-path wipe instead of a stagger, so it reads as the
//     showpiece phrase rather than blending in.
//   - Eyebrow drops with a spring + scale overshoot.
//   - Subhead, CTA row and trust strip cascade in with bigger
//     distances (40-50px) and overlapping delays.
//   - Phone entrance gains a pronounced spring drop (y:80, rotate:-8°)
//     and the entire phone column then floats gently forever.
//   - PAID stamp slams in with rotation overshoot; invoice card
//     swings up from below.
//
// useReducedMotion() short-circuits every animation to a flat opacity
// fade for users who have prefers-reduced-motion: reduce.
const HERO_LINE_1 = ["Talk", "the", "job."] as const;
const HERO_LINE_2 = ["Send", "the", "quote."] as const;
const HERO_LINE_3 = ["Get", "paid", "faster."] as const;

export function Hero() {
  const stageRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  function onMove(e: React.MouseEvent) {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
  }
  function onLeave() {
    const el = stageRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  // Word variant — used by every staggered headline word. With
  // reduce-motion on, collapse to a flat opacity fade.
  //
  // Wave 19.6 — switched from y:"115%" (which required the parent
  // line-wrapper to be `overflow-hidden` so the words could "slide
  // up out of a clipped band") to a small absolute y:30 translate.
  // The clipped-wrapper trick broke at mobile widths because each
  // H1 line wraps to two visual lines below 640px and the
  // `overflow-hidden` on the wrapper hid the second wrapped line —
  // so on iPhone the hero rendered as "TALK THE [empty] GET PAID"
  // with the periods, "JOB.", "SEND THE QUOTE." and "FASTER." all
  // invisibly clipped. Plain y:30 + opacity gives the same
  // perceptual slide-up effect without needing to clip the parent.
  const word: Variants = reduce
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.25 } },
      }
    : {
        hidden: { y: 30, opacity: 0 },
        visible: {
          y: 0,
          opacity: 1,
          transition: { type: "spring", stiffness: 110, damping: 16 },
        },
      };

  // Container variant for a stagger-children line. Each line owns its
  // own delay so we can overlap line 2's wipe with the tail of line 1
  // and the head of line 3.
  const lineContainer = (delay: number): Variants => ({
    hidden: {},
    visible: {
      transition: {
        delayChildren: reduce ? 0 : delay,
        staggerChildren: reduce ? 0 : 0.07,
      },
    },
  });

  // Inline animation prop bundles. Spreading these onto each motion
  // component keeps the JSX readable.
  const eyebrowAnim = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4 } }
    : {
        initial: { opacity: 0, y: -24, scale: 0.85 },
        animate: { opacity: 1, y: 0, scale: 1 },
        transition: { type: "spring" as const, stiffness: 230, damping: 14, delay: 0.05 },
      };

  const brandWipe = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, delay: 0.4 } }
    : {
        initial: { clipPath: "inset(0 100% 0 0)" },
        animate: { clipPath: "inset(0 0% 0 0)" },
        transition: { duration: 0.85, delay: 0.55, ease: [0.65, 0, 0.35, 1] as const },
      };

  const subheadAnim = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, delay: 0.45 } }
    : {
        initial: { opacity: 0, y: 50 },
        animate: { opacity: 1, y: 0 },
        transition: { type: "spring" as const, stiffness: 80, damping: 18, delay: 0.95 },
      };

  const ctaRowAnim = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, delay: 0.6 } }
    : {
        initial: { opacity: 0, y: 60 },
        animate: { opacity: 1, y: 0 },
        transition: { type: "spring" as const, stiffness: 110, damping: 13, delay: 1.1 },
      };

  // Wave 19.7 — dropped the x:-50 slide on the trust strip. On
  // mobile if framer-motion's `animate` didn't complete (Safari
  // deferral, scroll-during-mount race), the strip got stuck 50px
  // to the left of its parent. With `flex flex-wrap` that meant the
  // wrapped second line ("Built for tradies") inherited the offset
  // and "BUI" disappeared off the left edge of the viewport. Plain
  // opacity fade is bulletproof — the element always lands at its
  // natural x:0 regardless of motion completion. Also pulled the
  // delay down from 1.35s to 0.95s so the strip appears with the
  // CTA cascade rather than long after.
  const trustStripAnim = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, delay: 0.6 } }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.6, delay: 0.95 },
      };

  // Phone column — outer wrapper does the slow infinite idle float;
  // inner div does the entrance. Cursor parallax stays on the inner
  // div (untouched) so the float and parallax compose without fighting.
  const phoneIdleAnim = reduce
    ? {}
    : {
        animate: { y: [0, -10, 0] as number[] },
        transition: {
          duration: 5.5,
          repeat: Infinity,
          ease: "easeInOut" as const,
          delay: 1.6,
        },
      };

  const phoneEntranceAnim = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.5 } }
    : {
        initial: { opacity: 0, scale: 0.85, y: 80, rotate: -8 },
        animate: { opacity: 1, scale: 1, y: 0, rotate: 0 },
        transition: { type: "spring" as const, stiffness: 70, damping: 13, delay: 0.3 },
      };

  const paidStampAnim = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.5, delay: 0.9 } }
    : {
        initial: { opacity: 0, scale: 0.4, rotate: -45 },
        animate: { opacity: 1, scale: 1, rotate: -12 },
        transition: { type: "spring" as const, stiffness: 200, damping: 11, delay: 1.3 },
      };

  const invoiceCardAnim = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.5, delay: 0.7 } }
    : {
        initial: { opacity: 0, y: 90, rotate: 18 },
        animate: { opacity: 1, y: 0, rotate: 3 },
        transition: { type: "spring" as const, stiffness: 90, damping: 12, delay: 1.05 },
      };

  return (
    <section
      className="relative overflow-hidden border-b border-ink-600 bg-ink-800"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="absolute inset-0 t2q-aurora pointer-events-none" />
      <div className="absolute inset-0 t2q-grid-bg pointer-events-none opacity-50" />
      <div className="absolute -top-40 -right-40 w-[560px] h-[560px] rounded-full bg-brand/30 blur-3xl pointer-events-none animate-blob" />
      <div className="absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full bg-hivis/15 blur-3xl pointer-events-none animate-blob-slow" />
      <div className="absolute top-1/3 left-1/2 w-[420px] h-[420px] rounded-full bg-brand/10 blur-3xl pointer-events-none animate-blob-mid" />

      <div className="relative max-w-7xl mx-auto px-6 md:px-12 pt-24 pb-12 lg:pt-32 lg:pb-16 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7">
          <motion.div
            {...eyebrowAnim}
            className="inline-flex items-center gap-2 mb-6 rounded-lg border border-white/10 bg-ink-800/90 px-3 py-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-ink-200">
              Built by a builder · New Zealand · NZ-first
            </span>
          </motion.div>

          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl xl:text-8xl tracking-tighter leading-[0.9] text-white uppercase">
            {/* Wave 19.6 — dropped overflow-hidden + pb/-mb hack from
                each line wrapper. At mobile widths the H1 wraps each
                line to two visual lines and overflow-hidden was clipping
                the second wrapped line, hiding "JOB.", the entire orange
                "SEND THE QUOTE." line, and "FASTER." on iPhone. The word
                slide-up is now a plain y:30 translate which doesn't
                require a clipped parent. The brand-line clip-path wipe
                survives multi-line wrapping fine — the wipe direction
                still reads left-to-right because clip-path on a block
                element operates on its bounding box. */}
            {/* Wave 19.7 — added real space text nodes between word
                spans (instead of relying on mr-[0.22em] margin alone)
                so screen readers and SEO crawlers see "Talk the job"
                as three words, not "Talkthejob" as one. The Fragment
                wrapper carries the React key; the space is a sibling
                text node between motion spans, so visual spacing comes
                from the browser's natural word-spacing rather than a
                manual margin. */}
            <motion.span
              variants={lineContainer(0.1)}
              initial="hidden"
              animate="visible"
              className="block"
            >
              {HERO_LINE_1.map((w, i) => (
                <Fragment key={`l1-${i}`}>
                  <motion.span variants={word} className="inline-block">
                    {w}
                  </motion.span>
                  {i < HERO_LINE_1.length - 1 && " "}
                </Fragment>
              ))}
            </motion.span>

            {/* Line 2 — orange wipes in from the left via clip-path. */}
            <motion.span
              {...brandWipe}
              className="block text-brand"
            >
              {HERO_LINE_2.join(" ")}
            </motion.span>

            {/* Line 3 — the payoff line. Rendered in hi-vis yellow so the
                "get paid faster" promise pops off the dark hero (it was
                previously text-ink-900, i.e. near-black on black, so it
                barely showed). White → brand orange → hi-vis gives the
                three lines a deliberate escalating hierarchy. */}
            <motion.span
              variants={lineContainer(0.95)}
              initial="hidden"
              animate="visible"
              className="block text-hivis"
            >
              {HERO_LINE_3.map((w, i) => (
                <Fragment key={`l3-${i}`}>
                  <motion.span variants={word} className="inline-block">
                    {w}
                  </motion.span>
                  {i < HERO_LINE_3.length - 1 && " "}
                </Fragment>
              ))}
            </motion.span>
          </h1>

          <motion.p
            {...subheadAnim}
            className="mt-7 text-lg md:text-xl text-ink-200 max-w-xl leading-relaxed"
          >
            Stop losing your weekends. Talk through the job once and get a branded
            first quote draft — materials, labour, GST and terms — ready to review
            before it lands in your client&apos;s inbox.
          </motion.p>

          <motion.div
            {...ctaRowAnim}
            className="mt-10 flex flex-wrap gap-4"
          >
            <Magnetic strength={0.22}>
              <Link
                href="/signup"
                data-testid="hero-cta-start-trial"
                className="t2q-btn-primary"
              >
                <FileText size={20} weight="bold" /> Start free trial
              </Link>
            </Magnetic>
            <a
              href="#how"
              data-testid="hero-cta-how-it-works"
              className="t2q-btn-ghost"
            >
              See how it works <ArrowRight size={20} weight="bold" />
            </a>
            {/* Wave 36 — visible "Install on phone" CTA on the landing.
                The InstallNudge toast is snoozable + user-dismissable so
                some users never see it; an explicit hero-row button
                guarantees the path is discoverable. On Chromium it
                fires the native install prompt; on iOS Safari it opens
                an Add-to-Home-Screen instruction sheet (since iOS
                doesn't expose beforeinstallprompt for PWAs). The
                button renders nothing when the app is already
                installed (standalone display-mode) so the row stays
                clean for return visitors. */}
            <InstallPWAButton variant="hero" />
          </motion.div>

          {/* Wave 36 — trust strip was overflowing the iPhone screen
              ("NO CREDIT CARD · CANCEL ANYTIME" running off the right
              edge). Cause: gap-6 (24px) + 0.18em letter-spacing +
              text-xs over 3 long uppercase phrases. flex-wrap was set
              but each phrase + tracking made the row too wide to wrap
              gracefully. Fix: tighter spacing + smaller text on
              mobile; original desktop sizing kept behind sm:. */}
          <motion.div
            {...trustStripAnim}
            className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-ink-200 font-mono text-[10px] uppercase tracking-[0.12em] sm:gap-x-6 sm:gap-y-3 sm:text-xs sm:tracking-[0.18em]"
          >
            <span>7-day free trial</span>
            <span aria-hidden="true" className="w-1 h-1 rounded-full bg-ink-500" />
            <span>GST 15% ready</span>
            <span aria-hidden="true" className="w-1 h-1 rounded-full bg-ink-500" />
            <span>Review before sending</span>
            <span aria-hidden="true" className="w-1 h-1 rounded-full bg-ink-500" />
            <span>Built for NZ tradies</span>
          </motion.div>
        </div>

        {/* 3D phone mockup. Wrapped in an outer motion.div that does
            the slow infinite idle float (y: 0 → -10 → 0). The inner
            motion.div handles the dramatic entrance; cursor parallax
            stays on the same inner div via the inline transform that
            reads --rx/--ry CSS variables set by onMove on the parent
            section. The three layers compose without fighting: outer
            translates Y, inner does scale/rotate entrance, inline
            style does the X/Y rotation parallax. */}
        <div className="lg:col-span-5 relative">
          <motion.div {...phoneIdleAnim}>
            <div
              ref={stageRef}
              className="t2q-stage relative mx-auto w-full max-w-[380px] aspect-[9/19]"
            >
              <motion.div
                {...phoneEntranceAnim}
                className="relative w-full h-full"
                style={{
                  transform: "rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateZ(0)",
                  transition: "transform 200ms ease-out",
                  filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.55))",
                }}
              >
              {/* Titanium frame */}
              <div
                className="absolute inset-0 rounded-[48px]"
                style={{
                  background:
                    "linear-gradient(140deg, #2b2b2b 0%, #0e0e0e 30%, #1a1a1a 55%, #050505 100%)",
                  boxShadow:
                    "inset 0 0 0 1.5px #3a3a3a, inset 0 1px 0 rgba(255,255,255,0.08), 0 30px 60px -20px rgba(0,0,0,0.7)",
                }}
              />
              {/* Side buttons */}
              <div className="absolute -left-[3px] top-[88px] w-[3px] h-7 rounded-l-sm bg-ink-700" />
              <div className="absolute -left-[3px] top-[130px] w-[3px] h-12 rounded-l-sm bg-ink-700" />
              <div className="absolute -left-[3px] top-[190px] w-[3px] h-12 rounded-l-sm bg-ink-700" />
              <div className="absolute -right-[3px] top-[150px] w-[3px] h-16 rounded-r-sm bg-ink-700" />

              {/* Inner bezel */}
              <div className="absolute inset-[6px] rounded-[42px] bg-black overflow-hidden">
                <div className="absolute inset-[3px] rounded-[39px] bg-white overflow-hidden">
                  {/* Status bar — decorative chrome inside the phone mockup.
                      Screen readers shouldn't announce "9:41 5G" out of
                      context, so the whole bar is aria-hidden. */}
                  <div
                    aria-hidden="true"
                    className="relative z-20 flex justify-between items-center px-7 pt-2.5 pb-1 text-[10px] font-mono text-ink-900 bg-white"
                  >
                    <span className="font-semibold tracking-tight">9:41</span>
                    <span className="flex items-center gap-1.5">
                      <span className="flex items-end gap-[1.5px] h-2.5">
                        <span className="w-[2px] h-1 bg-ink-900 rounded-[1px]" />
                        <span className="w-[2px] h-1.5 bg-ink-900 rounded-[1px]" />
                        <span className="w-[2px] h-2 bg-ink-900 rounded-[1px]" />
                        <span className="w-[2px] h-2.5 bg-ink-900 rounded-[1px]" />
                      </span>
                      <span className="text-[9px] font-semibold">5G</span>
                      <span className="relative w-6 h-3 border border-ink-900 rounded-[3px] flex items-center pl-[1px]">
                        <span className="block h-[7px] w-[16px] bg-ink-900 rounded-[1px]" />
                        <span className="absolute -right-[3px] top-1/2 -translate-y-1/2 w-[2px] h-1.5 bg-ink-900 rounded-r-sm" />
                      </span>
                    </span>
                  </div>

                  {/* Dynamic Island */}
                  <div className="absolute top-[7px] left-1/2 -translate-x-1/2 z-30 w-[110px] h-[30px] bg-black rounded-full flex items-center justify-end pr-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                  </div>

                  {/* App header */}
                  <div className="relative z-10 px-4 pt-2 pb-3 bg-white border-b border-ink-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-brand grid place-items-center rounded-sm">
                          <FileText size={14} weight="bold" className="text-white" />
                        </div>
                        <div>
                          <div className="font-display text-[11px] uppercase tracking-tight leading-none">
                            tradies2Quote
                          </div>
                          <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-ink-500 mt-0.5">
                            Bayside Builders
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[8px] uppercase tracking-[0.2em] px-1.5 py-0.5 bg-brand text-white rounded-[2px]">
                        Q-202602-9F
                      </span>
                    </div>
                  </div>

                  {/* Auto-scrolling quote body */}
                  <div className="absolute left-0 right-0 top-[78px] bottom-[58px] overflow-hidden bg-white">
                    <div className="pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white to-transparent z-10" />
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent z-10" />
                    <div className="t2q-phone-scroll">
                      {[0, 1].map((loop) => (
                        <div key={loop} className="text-ink-900">
                          <div className="px-4 py-4 bg-ink-50">
                            <div className="font-mono text-[8px] uppercase tracking-[0.22em] text-brand">
                              {"// quote"}
                            </div>
                            <div className="font-display text-lg uppercase tracking-tighter leading-tight mt-1">
                              Bathroom Reno —
                              <br />
                              Vanity, Tiles &amp; Fixtures
                            </div>
                            <div className="mt-2 text-[10px] text-ink-500 leading-snug">
                              For Sarah K · 12 Beach Rd, Auckland
                              <br />
                              Issued 06 Feb 2026 · Valid 30 days
                            </div>
                            <div className="mt-2 inline-block rounded-sm bg-ink-200 px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.18em] text-ink-600">
                              Demo screen · your numbers appear after setup
                            </div>
                            <div className="mt-3 flex items-end justify-between">
                              <div>
                                <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-ink-500">
                                  Total (NZD)
                                </div>
                                <div className="font-display text-2xl text-brand leading-none mt-0.5">
                                  $4,820.00
                                </div>
                              </div>
                              <div className="px-2 py-1 bg-hivis text-ink-900 font-display text-[9px] uppercase tracking-tight rounded-sm">
                                GST inc.
                              </div>
                            </div>
                          </div>
                          <div className="px-4 pt-4 pb-1">
                            <div className="font-mono text-[8px] uppercase tracking-[0.22em] text-ink-500">
                              {"// materials"}
                            </div>
                          </div>
                          {[
                            { d: "Vanity unit 900mm + soft-close", v: 980 },
                            { d: "Mixer tap (brushed brass)", v: 220 },
                            { d: "Floor tiles 600x600 porcelain · 6m²", v: 540 },
                            { d: "Tile adhesive + grout + sealant", v: 145 },
                            { d: "Rainfall shower head + arm", v: 380 },
                            { d: "Waterproof membrane + primer", v: 165 },
                          ].map((it, i) => (
                            <div
                              key={`m${i}`}
                              className="px-4 py-2 flex items-center justify-between text-[11px] border-b border-ink-100"
                            >
                              <div className="flex items-center gap-2">
                                <Check size={12} weight="bold" className="text-brand shrink-0" />
                                <span className="text-ink-900 leading-snug">{it.d}</span>
                              </div>
                              <span className="font-mono text-ink-900">${it.v}</span>
                            </div>
                          ))}
                          <div className="px-4 pt-4 pb-1">
                            <div className="font-mono text-[8px] uppercase tracking-[0.22em] text-ink-500">
                              {"// labour"}
                            </div>
                          </div>
                          {[
                            { d: "Demolition + removal (1 day)", v: 480 },
                            { d: "Plumbing rough-in & connect", v: 620 },
                            { d: "Tiling install · 2 days", v: 1180 },
                            { d: "Painting + prep · 1 day", v: 480 },
                            { d: "Site clean & rubbish removal", v: 180 },
                          ].map((it, i) => (
                            <div
                              key={`l${i}`}
                              className="px-4 py-2 flex items-center justify-between text-[11px] border-b border-ink-100"
                            >
                              <div className="flex items-center gap-2">
                                <Check size={12} weight="bold" className="text-brand shrink-0" />
                                <span className="text-ink-900 leading-snug">{it.d}</span>
                              </div>
                              <span className="font-mono text-ink-900">${it.v}</span>
                            </div>
                          ))}
                          <div className="px-4 py-3 bg-ink-50 border-y border-ink-200 mt-3">
                            <div className="flex justify-between text-[10px] text-ink-500 font-mono">
                              <span>Subtotal</span>
                              <span>$4,191.30</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-ink-500 font-mono mt-1">
                              <span>GST (15%)</span>
                              <span>$628.70</span>
                            </div>
                            <div className="flex justify-between font-display text-base mt-2 pt-2 border-t border-ink-200">
                              <span className="uppercase tracking-tight">Total</span>
                              <span className="text-brand">$4,820.00</span>
                            </div>
                          </div>
                          <div className="px-4 py-3">
                            <div className="font-mono text-[8px] uppercase tracking-[0.22em] text-ink-500 mb-1">
                              {"// terms"}
                            </div>
                            <p className="text-[10px] text-ink-600 leading-snug">
                              Quote valid for 30 days. 30% deposit required to confirm booking.
                              Final invoice on completion.
                            </p>
                          </div>
                          <div className="px-4 py-4 bg-ink-900 text-white">
                            <div className="font-mono text-[8px] uppercase tracking-[0.22em] text-hivis">
                              {"// approve"}
                            </div>
                            <div className="font-display text-sm uppercase tracking-tight mt-1">
                              Tap to accept &amp; book
                            </div>
                            <div className="mt-2 h-9 bg-brand text-ink-900 grid place-items-center rounded-sm font-display text-[11px] uppercase tracking-tight">
                              Accept quote — book in
                            </div>
                          </div>
                          <div className="h-6" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bottom dock */}
                  <div className="absolute left-0 right-0 bottom-0 z-20 px-4 py-2.5 bg-white border-t border-ink-200 flex gap-2">
                    <button className="flex-1 h-9 bg-brand text-white font-display text-[10px] uppercase tracking-tight rounded-sm">
                      Send to client
                    </button>
                    <button className="px-3 h-9 bg-ink-100 border border-ink-200 font-display text-[10px] uppercase tracking-tight rounded-sm">
                      Edit
                    </button>
                  </div>
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-24 h-[3px] rounded-full bg-ink-900/70 z-30" />

                  {/* Glossy reflection overlay — sits above everything inside the screen */}
                  <div className="pointer-events-none absolute inset-0 t2q-phone-glare z-40 rounded-[39px]" />
                </div>
              </div>
            </motion.div>

            {/* Floating PAID stamp — slams in with rotation overshoot
                (-45° → -12°) on a high-stiffness spring for snap. */}
            <motion.div
              {...paidStampAnim}
              style={{ zIndex: 30 }}
              className="hidden lg:block absolute -left-20 top-12 w-32 px-4 py-3 bg-hivis text-ink-900 border-2 border-ink-900 t2q-shadow-brutal"
            >
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] opacity-70">
                Status
              </div>
              <div className="font-display text-2xl uppercase tracking-tighter leading-none">
                PAID
              </div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] opacity-70">
                3 days · NZD
              </div>
            </motion.div>

            {/* Floating invoice card — swings up from below (y:90,
                rotate:18°) and lands at rotate:3°. */}
            <motion.div
              {...invoiceCardAnim}
              style={{ zIndex: 30 }}
              className="hidden lg:block absolute -right-12 -bottom-12 w-56 bg-ink-900 text-white p-4 rounded-sm border border-ink-600 t2q-shadow-brutal-yellow"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-display text-[10px] uppercase tracking-tight text-hivis">
                  INV-202602-A4
                </span>
                <Receipt size={16} weight="bold" className="text-hivis" />
              </div>
              <div className="font-display text-xl">$4,820.00</div>
              {/* Wave 14 audit — dropped the "auto-reminders on"
                  claim. There is no reminder backend; that lands in
                  Wave 15 with cron + Resend. The mockup card now
                  reads honestly. */}
              <div className="text-[9px] text-ink-400 font-mono uppercase tracking-[0.18em] mt-1">
                Due in 7 days
              </div>
              <div className="mt-3 h-1 bg-ink-700">
                <div className="h-full bg-hivis w-[62%]" />
              </div>
              <div className="mt-2 text-[9px] font-mono text-ink-400 uppercase tracking-[0.18em]">
                Sent · viewed by client
              </div>
            </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Wave 12.5 — measuring-tape ambient loader. Replaces the old
          3D voice-waveform bars at the bottom of the hero. Same
          `TapeProgress` widget the splash screen uses, in indeterminate
          mode so the orange needle sweeps 0 → 100mm in a loop. The
          tradie measuring-tape motif now threads from first-load
          splash → marketing surface → in-app "generating quote..."
          screen, so the visual language is consistent end-to-end. */}
      <div
        aria-hidden="true"
        className="relative z-[1] hidden md:flex justify-center pb-14 lg:pb-20 px-6"
      >
        <TapeProgress
          width={680}
          height={36}
          label="// voice in · quote out · live"
          showReadout
          testId="hero-tape"
        />
      </div>
    </section>
  );
}
