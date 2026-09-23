"use client";
import { useRef, useState } from "react";
import { DEMO_CHAPTERS, type DemoChapterId } from "@/remotion/demo-script";
import { MarketingVideo, type MarketingVideoHandle } from "./MarketingVideo";

const VIDEO_ID = "demo-reel-video";

/**
 * The product walkthrough: a pre-rendered video (tall on phones, wide
 * elsewhere) with chapter buttons that jump to each step. No player
 * library loads on the landing page.
 */
export function DemoReel() {
  const video = useRef<MarketingVideoHandle>(null);
  const [chapter, setChapter] = useState<DemoChapterId>(DEMO_CHAPTERS[0].id);
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
            A 30-second look at the workflow, from talking the job to getting paid.
            <br />
            Example job and figures.
          </p>
        </div>
        <MarketingVideo
          ref={video}
          variant="demo"
          videoId={VIDEO_ID}
          onChapterChange={setChapter}
          className="rounded-[10px] border border-white/[0.125] shadow-[0_30px_90px_#0005] md:rounded-[18px]"
        />
        <nav
          aria-label="Walkthrough chapters"
          className="mt-4 grid grid-cols-5 gap-2 md:mt-5 md:flex md:flex-wrap md:gap-3"
        >
          {DEMO_CHAPTERS.map((c, i) => {
            const active = c.id === chapter;
            return (
              <button
                key={c.id}
                type="button"
                aria-controls={VIDEO_ID}
                aria-current={active ? "step" : undefined}
                onClick={() => video.current?.seekToChapter(c.id)}
                className={`min-h-11 rounded-full border px-1 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors md:px-5 md:tracking-[0.14em] ${
                  active
                    ? "border-[#FF5F15] bg-[#FF5F15]/10 text-[#ff8b54]"
                    : "border-white/15 text-[#c4c4c4] hover:border-white/35 hover:text-white"
                }`}
              >
                <span className="hidden md:inline">{String(i + 1).padStart(2, "0")} </span>
                {c.label}
              </button>
            );
          })}
        </nav>
        <div className="studio-reel-caption">
          <span>YOUR SCOPE. YOUR RATES. YOUR FINAL SAY.</span>
          <span>Choose a chapter to jump straight to it.</span>
        </div>
      </div>
    </section>
  );
}
