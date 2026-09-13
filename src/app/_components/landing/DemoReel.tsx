"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { useMotionPaused } from "../LiveWallpaper";
const LazyPlayer = dynamic(() => import("./DemoReelPlayer"), {
  ssr: false,
  loading: () => (
    <div className="studio-reel-poster">
      <span>VOICE IN. QUOTE OUT.</span>
      <strong>
        Your next quote,
        <br />
        from start to send.
      </strong>
      <p>Loading the product walkthrough…</p>
    </div>
  ),
});
export function DemoReel() {
  const paused = useMotionPaused();
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [player, setPlayer] = useState<PlayerRef | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const preload = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          preload.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    const visibility = new IntersectionObserver(
      ([e]) => setVisible(e.isIntersecting),
      { threshold: 0.1 },
    );
    preload.observe(el);
    visibility.observe(el);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      preload.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    if (!player) return;
    if (visible && pageVisible && !paused) player.play();
    else player.pause();
  }, [player, visible, pageVisible, paused]);
  return (
    <section
      id="demo-reel"
      data-testid="section-demo-reel"
      className="studio-section studio-reel-section"
    >
      <div className="studio-container">
        <div className="studio-section-heading">
          <div>
            <div className="studio-eyebrow">
              02 / LESS EXPLAINING. MORE SHOWING.
            </div>
            <h2>
              Your next quote.
              <br />
              <em>Watch it come together.</em>
            </h2>
          </div>
          <p>
            A 30-second look at the workflow, on real app screens.
            <br />
            Illustrative job, real possibilities.
          </p>
        </div>
        <div
          ref={ref}
          className="studio-reel-frame"
          aria-label="Animated product walkthrough, using example quote data"
        >
          {near ? (
            <LazyPlayer playerRef={setPlayer} autoPlay={false} controls />
          ) : (
            <div className="studio-reel-poster">
              <span>VOICE IN. QUOTE OUT.</span>
              <strong>
                Your next quote,
                <br />
                from start to send.
              </strong>
              <p>Talk → Draft → Check → Send → Invoice</p>
              <button
                className="studio-button"
                type="button"
                onClick={() => setNear(true)}
              >
                Load the walkthrough
              </button>
            </div>
          )}
        </div>
        <div className="studio-reel-caption">
          <span>YOUR SCOPE. YOUR RATES. YOUR FINAL SAY.</span>
          <span>Play, pause or explore the timeline.</span>
        </div>
      </div>
    </section>
  );
}
