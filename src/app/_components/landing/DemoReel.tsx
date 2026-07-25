"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { PlayerRef } from "@remotion/player";

/**
 * DemoReel — the Remotion-powered "watch it happen" section.
 *
 * A 15-second programmatic product reel (src/remotion/QuoteDemo.tsx)
 * embedded via @remotion/player: voice in → quote assembles itself →
 * send → PAID. Rules of engagement:
 *
 *   - The player is dynamic()-imported with ssr:false — Remotion is a
 *     purely client concern and must not bloat the SSR pass or the
 *     initial route bundle. Because next/dynamic does not forward
 *     refs, the actual <Player> lives in DemoReelPlayer.tsx and the
 *     PlayerRef travels as a regular `playerRef` prop. The loading
 *     placeholder keeps the layout stable (aspect-ratio box) so
 *     there's no CLS when it hydrates.
 *   - Autoplays (no audio track) and loops, but ONLY while on screen:
 *     an IntersectionObserver pauses the reel when scrolled away so
 *     it doesn't burn CPU/battery behind other sections.
 *   - prefers-reduced-motion: the reel does not autoplay; the user
 *     gets the Player's native controls to play it deliberately.
 *   - Marketing surface only — no imports from src/lib/quote*, no
 *     Supabase; demo numbers match the Hero phone mockup.
 */

const LazyPlayer = dynamic(() => import("./DemoReelPlayer"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full rounded-sm border-2 border-ink-600 bg-ink-800 grid place-items-center"
      style={{ aspectRatio: "16 / 9" }}
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400">
        loading reel...
      </span>
    </div>
  ),
});

export function DemoReel() {
  const reduce = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  // Callback-ref state (not a useRef): the Player arrives via a lazy
  // dynamic() chunk, so a plain ref would be null when the play/pause
  // effect first runs and the effect would never re-fire. Holding the
  // PlayerRef in state re-runs the effect the moment the Player mounts.
  const [player, setPlayer] = useState<PlayerRef | null>(null);

  // Play only while visible; pause (don't reset) when scrolled away.
  // Low threshold on purpose — on short viewports the 16:9 box can be
  // taller than the screen, so a high intersection ratio is unreachable
  // and the reel would sit paused on frame 0 forever.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!player || reduce) return;
    if (onScreen) player.play();
    else player.pause();
  }, [player, onScreen, reduce]);

  return (
    <section
      id="demo-reel"
      data-testid="section-demo-reel"
      className="relative border-b border-ink-600 bg-ink-900 py-24 md:py-32 overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0 t2q-grid-bg opacity-30" />
      <div className="pointer-events-none absolute -top-40 right-1/4 w-[480px] h-[480px] rounded-full bg-brand/15 blur-3xl animate-blob" />

      <div className="relative mx-auto max-w-6xl px-6 md:px-12">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="t2q-section-label mb-4">{"// 15 seconds, start to paid"}</div>
            <h2 className="font-display text-4xl uppercase leading-[0.95] tracking-tighter sm:text-5xl lg:text-6xl">
              Watch it <span className="text-brand">happen.</span>
            </h2>
          </div>
          <p className="max-w-md text-lg leading-relaxed text-ink-200">
            No forms, no spreadsheet. You talk — the quote builds itself.
            <span className="text-white"> Demo data shown.</span>
          </p>
        </div>

        <div
          ref={boxRef}
          className="relative rounded-sm border-2 border-ink-950 t2q-shadow-brutal overflow-hidden"
        >
          <LazyPlayer
            playerRef={setPlayer}
            autoPlay={!reduce}
            controls={!!reduce}
          />
        </div>
      </div>
    </section>
  );
}
