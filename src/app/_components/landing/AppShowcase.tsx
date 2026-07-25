"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  AmbientLight,
  DirectionalLight,
  EdgesGeometry,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import "./AppShowcase.css";

// ───────────────────────────────────────────────────────────────────────────
// AppShowcase — "Inside Tradies2Quote" animated tour.
//
// Ported from a standalone self-contained HTML file:
//   - 9 inline base64 screenshots → /public/screens/screen-1..9.jpg.
//   - The <style> block → AppShowcase.css (scoped under .t2q-tour, app fonts).
//   - The inline <script> IIFE → the single useEffect below, scoped to a root
//     ref, with full teardown (interval, rAF, every listener, generated dots,
//     and the WebGL renderer + geometries + materials).
//   - Three.js from cdnjs → the npm `three` package, importing only what's used.
// ───────────────────────────────────────────────────────────────────────────

type Callout = {
  cls?: "green" | "yellow";
  style: CSSProperties;
  pre: string;
  text: string;
};

type Slide = {
  tag: string;
  label: string;
  headline: ReactNode;
  sub: ReactNode;
  feats?: string[];
  screen?: string;
  callouts: Callout[];
  cta?: boolean;
};

const SLIDES: Slide[] = [
  {
    tag: "// 01 · MEET THE TOOL",
    label: "// SPLASH",
    headline: (
      <>
        Inside
        <br />
        tradies<span className="o">2</span>quote.
      </>
    ),
    sub: (
      <>
        A ten-stop tour of the app — built by a builder, in New Zealand. Voice
        in, quote out, in under a minute.{" "}
        <strong>
          Currently NZ builders only — more trades and countries coming soon.
        </strong>
      </>
    ),
    feats: [
      "Voice in. Quote out. Under 60 seconds.",
      "NZ-first · GST 15% baked in",
      "Quote → invoice in one tap",
    ],
    screen: "/screens/screen-1.jpg",
    callouts: [
      { style: { top: "14%", left: "-10%" }, pre: "// MADE IN NZ", text: "By a builder, for builders." },
      { cls: "green", style: { bottom: "18%", right: "-10%" }, pre: "// FREE TRIAL", text: "7 days on us." },
    ],
  },
  {
    tag: "// 02 · DASHBOARD",
    label: "// HOME · DASHBOARD",
    headline: (
      <>
        Your day,
        <br />
        on <span className="o">one screen.</span>
      </>
    ),
    sub: (
      <>
        Pipeline tiles for every status — Draft · Sent · Viewed · Accepted ·
        Scheduled · In Progress · Completed. Plus quotes-this-month and
        total-quoted — all on the home screen.
      </>
    ),
    feats: [
      "Live pipeline · 7 statuses tracked",
      "$44,803.49 quoted across 8 jobs this month",
      "Onboarding nudges to boost quote accuracy",
    ],
    screen: "/screens/screen-2.jpg",
    callouts: [
      { style: { top: "12%", left: "-12%" }, pre: "// PIPELINE · 7 STATUSES", text: "Draft to completed" },
      { style: { bottom: "22%", right: "-12%" }, pre: "// QUOTED THIS MONTH", text: "$44,803.49" },
    ],
  },
  {
    tag: "// 03 · QUOTES LIBRARY",
    label: "// QUOTES LIBRARY",
    headline: (
      <>
        Every quote,
        <br />
        <span className="o">filed and ready.</span>
      </>
    ),
    sub: (
      <>
        Search, filter, archive — everything you’ve quoted, billed, or chased
        lives in one place. Tap any quote to pick up where you left off.
      </>
    ),
    feats: [
      "Search by quote # · client · or job",
      "Filter chips · All · Draft · Sent · Accepted · Declined · Archived",
      "One tap to start a new quote",
    ],
    screen: "/screens/screen-3.jpg",
    callouts: [
      { style: { top: "16%", right: "-12%" }, pre: "// + NEW QUOTE", text: "Always one tap away" },
      { style: { bottom: "22%", left: "-12%" }, pre: "// FILTER CHIPS", text: "All · Draft · Sent · Accepted" },
    ],
  },
  {
    tag: "// STEP 1 · DESCRIBE",
    label: "// STEP 1 · DESCRIBE",
    headline: (
      <>
        Talk through
        <br />
        the <span className="o">job.</span>
      </>
    ),
    sub: (
      <>
        Voice, type, or scan a hand-drawn plan — your call. Tap record, walk the
        site, describe what you’d quote. Big buttons for muddy fingers and
        bright sun.
      </>
    ),
    feats: [
      "Three input modes · Voice · Type · Scan",
      "Up to 3 minutes per recording",
      "Auto-saves the second you tap record",
    ],
    screen: "/screens/screen-4.jpg",
    callouts: [
      { style: { top: "26%", left: "-12%" }, pre: "// PULSE · LIVE", text: "Tap the mic to record" },
      { style: { bottom: "18%", right: "-10%" }, pre: "// 3 INPUT MODES", text: "Voice · Type · Scan" },
    ],
  },
  {
    tag: "// 05 · MATERIALS LIBRARY",
    label: "// MATERIALS · SUPPLIERS",
    headline: (
      <>
        Your prices.
        <br />
        <span className="o">Your margins.</span>
      </>
    ),
    sub: (
      <>
        Save your common materials with prices once — quotes will use those
        instead of T2Q estimates. Quick-access tiles for Bunnings, Mitre 10,
        ITM, PlaceMakers.
      </>
    ),
    feats: [
      "Supplier capture · share or paste a product URL",
      "Scan a supplier quote with the camera",
      "Import CSV for bulk library loads",
    ],
    screen: "/screens/screen-5.jpg",
    callouts: [
      { style: { top: "14%", left: "-12%" }, pre: "// QUICK ACCESS", text: "4 NZ suppliers preset" },
      { style: { bottom: "22%", right: "-12%" }, pre: "// SUPPLIER CAPTURE", text: "Share · paste · scan" },
    ],
  },
  {
    tag: "// STEP 2 · QUOTE BUILDS ITSELF",
    label: "// STEP 2 · QUOTE BUILDS ITSELF",
    headline: (
      <>
        T2Q does
        <br />
        the <span className="o">math.</span>
      </>
    ),
    sub: (
      <>
        Materials, markup, labour, GST — laid out the way clients expect. The{" "}
        <strong>total in orange</strong> matches across the dashboard, the
        editor, and the quote your client sees.
      </>
    ),
    feats: [
      "Materials + markup + labour split out clearly",
      "GST 15% applied automatically (NZ)",
      "Edit any line before it goes anywhere",
    ],
    screen: "/screens/screen-6.jpg",
    callouts: [
      { style: { top: "32%", right: "-12%" }, pre: "// TOTAL · BRAND ORANGE", text: "$2,306.67 NZD" },
      { style: { bottom: "22%", left: "-12%" }, pre: "// GST 15% · NZ", text: "Baked into every line" },
    ],
  },
  {
    tag: "// STEP 3 · REVIEW BEFORE SENDING",
    label: "// STEP 3 · REVIEW",
    headline: (
      <>
        We catch
        <br />
        the <span className="y">gaps.</span>
      </>
    ),
    sub: (
      <>
        Every quote ships with a ‘review these’ panel — missing client name,
        assumed measurements, unconfirmed materials. Yellow flags only. You
        decide.
      </>
    ),
    feats: [
      "Required-field highlights (e.g. client name)",
      "Assumption flags (wall height, timber species, etc.)",
      "Nothing leaves until you tap send",
    ],
    screen: "/screens/screen-7.jpg",
    callouts: [
      { cls: "yellow", style: { top: "14%", left: "-12%" }, pre: "// REQUIRED FIELDS", text: "Highlighted in hi-vis" },
      { cls: "yellow", style: { bottom: "22%", right: "-12%" }, pre: "// ASSUMPTION FLAGS", text: "Catch what you’d miss" },
    ],
  },
  {
    tag: "// 08 · SCHEDULE",
    label: "// JOBS · SCHEDULE",
    headline: (
      <>
        Never miss
        <br />
        a <span className="o">job.</span>
      </>
    ),
    sub: (
      <>
        Schedule a job straight from an accepted quote — or add a note on any
        day. Calendar lives on your home screen alongside the pipeline.
      </>
    ),
    feats: [
      "Month view · tap a day to schedule",
      "Day notes · log site visits, deliveries, anything",
      "Schedules pull straight from accepted quotes",
    ],
    screen: "/screens/screen-8.jpg",
    callouts: [
      { style: { top: "26%", right: "-12%" }, pre: "// TODAY · 21 MAY", text: "Thursday highlight" },
      { cls: "green", style: { bottom: "18%", left: "-12%" }, pre: "// FROM ACCEPTED QUOTE", text: "Auto-schedules to calendar" },
    ],
  },
  {
    tag: "// 09 · INVOICES",
    label: "// INVOICES · MONEY IN",
    headline: (
      <>
        Convert.
        <br />
        <span className="o">Get paid.</span>
      </>
    ),
    sub: (
      <>
        Every invoice you’ve ever drafted, sent, or marked paid — filtered by
        status. Convert any accepted quote into an invoice in one tap.
      </>
    ),
    feats: [
      "6 status filters · All · Draft · Sent · Paid · Overdue · Cancelled",
      "Coloured tiles · spot overdue at a glance",
      "GST split on every invoice PDF",
    ],
    screen: "/screens/screen-9.jpg",
    callouts: [
      { cls: "green", style: { top: "18%", right: "-12%" }, pre: "// PAID", text: "Green means cash in" },
      { style: { bottom: "22%", left: "-12%" }, pre: "// OVERDUE", text: "Spot it at a glance" },
    ],
  },
  {
    tag: "// START YOUR TRIAL",
    label: "// START YOUR TRIAL",
    cta: true,
    headline: (
      <>
        Get quoting
        <br />
        at <span className="o">site speed.</span>
      </>
    ),
    sub: (
      <>
        Start with a <strong>7-day free trial</strong> — every feature
        unlocked, no credit card to start, cancel anytime. We onboard you
        personally.
      </>
    ),
    callouts: [
      { style: { top: "18%", left: "-10%" }, pre: "// 7-DAY FREE TRIAL", text: "No credit card to start" },
      { cls: "green", style: { bottom: "18%", right: "-10%" }, pre: "// PERSONAL ONBOARDING", text: "We’ll walk you through" },
    ],
  },
];

function Callouts({ items }: { items: Callout[] }) {
  return (
    <>
      {items.map((c, i) => (
        <div key={i} className={`callout${c.cls ? " " + c.cls : ""}`} style={c.style}>
          <span className="pre">{c.pre}</span>
          {c.text}
        </div>
      ))}
    </>
  );
}

export function AppShowcase() {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const stage = root.querySelector<HTMLElement>("#t2q-stage");
    const slides = Array.from(root.querySelectorAll<HTMLElement>(".slide"));
    const total = slides.length;
    const counter = root.querySelector<HTMLElement>("#t2q-counter");
    const label = root.querySelector<HTMLElement>("#t2q-step-label");
    const progress = root.querySelector<HTMLElement>("#t2q-progress");
    const prevBtn = root.querySelector<HTMLButtonElement>("#t2q-prev");
    const nextBtn = root.querySelector<HTMLButtonElement>("#t2q-next");
    const playBtn = root.querySelector<HTMLButtonElement>("#t2q-play");
    const dotsHost = root.querySelector<HTMLElement>("#t2q-dots");
    if (!stage || !counter || !label || !progress || !prevBtn || !nextBtn || !playBtn || !dotsHost || total === 0) {
      return;
    }

    let i = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    let playing = true;
    const STEP_MS = 7000;
    const pad = (n: number) => String(n).padStart(2, "0");

    function go(n: number) {
      if (n < 0 || n >= total) return;
      slides.forEach((s, k) => {
        s.classList.remove("active", "prev");
        if (k < n) s.classList.add("prev");
      });
      slides[n].classList.add("active");
      dotEls.forEach((d, k) => d.classList.toggle("active", k === n));
      counter!.innerHTML = '<span class="n">' + pad(n + 1) + "</span> / " + pad(total);
      const lab = slides[n].dataset.label || "";
      label!.innerHTML =
        '<span class="step-n">// STEP ' + pad(n + 1) + "</span> &nbsp; &middot; &nbsp; " + lab.replace(/^\/\/ /, "");
      i = n;
      restartProgress();
    }
    const next = () => go((i + 1) % total);
    const prev = () => go((i - 1 + total) % total);

    function startAuto() {
      stopAuto();
      timer = setInterval(() => {
        if (playing) next();
      }, STEP_MS);
    }
    function stopAuto() {
      if (timer) clearInterval(timer);
      timer = null;
    }
    function restartAuto() {
      stopAuto();
      if (playing) startAuto();
    }
    function restartProgress() {
      progress!.style.transition = "none";
      progress!.style.width = "0%";
      void progress!.offsetWidth;
      progress!.style.transition = "width " + STEP_MS / 1000 + "s linear";
      progress!.style.width = "100%";
    }

    // Generated nav dots (kept in JS so the count always matches the slides).
    const dotEls: HTMLElement[] = [];
    const dotHandlers: Array<() => void> = [];
    for (let k = 0; k < total; k++) {
      const d = document.createElement("div");
      d.className = "dot" + (k === 0 ? " active" : "");
      const h = () => {
        go(k);
        restartAuto();
      };
      d.addEventListener("click", h);
      dotsHost.appendChild(d);
      dotEls.push(d);
      dotHandlers.push(h);
    }

    const onNext = () => {
      next();
      restartAuto();
    };
    const onPrev = () => {
      prev();
      restartAuto();
    };
    const onPlay = () => {
      playing = !playing;
      playBtn!.innerHTML = playing ? "&#10074;&#10074;" : "&#9654;";
      if (playing) startAuto();
      else stopAuto();
    };
    nextBtn.addEventListener("click", onNext);
    prevBtn.addEventListener("click", onPrev);
    playBtn.addEventListener("click", onPlay);

    const onKey = (e: KeyboardEvent) => {
      if (!root.matches(":hover") && document.activeElement?.tagName !== "BODY") return;
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
    };
    document.addEventListener("keydown", onKey);

    const onStageEnter = () => stopAuto();
    const onStageLeave = () => {
      if (playing) startAuto();
    };
    stage.addEventListener("mouseenter", onStageEnter);
    stage.addEventListener("mouseleave", onStageLeave);

    // Phone parallax on each visual column.
    const visCleanups: Array<() => void> = [];
    root.querySelectorAll<HTMLElement>(".vis").forEach((vis) => {
      const onMove = (e: MouseEvent) => {
        const r = vis.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        const my = ((e.clientY - r.top) / r.height - 0.5) * 2;
        const phone = vis.querySelector<HTMLElement>(".phone");
        if (phone) {
          phone.style.setProperty("--mx", String(mx));
          phone.style.setProperty("--my", String(my));
        }
      };
      const onLeave = () => {
        const phone = vis.querySelector<HTMLElement>(".phone");
        if (phone) {
          phone.style.setProperty("--mx", "0");
          phone.style.setProperty("--my", "0");
        }
      };
      vis.addEventListener("mousemove", onMove);
      vis.addEventListener("mouseleave", onLeave);
      visCleanups.push(() => {
        vis.removeEventListener("mousemove", onMove);
        vis.removeEventListener("mouseleave", onLeave);
      });
    });

    // Three.js hero background. PURELY decorative — some devices can't
    // create a WebGL context at all (blocklisted GPUs, low-memory Safari,
    // too many live contexts) and `new WebGLRenderer` THROWS there. That
    // crash was reaching the page error boundary and killing the whole
    // showcase (internal monitor, 2026-07-15). Guarded: on failure we
    // hide the canvas and the section renders fine without the backdrop.
    let threeCleanup: (() => void) | null = null;
    const canvas = canvasRef.current;
    if (canvas) {
      try {
      const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const fit = () => renderer.setSize(stage.clientWidth, stage.clientHeight, false);
      fit();
      window.addEventListener("resize", fit);

      const scene = new Scene();
      const camera = new PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 0.1, 100);
      camera.position.set(0, 0, 8);
      scene.add(new AmbientLight(0xffffff, 0.55));
      const d1 = new DirectionalLight(0xff5f15, 1.2);
      d1.position.set(4, 5, 4);
      scene.add(d1);
      const d2 = new DirectionalLight(0xffd23f, 0.7);
      d2.position.set(-5, -2, 3);
      scene.add(d2);

      type BoltData = { sx: number; sy: number; vy: number };
      const N = 40;
      const bolts: Mesh<IcosahedronGeometry, MeshStandardMaterial>[] = [];
      for (let k = 0; k < N; k++) {
        const m = new Mesh(
          new IcosahedronGeometry(0.06 + Math.random() * 0.05, 0),
          new MeshStandardMaterial({
            color: k % 3 === 0 ? 0xff5f15 : k % 3 === 1 ? 0xffea00 : 0x888888,
            metalness: 0.7,
            roughness: 0.3,
          }),
        );
        m.position.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6 - 2);
        m.userData = { sx: 0.3 + Math.random() * 0.5, sy: 0.3 + Math.random() * 0.5, vy: 0.2 + Math.random() * 0.4 } as BoltData;
        bolts.push(m);
        scene.add(m);
      }
      const ring = new LineSegments(
        new EdgesGeometry(new TorusGeometry(3.5, 0.06, 8, 64)),
        new LineBasicMaterial({ color: 0xff5f15, transparent: true, opacity: 0.18 }),
      );
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);

      const t0 = performance.now();
      let rafId = 0;
      const loop = () => {
        const t = (performance.now() - t0) / 1000;
        bolts.forEach((b) => {
          const u = b.userData as BoltData;
          b.rotation.x += 0.01 * u.sx;
          b.rotation.y += 0.012 * u.sy;
          b.position.y += 0.002 * u.vy;
          if (b.position.y > 6) b.position.y = -6;
        });
        ring.rotation.z = t * 0.1;
        ring.position.x = Math.sin(t * 0.2) * 0.5;
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);

      threeCleanup = () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("resize", fit);
        bolts.forEach((b) => {
          b.geometry.dispose();
          b.material.dispose();
        });
        ring.geometry.dispose();
        (ring.material as LineBasicMaterial).dispose();
        renderer.dispose();
      };
      } catch {
        // No WebGL on this device — hide the (decorative) canvas and
        // move on. The showcase is fully functional without it.
        canvas.style.display = "none";
      }
    }

    go(0);
    startAuto();

    return () => {
      stopAuto();
      nextBtn.removeEventListener("click", onNext);
      prevBtn.removeEventListener("click", onPrev);
      playBtn.removeEventListener("click", onPlay);
      document.removeEventListener("keydown", onKey);
      stage.removeEventListener("mouseenter", onStageEnter);
      stage.removeEventListener("mouseleave", onStageLeave);
      visCleanups.forEach((fn) => fn());
      dotEls.forEach((d, k) => {
        d.removeEventListener("click", dotHandlers[k]);
        d.remove();
      });
      threeCleanup?.();
    };
  }, []);

  return (
    <section className="t2q-tour" id="t2q-tour" aria-label="Inside Tradies2Quote" ref={rootRef}>
      <div className="tour-frame">
        <div className="sec-eye">
          <span className="pulse" />
          <span>{"// INSIDE THE APP · TEN STEPS · BUILT IN NEW ZEALAND"}</span>
        </div>

        <div className="stage" id="t2q-stage">
          <div className="stage-chrome">
            <div className="badge">
              <span className="t2q-mini">
                T<span className="two">2</span>Q
              </span>
              <span className="brand-name">
                TRADIES<span style={{ color: "var(--orange)" }}>2</span>QUOTE
              </span>
            </div>
            <div className="right" id="t2q-step-label">
              <span className="step-n">{"// STEP 01"}</span> · SPLASH
            </div>
          </div>

          <canvas ref={canvasRef} className="t2q-3d" />

          {SLIDES.map((s, idx) => (
            <div
              key={idx}
              className={`slide${idx === 0 ? " active" : ""}`}
              data-i={idx}
              data-label={s.label}
            >
              <div className="content">
                <span className="step-tag">{s.tag}</span>
                <h3 className="slide-headline">{s.headline}</h3>
                <p className="slide-sub">{s.sub}</p>
                {s.cta ? (
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "8px" }}>
                    <a className="btn" href="/signup">
                      START FREE TRIAL →
                    </a>
                    <a className="btn ghost" href="#how-it-works">
                      SEE HOW IT WORKS
                    </a>
                  </div>
                ) : (
                  <ul className="feat-list">
                    {(s.feats ?? []).map((f, fi) => (
                      <li key={fi}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="vis">
                {s.cta ? (
                  <div className="phone cta-phone">
                    <div className="cta-screen">
                      <div className="pre">{"// READY TO ROLL"}</div>
                      <div className="big">
                        START
                        <br />
                        YOUR <span className="o">TRIAL.</span>
                      </div>
                      <div className="bar" />
                      <div className="cta-list">
                        <span>✓ EDITABLE BEFORE SENDING</span>
                        <span>✓ GST 15% BAKED IN</span>
                        <span>✓ QUOTE &amp; INVOICE IN ONE</span>
                        <span>✓ BUILT BY A BUILDER · IN NZ</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="phone">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="ph-shot" alt="Tradies2Quote app screen" src={s.screen} />
                  </div>
                )}
                <Callouts items={s.callouts} />
              </div>
            </div>
          ))}

          <div className="progress" id="t2q-progress" style={{ width: "10%" }} />

          <div className="stage-foot">
            <div className="left">
              <button className="nb" id="t2q-prev" aria-label="Previous" type="button">
                ‹
              </button>
              <button className="nb" id="t2q-next" aria-label="Next" type="button">
                ›
              </button>
              <button className="nb" id="t2q-play" aria-label="Pause" title="Pause/play" type="button">
                ❚❚
              </button>
              <span className="counter" id="t2q-counter">
                <span className="n">01</span> / {String(SLIDES.length).padStart(2, "0")}
              </span>
            </div>
            <div className="dots" id="t2q-dots" />
            <div className="right">
              <a className="nav-cta" href="/signup">
                START FREE TRIAL →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
