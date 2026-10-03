"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowCounterClockwise, ArrowUpRight, Check, Play, X } from "@phosphor-icons/react";
import { DEMO_TIMELINE } from "@/remotion/demo-script";
import { TRIAL_LINE } from "./story";

/**
 * Bumped when the demo is re-rendered under the same file names. Media is
 * cached for a day (then a week stale-while-revalidate), so without a new
 * address a returning visitor keeps the old film. 2: the narrated new-look
 * demo (3 Oct 2026).
 */
const DEMO_VERSION = 2;
const v = `?v=${DEMO_VERSION}`;
const POSTER = { tall: `/images/marketing/poster-demo-tall.webp${v}`, wide: `/images/marketing/poster-demo-wide.webp${v}` } as const;

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
export function DemoButton({ className = "", children }: { className?: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [cut, setCut] = useState<Cut | null>(null);
  const [ended, setEnded] = useState(false);

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
      <dialog
        ref={dialog}
        className="jobsite-demo"
        aria-label="Tradies2Quote demo, with narration"
        onClose={() => {
          video.current?.pause();
          setEnded(false);
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
