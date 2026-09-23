/**
 * Shared stage pieces for the marketing compositions: backdrop, brand mark,
 * chapter progress, burned-in captions, the voiceover slot and the phone rig
 * that pans and swaps devices.
 */
import type { CSSProperties, ReactNode } from "react";
import { Audio, staticFile } from "remotion";
import type { SceneId, Timeline, TimelineChapter } from "../demo-script";
import { easeInOut, eseg, mix, seg } from "./anim";
import { Phone, SCREEN_H } from "./Phone";
import { Push } from "./Push";
import type { DeviceShot, StoryShot } from "./story";
import { C, FONT } from "./theme";

/** Scenes that carry the story (they get numbers, titles and captions). */
const TITLE_SCENES: ReadonlySet<SceneId> = new Set(["hook", "intro", "end"]);

export interface ChapterState {
  chapter: TimelineChapter;
  index: number;
  local: number;
  p: number;
  /** 1-based position among story chapters (0 for hook/intro/end). */
  storyIndex: number;
  storyCount: number;
  prev: TimelineChapter | null;
}

export function chapterAt(timeline: Timeline, frame: number): ChapterState {
  const chapters = timeline.chapters;
  let index = chapters.length - 1;
  for (let i = 0; i < chapters.length; i++) {
    if (frame < chapters[i].from + chapters[i].durationInFrames) {
      index = i;
      break;
    }
  }
  const chapter = chapters[index];
  const local = frame - chapter.from;
  const story = chapters.filter((c) => !TITLE_SCENES.has(c.id));
  const storyIndex = story.findIndex((c) => c.id === chapter.id) + 1;
  return {
    chapter,
    index,
    local,
    p: Math.min(1, Math.max(0, local / chapter.durationInFrames)),
    storyIndex,
    storyCount: story.length,
    prev: index > 0 ? chapters[index - 1] : null,
  };
}

export function isTitleScene(id: SceneId) {
  return TITLE_SCENES.has(id);
}

/* ─── Backdrop and brand ─────────────────────────────────────────────────── */

export function Backdrop({ glowX = "72%", glowY = "58%" }: { glowX?: string; glowY?: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: C.stage, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 60% 55% at ${glowX} ${glowY}, rgba(255,95,21,0.16), transparent 70%), radial-gradient(ellipse 50% 40% at 12% 8%, rgba(91,167,146,0.10), transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 45%, #000 30%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 45%, #000 30%, transparent 85%)",
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 5, background: C.hivis }} />
    </div>
  );
}

/** The T2Q mark: white T and Q with the orange 2, as on the app icon. */
export function Mark({ size = 40, style }: { size?: number; style?: CSSProperties }) {
  return (
    <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: size, letterSpacing: "-0.07em", lineHeight: 1, color: "#fff", ...style }}>
      T<span style={{ color: C.brand }}>2</span>Q
    </span>
  );
}

export function Brand({ size = 34 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.45 }}>
      <Mark size={size} />
      <span style={{ fontFamily: FONT.mono, fontSize: size * 0.52, fontWeight: 500, letterSpacing: "0.2em", color: "#d6d9d7" }}>
        TRADIES<span style={{ color: C.brand }}>2</span>QUOTE
      </span>
    </div>
  );
}

/* ─── Chapter progress ───────────────────────────────────────────────────── */

export function Stepper({ timeline, frame, labels = true, size = 17 }: { timeline: Timeline; frame: number; labels?: boolean; size?: number }) {
  const story = timeline.chapters.filter((c) => !TITLE_SCENES.has(c.id));
  return (
    <div style={{ display: "flex", gap: labels ? 22 : 10 }}>
      {story.map((c) => {
        const fill = seg(frame, c.from, c.from + c.durationInFrames);
        const active = frame >= c.from && frame < c.from + c.durationInFrames;
        return (
          <div key={c.id} style={{ width: labels ? undefined : 58 }}>
            {labels ? (
              <div
                style={{
                  fontFamily: FONT.mono,
                  fontSize: size,
                  fontWeight: 500,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: active ? "#ffffff" : fill >= 1 ? "#9ea3a0" : "#5f6462",
                  marginBottom: 8,
                }}
              >
                {c.label}
              </div>
            ) : null}
            <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
              <div style={{ width: `${fill * 100}%`, height: "100%", background: C.brand }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Captions ───────────────────────────────────────────────────────────── */

export function activeCaption(timeline: Timeline, frame: number) {
  return timeline.captions.find((c) => frame >= c.from && frame < c.to) ?? null;
}

/** Burned-in caption for story chapters (title scenes show their text large). */
export function CaptionBand({
  timeline,
  frame,
  fontSize,
  style,
  align = "left",
  maxWidth,
}: {
  timeline: Timeline;
  frame: number;
  fontSize: number;
  style?: CSSProperties;
  align?: "left" | "center";
  maxWidth: number;
}) {
  const caption = activeCaption(timeline, frame);
  if (!caption || TITLE_SCENES.has(caption.chapter)) return null;
  const fade = Math.min(eseg(frame, caption.from, caption.from + 7), 1 - eseg(frame, caption.to - 6, caption.to, easeInOut));
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        justifyContent: align === "center" ? "center" : "flex-start",
        opacity: fade,
        transform: `translateY(${(1 - fade) * 14}px)`,
        ...style,
      }}
    >
      <div
        style={{
          maxWidth,
          fontFamily: FONT.display,
          fontSize,
          fontWeight: 700,
          lineHeight: 1.18,
          letterSpacing: "-0.025em",
          color: "#ffffff",
          textAlign: align,
          background: "rgba(8, 9, 9, 0.8)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderLeft: align === "left" ? `6px solid ${C.brand}` : undefined,
          borderBottom: align === "center" ? `5px solid ${C.brand}` : undefined,
          borderRadius: 16,
          padding: align === "center" ? `${fontSize * 0.34}px ${fontSize * 0.5}px` : `${fontSize * 0.34}px ${fontSize * 0.55}px`,
          boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
        }}
      >
        {caption.text}
      </div>
    </div>
  );
}

/* ─── Voiceover ──────────────────────────────────────────────────────────── */

export type MarketingVideoProps = {
  /**
   * Optional narration. An http(s) URL, or a file name inside the render's
   * public folder (the render script copies a local file there). No
   * voiceover means no audio track at all.
   */
  voiceoverSrc?: string;
};

export function Voiceover({ src }: { src?: string }) {
  if (!src) return null;
  const url = /^(https?:|data:|blob:)/.test(src) ? src : staticFile(src);
  return <Audio src={url} />;
}

/* ─── Phone rig ──────────────────────────────────────────────────────────── */

const PHONE_OUTER_H = SCREEN_H + 26;

export interface RigGeometry {
  /** Phone outer width in canvas px. */
  width: number;
  /** Phone left edge in canvas px. */
  left: number;
  /** Canvas y of the phone's top edge before panning. */
  top: number;
  /** Visible window (canvas px); the phone is clipped to it. */
  windowTop: number;
  windowBottom: number;
  /** Horizontal travel of a device swap. */
  slide: number;
  /** Where in the window (0 top .. 1 bottom) the focus point should sit. */
  anchor: number;
}

function panFor(focus: number, g: RigGeometry) {
  const s = g.width / 416;
  const anchorY = (g.windowTop + (g.windowBottom - g.windowTop) * g.anchor - g.top) / s - 13;
  const maxPan = Math.max(0, PHONE_OUTER_H - (g.windowBottom - g.top) / s);
  return Math.min(maxPan, Math.max(0, focus - anchorY));
}

function Device({ finish, screen, g, x, opacity, scale, pan }: { finish: DeviceShot["finish"]; screen: ReactNode; g: RigGeometry; x: number; opacity: number; scale: number; pan: number }) {
  const s = g.width / 416;
  if (opacity <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: g.left + x,
        top: g.top - g.windowTop - pan * s,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "50% 30%",
      }}
    >
      <Phone width={g.width} finish={finish}>
        {screen}
      </Phone>
    </div>
  );
}

/**
 * Renders the chapter's device(s) inside a clipped window. `prev` is the
 * previous chapter's last device: when it shows a different page on the same
 * phone, the new page is pushed over it while `enter` goes 0 -> 1, and the
 * pan eases from the old focus. A device swap (tradie <-> client) dips one
 * phone out before the other comes in, so the two never overlap.
 */
export function PhoneRig({ shot, g, prev, enter = 1, panBlend = 1 }: { shot: StoryShot; g: RigGeometry; prev?: DeviceShot | null; enter?: number; panBlend?: number }) {
  const m = Math.min(1, Math.max(0, shot.mix));
  const samePhone = Boolean(prev && prev.finish === shot.a.finish);
  const aFocus = prev && samePhone ? mix(prev.focus, shot.a.focus, panBlend) : shot.a.focus;
  const aPan = panFor(aFocus, g);
  const bPan = shot.b ? panFor(shot.b.focus, g) : 0;
  const pushing = prev && samePhone && prev.page !== shot.a.page && enter < 1;
  const aScreen = pushing && prev ? <Push p={enter} from={prev.screen} to={shot.a.screen} /> : shot.a.screen;
  const out = easeInOut(seg(m, 0, 0.5));
  const inn = easeInOut(seg(m, 0.5, 1));
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: g.windowTop,
        height: g.windowBottom - g.windowTop,
        overflow: "hidden",
        maskImage: "linear-gradient(180deg, transparent 0, #000 36px, #000 calc(100% - 56px), transparent 100%)",
        WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 36px, #000 calc(100% - 56px), transparent 100%)",
      }}
    >
      <Device finish={shot.a.finish} screen={aScreen} g={g} x={-g.slide * out} opacity={1 - out} scale={1 - 0.06 * out} pan={aPan} />
      {shot.b ? <Device finish={shot.b.finish} screen={shot.b.screen} g={g} x={g.slide * (1 - inn)} opacity={inn} scale={0.94 + 0.06 * inn} pan={bPan} /> : null}
    </div>
  );
}

/** Whose phone is on screen: the tradie's (graphite) or the client's (silver). */
export function deviceLabel(shot: StoryShot | null): string {
  if (!shot) return "";
  const d = shot.b && shot.mix >= 0.5 ? shot.b : shot.a;
  return d.finish === "silver" ? "Your client's phone" : "Your phone";
}

export function Fill({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", inset: 0, ...style }}>{children}</div>;
}
