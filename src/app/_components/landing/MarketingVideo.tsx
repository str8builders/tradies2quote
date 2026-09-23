"use client";

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";
import { Pause, Play } from "@phosphor-icons/react";
import { useMotionPaused } from "@/app/_components/LiveWallpaper";
import {
  DEMO_CHAPTERS,
  DEMO_TRANSCRIPT,
  HERO_DESCRIPTION,
  demoChapterAt,
  type DemoChapterId,
} from "@/remotion/demo-script";

/**
 * Pre-rendered marketing video (rendered by `npm run render:marketing`).
 *
 * The server renders only an aspect-ratio box with the poster: no sources,
 * `preload="none"` and no autoplay, so nothing downloads and nothing shifts.
 * After mount it picks the tall cut on phones (≤ 767 px) and the wide cut
 * elsewhere (the hero is always portrait), then plays muted and inline while
 * at least a quarter of it is on screen. It stays on its poster with a play
 * button while site motion is paused or the visitor prefers reduced motion.
 */

export type MarketingVideoVariant = "demo" | "hero";

export interface MarketingVideoHandle {
  /** Jump the demo to a chapter and play it (counts as the visitor choosing to watch). */
  seekToChapter(id: DemoChapterId): void;
}

export interface MarketingVideoProps {
  variant: MarketingVideoVariant;
  /** Classes for the outer box (border, radius, shadow…). Aspect ratio is handled here. */
  className?: string;
  /** Demo only: reports the chapter on screen, e.g. to highlight chapter buttons. */
  onChapterChange?: (id: DemoChapterId) => void;
  /** id for the <video> element, e.g. for `aria-controls` on chapter buttons. */
  videoId?: string;
  ref?: Ref<MarketingVideoHandle>;
}

type Shape = "wide" | "tall" | "hero";

const MEDIA: Record<Shape, { webm: string; mp4: string; poster: string; width: number; height: number }> = {
  wide: {
    webm: "/videos/demo-wide.webm",
    mp4: "/videos/demo-wide.mp4",
    poster: "/images/marketing/poster-demo-wide.webp",
    width: 1920,
    height: 1080,
  },
  tall: {
    webm: "/videos/demo-tall.webm",
    mp4: "/videos/demo-tall.mp4",
    poster: "/images/marketing/poster-demo-tall.webp",
    width: 1080,
    height: 1920,
  },
  hero: {
    webm: "/videos/hero-loop.webm",
    mp4: "/videos/hero-loop.mp4",
    poster: "/images/marketing/poster-hero.webp",
    width: 720,
    height: 1440,
  },
};

/** Same breakpoint as Tailwind's `md` (48rem): below it the demo is tall. */
export const PHONE_QUERY = "(max-width: 767px)";

const DEMO_LABEL =
  "Tradies2Quote walkthrough, 30 seconds, no sound: talk the job, the draft builds itself, check every line, send and get the yes, invoice and get paid. Example job and figures.";
const HERO_LABEL = "Tradies2Quote app: a spoken job becomes a quote draft, ready for review. Example job and figures.";

function subscribeToQuery(callback: () => void) {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const noopSubscribe = () => () => {};

export function MarketingVideo({ variant, className = "", onChapterChange, videoId, ref }: MarketingVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const lastChapter = useRef<DemoChapterId | null>(null);
  const transcriptId = useId();

  // false during SSR and hydration, true once running in the browser.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const phone = useSyncExternalStore(
    subscribeToQuery,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => null,
  );
  const motionPaused = useMotionPaused();
  const shape: Shape | null = variant === "hero" ? (mounted ? "hero" : null) : phone === null ? null : phone ? "tall" : "wide";

  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [intent, setIntent] = useState<"auto" | "play" | "pause">("auto");
  const [playing, setPlaying] = useState(false);
  /** Once a frame has played, keep showing video (a pause holds its frame, not the poster). */
  const [started, setStarted] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio >= 0.25), {
      threshold: [0, 0.25, 0.5],
    });
    observer.observe(box);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // New sources (first mount or crossing the breakpoint) need an explicit load.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shape) return;
    video.muted = true;
    video.defaultMuted = true;
    video.load();
  }, [shape]);

  const wantsPlay = shape !== null && visible && pageVisible && (intent === "play" || (intent === "auto" && !motionPaused));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shape) return;
    if (wantsPlay) {
      video.muted = true;
      // NotAllowedError (autoplay refused, e.g. Low Power Mode) shows the play
      // button; AbortError only means a pause interrupted the start.
      video.play().catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setBlocked(true);
      });
    } else if (!video.paused) {
      video.pause();
    }
  }, [wantsPlay, shape]);

  const reportChapter = useCallback(() => {
    const video = videoRef.current;
    if (!video || variant !== "demo" || !onChapterChange) return;
    const id = demoChapterAt(video.currentTime);
    if (id !== lastChapter.current) {
      lastChapter.current = id;
      onChapterChange(id);
    }
  }, [variant, onChapterChange]);

  const seekToChapter = useCallback(
    (id: DemoChapterId) => {
      const chapter = DEMO_CHAPTERS.find((c) => c.id === id);
      const video = videoRef.current;
      if (!chapter || !video || variant !== "demo") return;
      if (video.readyState >= 1) {
        video.currentTime = chapter.startSec;
        reportChapter();
      } else {
        pendingSeek.current = chapter.startSec;
      }
      setBlocked(false);
      setIntent("play");
    },
    [variant, reportChapter],
  );

  useImperativeHandle(ref, () => ({ seekToChapter }), [seekToChapter]);

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (video && pendingSeek.current !== null) {
      video.currentTime = pendingSeek.current;
      pendingSeek.current = null;
      reportChapter();
    }
  };

  const media = shape ? MEDIA[shape] : null;
  const showPlayButton = mounted && !playing && (motionPaused || intent === "pause" || blocked);
  const showPauseButton = mounted && playing && variant === "demo";
  const aspect = variant === "hero" ? "aspect-[1/2]" : "mx-auto aspect-[9/16] w-[min(100%,calc(94svh*9/16))] md:aspect-video md:w-full";

  return (
    <div
      ref={boxRef}
      data-testid={`marketing-video-${variant}`}
      data-shape={shape ?? "pending"}
      className={`relative overflow-hidden bg-[#0b0c0c] ${aspect} ${className}`}
    >
      {variant === "demo" ? (
        <picture>
          <source media={PHONE_QUERY} srcSet={MEDIA.tall.poster} width={MEDIA.tall.width} height={MEDIA.tall.height} />
          <img
            src={MEDIA.wide.poster}
            width={MEDIA.wide.width}
            height={MEDIA.wide.height}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </picture>
      ) : (
        <picture>
          <img
            src={MEDIA.hero.poster}
            width={MEDIA.hero.width}
            height={MEDIA.hero.height}
            alt=""
            aria-hidden="true"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </picture>
      )}
      <video
        ref={videoRef}
        id={videoId}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${started ? "opacity-100" : "opacity-0"}`}
        poster={media?.poster}
        muted
        playsInline
        loop
        preload="none"
        disablePictureInPicture
        aria-label={variant === "demo" ? DEMO_LABEL : HERO_LABEL}
        aria-describedby={transcriptId}
        onPlaying={() => {
          setPlaying(true);
          setStarted(true);
          setBlocked(false);
        }}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={reportChapter}
        onSeeked={reportChapter}
      >
        {media ? (
          <>
            <source src={media.webm} type="video/webm" />
            <source src={media.mp4} type="video/mp4" />
          </>
        ) : null}
      </video>
      <div id={transcriptId} className="sr-only">
        {variant === "demo" ? (
          <>
            <p>Transcript of the silent walkthrough (example job and figures):</p>
            <ol>
              {DEMO_TRANSCRIPT.map((chapter) => (
                <li key={chapter.id}>
                  {chapter.title}. {chapter.text}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p>{HERO_DESCRIPTION}</p>
        )}
      </div>
      {showPlayButton ? (
        <button
          type="button"
          onClick={() => {
            setBlocked(false);
            setIntent("play");
          }}
          className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5F15] text-[#111] shadow-[0_10px_30px_#0008] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          aria-label="Play video"
        >
          <Play size={28} weight="fill" aria-hidden="true" />
        </button>
      ) : null}
      {showPauseButton ? (
        <button
          type="button"
          onClick={() => setIntent("pause")}
          className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label="Pause video"
        >
          <Pause size={18} weight="fill" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
