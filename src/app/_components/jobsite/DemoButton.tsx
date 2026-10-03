"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowCounterClockwise, ArrowUpRight, Check, Play, SpeakerHigh, X } from "@phosphor-icons/react";
import { DEMO_TIMELINE } from "@/remotion/demo-script";
import { useMotionPaused } from "../wallpaper/motion";
import { TRIAL_LINE } from "./story";

/**
 * Bumped when the demo is re-rendered under the same file names. Media is
 * cached for a day (then a week stale-while-revalidate), so without a new
 * address a returning visitor keeps the old film. 2: the narrated new-look
 * demo (3 Oct 2026). 3: the same, without the mid-chapter phone blink, plus
 * the first-frame posters and the preview loop.
 */
const DEMO_VERSION = 3;
const v = `?v=${DEMO_VERSION}`;
/**
 * The dialog's poster is the film's own first frame, so pressing play
 * continues from exactly what is on screen. (A frame from the middle, then
 * the dark intro, read as a flicker on play.)
 */
const POSTER = {
  tall: `/images/marketing/poster-demo-tall-start.webp${v}`,
  wide: `/images/marketing/poster-demo-wide-start.webp${v}`,
} as const;
/** The silent phone-only loop on the hero card (scripts/render-marketing.mjs, demo-tall "preview"). */
const PREVIEW = { video: `/videos/demo-preview.mp4${v}`, still: "/images/marketing/poster-demo-preview.webp" } as const;

type Cut = keyof typeof POSTER;

/** The demo's length, e.g. "1:09", from the same timeline the video was rendered from. */
export const DEMO_LENGTH = (() => {
  const total = Math.round(DEMO_TIMELINE.durationInFrames / DEMO_TIMELINE.fps);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
})();

const cutNow = (): Cut => (window.innerHeight > window.innerWidth ? "tall" : "wide");

/**
 * "Watch the demo": the narrated, Remotion-rendered film of one job in the
 * app (src/remotion/marketing, DemoWide/DemoTall; narration in
 * src/remotion/demo-voiceover.ts), in a dialog. The tall cut on portrait
 * screens, the wide cut elsewhere. Nothing downloads until it's opened.
 *
 * It plays with sound, so playback starts inside the tap itself: browsers
 * (iPhone Safari above all) only allow sound when play() is called from the
 * visitor's gesture, which is why the video is mounted before the dialog
 * opens instead of autoplaying after it renders. If sound is refused anyway,
 * it plays muted and the controls can turn it up.
 *
 * The button shows a frame of the film with a play badge and its length, so
 * it reads as a video at a glance. When the film ends, the dialog offers the
 * trial (the same "Start your free trial" as the page) and a replay.
 */
/**
 * The hero card's thumbnail: a silent loop of the app while motion is on
 * (and the card is on screen), the loop's first frame otherwise. With Reduce
 * Motion or "Pause background motion" it never moves by itself.
 */
function PreviewThumb({ playing }: { playing: boolean }) {
  const motionPaused = useMotionPaused();
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // iPhone Safari only autoplays a video that is muted as an attribute.
    el.muted = true;
    el.setAttribute("muted", "");
    let visible = true;
    const sync = () => {
      if (visible && playing && !document.hidden) {
        el.play().catch(() => {
          /* Refused for now (see the retry below), or for good in Low Power Mode: the first frame stays. */
        });
      } else {
        el.pause();
      }
    };
    // WebKit refuses play() while the page is still settling (the 3D layout
    // swaps in during the first second) and doesn't retry by itself. Keep
    // asking, gently, for a few seconds while it should be playing.
    let tries = 0;
    const retry = window.setInterval(() => {
      tries += 1;
      if (tries > 15) window.clearInterval(retry);
      else if (el.paused && visible && playing && !document.hidden) sync();
    }, 1000);
    const watch = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    watch.observe(el);
    document.addEventListener("visibilitychange", sync);
    // WebKit refuses a play() made before the clip can play (NotAllowedError)
    // and doesn't retry by itself: try again once it's ready.
    el.addEventListener("canplay", sync);
    sync();
    return () => {
      watch.disconnect();
      document.removeEventListener("visibilitychange", sync);
      el.removeEventListener("canplay", sync);
      window.clearInterval(retry);
      el.pause();
    };
  }, [playing, motionPaused]);

  if (motionPaused) {
    return <Image src={PREVIEW.still} alt="" width={240} height={342} sizes="80px" className="jobsite-demo-preview" />;
  }
  return (
    <video
      ref={ref}
      className="jobsite-demo-preview"
      src={PREVIEW.video}
      poster={PREVIEW.still}
      autoPlay={playing}
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-hidden="true"
    />
  );
}

export function DemoButton({
  className = "",
  children,
  variant = "compact",
}: {
  className?: string;
  children: ReactNode;
  /** "hero": the big card at the top of the page, with the moving preview. */
  variant?: "compact" | "hero";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [cut, setCut] = useState<Cut | null>(null);
  const [ended, setEnded] = useState(false);
  const [watching, setWatching] = useState(false);
  const motionPaused = useMotionPaused();

  // Pick the cut once the page knows the screen's shape, and follow a turn
  // of the phone while the dialog is closed.
  useEffect(() => {
    const pick = () => {
      if (!dialog.current?.open) setCut(cutNow());
    };
    pick();
    window.addEventListener("resize", pick);
    return () => window.removeEventListener("resize", pick);
  }, []);

  function start(v: HTMLVideoElement) {
    v.muted = false;
    v.play().catch(() => {
      // No sound allowed here: play silently; the controls can unmute.
      v.muted = true;
      v.play().catch(() => {
        /* The poster and controls stay; a tap on play starts it. */
      });
    });
  }

  function open() {
    setEnded(false);
    setWatching(true);
    dialog.current?.showModal();
    const v = video.current;
    if (!v) return;
    try {
      v.currentTime = 0;
    } catch {
      /* Not loaded yet: it starts at 0 anyway. */
    }
    start(v);
  }

  function replay() {
    const v = video.current;
    setEnded(false);
    if (!v) return;
    v.currentTime = 0;
    start(v);
  }

  return (
    <>
      {variant === "hero" ? (
        <button
          type="button"
          className={`jobsite-demo-card${motionPaused ? "" : " is-moving"} ${className}`}
          onClick={open}
          data-testid="jobsite-demo-card"
        >
          <span className="jobsite-demo-card-thumb" aria-hidden="true">
            <PreviewThumb playing={!watching} />
            <span className="jobsite-demo-card-play">
              <Play size={20} weight="fill" />
            </span>
          </span>
          <span className="jobsite-demo-card-text">
            <span className="jobsite-demo-card-title">{children}</span>
            <span className="jobsite-demo-card-sub">See a quote made, start to finish.</span>
            <span className="jobsite-demo-card-meta">
              <span className="sr-only">Length </span>
              {DEMO_LENGTH}
              <span aria-hidden="true"> · </span>
              <SpeakerHigh size={14} weight="fill" aria-hidden="true" /> Sound on
            </span>
          </span>
        </button>
      ) : (
        <button type="button" className={`jobsite-demo-button ${className}`} onClick={open}>
          <span className="jobsite-demo-thumb" aria-hidden="true">
            <Image src="/images/marketing/poster-demo-tall.webp" alt="" width={44} height={44} sizes="44px" />
            <Play size={16} weight="fill" />
          </span>
          <span>{children}</span>
          <span className="jobsite-demo-length">
            <span className="sr-only">, </span>
            {DEMO_LENGTH}
          </span>
        </button>
      )}
      <dialog
        ref={dialog}
        className="jobsite-demo"
        aria-label="Tradies2Quote demo, with narration"
        onClose={() => {
          video.current?.pause();
          setEnded(false);
          setWatching(false);
        }}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <form method="dialog" className="jobsite-demo-close">
          <button type="submit" aria-label="Close the demo">
            <X size={22} weight="bold" aria-hidden="true" />
          </button>
        </form>
        {cut ? (
          <div className="jobsite-demo-frame">
            <video
              key={cut}
              ref={video}
              controls
              playsInline
              preload="none"
              poster={POSTER[cut]}
              className={cut === "tall" ? "jobsite-demo-tall" : "jobsite-demo-wide"}
              onEnded={() => setEnded(true)}
              onPlay={() => setEnded(false)}
            >
              <source src={`/videos/demo-${cut}.mp4${v}`} type="video/mp4" />
              <source src={`/videos/demo-${cut}.webm${v}`} type="video/webm" />
            </video>
            {ended ? (
              <div className="jobsite-demo-end" role="group" aria-label="After the demo">
                <p className="jobsite-demo-end-title">Try it on your next job.</p>
                <Link href="/signup" className="jobsite-start" data-testid="jobsite-demo-start">
                  Start your free trial <ArrowUpRight size={20} weight="bold" aria-hidden="true" />
                </Link>
                <p className="jobsite-assure">
                  <Check size={15} aria-hidden="true" /> {TRIAL_LINE}
                </p>
                <button type="button" className="jobsite-demo-replay" onClick={replay}>
                  <ArrowCounterClockwise size={18} weight="bold" aria-hidden="true" /> Watch again
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
