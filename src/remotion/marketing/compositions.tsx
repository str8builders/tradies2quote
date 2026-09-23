/**
 * The marketing compositions. Every one is a pure function of the frame
 * (no randomness, no clock) built from the same screens, story and captions.
 */
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import {
  DEMO_TIMELINE,
  EXAMPLE,
  SOCIAL_TIMELINE,
  TOUR_TIMELINE,
  chapterCaptionText,
  type SceneId,
  type Timeline,
} from "../demo-script";
import { easeInOut, eseg, mix, seg, wordsShown } from "./anim";
import { Callout } from "./callouts";
import { Screen, SCREEN_W } from "./Phone";
import {
  Backdrop,
  Brand,
  CaptionBand,
  Fill,
  Mark,
  PhoneRig,
  Stepper,
  Voiceover,
  chapterAt,
  deviceLabel,
  isTitleScene,
  type MarketingVideoProps,
  type RigGeometry,
} from "./stage";
import { finalDevice, kf, storyShot, type Pace } from "./story";
import { HERO_BEATS } from "./beats";
import { Push } from "./Push";
import { C, FONT } from "./theme";
import { CaptureScreen } from "../screens/CaptureScreen";
import { QuoteReviewScreen } from "../screens/QuoteReviewScreen";

export const WIDE = { width: 1920, height: 1080 } as const;
export const TALL = { width: 1080, height: 1920 } as const;
export const HERO = { width: 720, height: 1440 } as const;

/* ─── Title scenes ───────────────────────────────────────────────────────── */

function TitleCard({ frame, timeline, id, orientation }: { frame: number; timeline: Timeline; id: SceneId; orientation: "wide" | "tall" }) {
  const st = chapterAt(timeline, frame);
  const text = chapterCaptionText(timeline, id);
  const tall = orientation === "tall";
  const enter = eseg(st.local, 2, 18);
  const words = text.split(" ");
  if (id === "hook") {
    const shown = wordsShown(text, seg(st.local, 3, st.chapter.durationInFrames * 0.55));
    const rise = eseg(st.local, 6, st.chapter.durationInFrames * 0.9);
    return (
      <Fill>
        <Backdrop glowX="50%" glowY="80%" />
        <div style={{ position: "absolute", left: 80, right: 80, top: 250 }}>
          <Brand size={40} />
          <div style={{ marginTop: 70, fontFamily: FONT.display, fontSize: 118, fontWeight: 800, lineHeight: 1.02, letterSpacing: "-0.055em", color: "#fff" }}>
            {words.map((w, i) => (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  marginRight: "0.24em",
                  opacity: i < shown ? 1 : 0,
                  transform: `translateY(${i < shown ? 0 : 30}px)`,
                  color: i >= words.length - 3 ? C.brand : "#fff",
                }}
              >
                {w}
              </span>
            ))}
          </div>
        </div>
        <div style={{ position: "absolute", left: 140, top: mix(1920, 1180, rise) }}>
          <PhonePeek />
        </div>
      </Fill>
    );
  }
  const [first, second] = id === "end" && text.includes(" · ") ? text.split(" · ") : [text, ""];
  return (
    <Fill>
      <Backdrop glowX="50%" glowY="50%" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: tall ? "0 80px" : "0 200px",
          opacity: enter,
          transform: `translateY(${(1 - enter) * 24}px)`,
        }}
      >
        <Mark size={tall ? 150 : 130} />
        <div
          style={{
            marginTop: tall ? 60 : 44,
            fontFamily: FONT.display,
            fontSize: id === "end" ? (tall ? 96 : 84) : tall ? 88 : 80,
            fontWeight: 800,
            lineHeight: 1.06,
            letterSpacing: "-0.05em",
            color: "#fff",
            maxWidth: tall ? 920 : 1400,
          }}
        >
          {first}
        </div>
        {second ? (
          <div
            style={{
              marginTop: 40,
              borderRadius: 999,
              background: C.brand,
              color: "#111",
              padding: "18px 48px",
              fontFamily: FONT.display,
              fontSize: tall ? 64 : 54,
              fontWeight: 800,
              letterSpacing: "-0.03em",
            }}
          >
            {second}
          </div>
        ) : null}
        <div style={{ marginTop: 40, fontFamily: FONT.mono, fontSize: tall ? 30 : 26, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b9bdbb" }}>
          {id === "intro" ? "Example job · example figures" : "Voice in. Quote out."}
        </div>
      </div>
    </Fill>
  );
}

/** The capture screen rising from the bottom of the hook. */
function PhonePeek() {
  return (
    <div style={{ width: 800 }}>
      <div style={{ borderRadius: 120, overflow: "hidden", border: "18px solid #1d1f21", boxShadow: "0 40px 100px rgba(0,0,0,0.7)" }}>
        <Screen scale={764 / SCREEN_W} height={844}>
          <CaptureScreen state="idle" frame={0} idleMotion={0} />
        </Screen>
      </div>
    </div>
  );
}

/* ─── Wide layout (DemoWide, FullTour) ───────────────────────────────────── */

const WIDE_RIG: RigGeometry = { width: 560, left: 1240, top: 70, windowTop: 0, windowBottom: 1080, slide: 240, anchor: 0.74 };

function WideFrame({ frame, timeline, pace }: { frame: number; timeline: Timeline; pace: Pace }) {
  const st = chapterAt(timeline, frame);
  const id = st.chapter.id;
  if (isTitleScene(id)) return <TitleCard frame={frame} timeline={timeline} id={id} orientation="wide" />;
  const shot = storyShot(id, { p: st.p, frame, pace });
  if (!shot) return null;
  const prevShot = st.prev && !isTitleScene(st.prev.id) ? storyShot(st.prev.id, { p: 1, frame: st.chapter.from - 1, pace }) : null;
  const dur = st.chapter.durationInFrames;
  const textIn = Math.min(eseg(st.local, 1, 14), 1 - eseg(st.local, dur - 7, dur, easeInOut));
  const rigIn = st.prev && isTitleScene(st.prev.id) ? eseg(st.local, 0, 12) : 1;
  return (
    <Fill>
      <Backdrop />
      <div style={{ position: "absolute", left: 120, top: 58 }}>
        <Brand size={32} />
      </div>
      <div style={{ position: "absolute", left: 120, top: 130 }}>
        <Stepper timeline={timeline} frame={frame} />
      </div>
      <div style={{ position: "absolute", right: 120, top: 22, fontFamily: FONT.mono, fontSize: 15, letterSpacing: "0.18em", color: "#6f7572" }}>
        EXAMPLE JOB · EXAMPLE FIGURES
      </div>
      <div style={{ position: "absolute", left: 120, top: 222, width: 960, opacity: textIn, transform: `translateY(${(1 - textIn) * 18}px)` }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "#ff8b54" }}>
          {String(st.storyIndex).padStart(2, "0")} / {String(st.storyCount).padStart(2, "0")} · {deviceLabel(shot)}
        </div>
        <div style={{ marginTop: 14, fontFamily: FONT.display, fontSize: 82, fontWeight: 800, lineHeight: 1.02, letterSpacing: "-0.055em", color: "#fff" }}>
          {st.chapter.title}
          <span style={{ color: C.brand }}>.</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 120, top: 470, width: 960, opacity: textIn }}>
        <Callout id={id} p={st.p} frame={frame} pace={pace} />
      </div>
      <Fill style={{ opacity: rigIn }}>
        <PhoneRig
          shot={shot}
          g={WIDE_RIG}
          prev={prevShot && st.prev ? finalDevice(prevShot, st.prev.id) : null}
          enter={seg(st.local, 0, 12)}
          panBlend={eseg(st.local, 0, 18)}
        />
      </Fill>
      <CaptionBand timeline={timeline} frame={frame} fontSize={46} maxWidth={1040} style={{ left: 120, bottom: 58 }} />
    </Fill>
  );
}

/* ─── Tall layout (DemoTall, SocialCut) ──────────────────────────────────── */

const TALL_RIG: RigGeometry = { width: 900, left: 90, top: 276, windowTop: 258, windowBottom: 1540, slide: 360, anchor: 0.52 };

function TallFrame({ frame, timeline, pace, captionSize }: { frame: number; timeline: Timeline; pace: Pace; captionSize: number }) {
  const st = chapterAt(timeline, frame);
  const id = st.chapter.id;
  if (isTitleScene(id)) return <TitleCard frame={frame} timeline={timeline} id={id} orientation="tall" />;
  const shot = storyShot(id, { p: st.p, frame, pace });
  if (!shot) return null;
  const prevShot = st.prev && !isTitleScene(st.prev.id) ? storyShot(st.prev.id, { p: 1, frame: st.chapter.from - 1, pace }) : null;
  const dur = st.chapter.durationInFrames;
  const textIn = Math.min(eseg(st.local, 1, 12), 1 - eseg(st.local, dur - 6, dur, easeInOut));
  const rigIn = st.prev && isTitleScene(st.prev.id) ? eseg(st.local, 0, 10) : 1;
  const label = deviceLabel(shot);
  return (
    <Fill>
      <Backdrop glowX="50%" glowY="48%" />
      <div style={{ position: "absolute", left: 64, top: 62 }}>
        <Brand size={36} />
      </div>
      <div style={{ position: "absolute", right: 64, top: 80 }}>
        <Stepper timeline={timeline} frame={frame} labels={false} />
      </div>
      <div style={{ position: "absolute", left: 64, right: 64, top: 128, opacity: textIn, transform: `translateY(${(1 - textIn) * 12}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: FONT.mono, fontSize: 26, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ff8b54" }}>
          <span>
            {String(st.storyIndex).padStart(2, "0")} / {String(st.storyCount).padStart(2, "0")}
          </span>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: label === "Your phone" ? "#3a3d40" : "#d9dadb", border: "2px solid #8a8f8c" }} />
          <span style={{ color: "#d6d9d7" }}>{label}</span>
        </div>
        <div style={{ marginTop: 6, fontFamily: FONT.display, fontSize: 60, fontWeight: 800, letterSpacing: "-0.045em", color: "#fff", whiteSpace: "nowrap" }}>
          {st.chapter.title}
          <span style={{ color: C.brand }}>.</span>
        </div>
      </div>
      <Fill style={{ opacity: rigIn }}>
        <PhoneRig shot={shot} g={TALL_RIG} prev={prevShot && st.prev ? finalDevice(prevShot, st.prev.id) : null} enter={seg(st.local, 0, 12)} panBlend={eseg(st.local, 0, 16)} />
      </Fill>
      <CaptionBand timeline={timeline} frame={frame} fontSize={captionSize} maxWidth={960} align="center" style={{ left: 60, right: 60, top: 1574 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, textAlign: "center", fontFamily: FONT.mono, fontSize: 22, letterSpacing: "0.2em", color: "#6f7572" }}>
        EXAMPLE JOB · EXAMPLE FIGURES
      </div>
    </Fill>
  );
}

/* ─── Story wrapper with cross-scene fades ───────────────────────────────── */

function StoryVideo({ timeline, render, voiceoverSrc }: { timeline: Timeline; render: (frame: number) => ReactNode; voiceoverSrc?: string }) {
  const frame = useCurrentFrame();
  const st = chapterAt(timeline, frame);
  // Title scenes dip through the stage colour instead of crossfading, so no
  // frame ever shows two layers of text on top of each other.
  const crossScene = Boolean(st.prev && st.local < 10 && (isTitleScene(st.prev.id) || isTitleScene(st.chapter.id)));
  const showPrev = crossScene && st.local < 5;
  const dip = crossScene ? (st.local < 5 ? seg(st.local, 0, 5) : 1 - seg(st.local, 5, 10)) : 0;
  return (
    <AbsoluteFill style={{ background: C.stage, fontFamily: FONT.display, color: "#f4f3ef" }}>
      <Fill>{render(showPrev ? st.chapter.from - 1 : frame)}</Fill>
      {dip > 0 ? <Fill style={{ background: C.stage, opacity: dip }} /> : null}
      <Voiceover src={voiceoverSrc} />
    </AbsoluteFill>
  );
}

export function DemoWide({ voiceoverSrc }: MarketingVideoProps) {
  return <StoryVideo timeline={DEMO_TIMELINE} voiceoverSrc={voiceoverSrc} render={(f) => <WideFrame frame={f} timeline={DEMO_TIMELINE} pace="full" />} />;
}

export function DemoTall({ voiceoverSrc }: MarketingVideoProps) {
  return <StoryVideo timeline={DEMO_TIMELINE} voiceoverSrc={voiceoverSrc} render={(f) => <TallFrame frame={f} timeline={DEMO_TIMELINE} pace="full" captionSize={64} />} />;
}

export function SocialCut({ voiceoverSrc }: MarketingVideoProps) {
  return <StoryVideo timeline={SOCIAL_TIMELINE} voiceoverSrc={voiceoverSrc} render={(f) => <TallFrame frame={f} timeline={SOCIAL_TIMELINE} pace="fast" captionSize={70} />} />;
}

export function FullTour({ voiceoverSrc }: MarketingVideoProps) {
  return <StoryVideo timeline={TOUR_TIMELINE} voiceoverSrc={voiceoverSrc} render={(f) => <WideFrame frame={f} timeline={TOUR_TIMELINE} pace="full" />} />;
}

/* ─── Hero loop ──────────────────────────────────────────────────────────── */

const HERO_SCREEN_H = HERO.height / (HERO.width / SCREEN_W);
/** Without the page header the Materials section sits 245 px down the page. */
const HERO_LINES_SCROLL = 245;

export function HeroLoop({ voiceoverSrc }: MarketingVideoProps) {
  const frame = useCurrentFrame();
  const T = HERO_BEATS;
  const f = frame;
  const forward = seg(f, T.toDraft[0], T.toDraft[1]);
  const backward = seg(f, T.back[0], T.back[1]);
  const recording = f >= T.rec[0] && f < T.words[0];
  const review = f >= T.words[0];
  const speaking = eseg(f, T.rec[0], T.rec[0] + 6) * (1 - eseg(f, T.rec[1] - 6, T.rec[1]));
  const tapIn = f > T.tap[0] && f < T.tap[1] ? { x: 195, y: 470, p: seg(f, T.tap[0], T.tap[1]) } : f > T.stop[0] && f < T.stop[1] ? { x: 195, y: 470, p: seg(f, T.stop[0], T.stop[1]) } : null;
  // Before the loop point the capture screen returns to its exact idle state.
  const resetting = f >= T.back[0];
  const capture = (
    <CaptureScreen
      state={resetting ? "idle" : review ? "review" : recording ? "recording" : "idle"}
      frame={f}
      speaking={recording ? speaking : 0}
      elapsed={recording && !resetting ? seg(f, T.rec[0], T.rec[1]) * 24 : 0}
      words={wordsShown(EXAMPLE.transcript, seg(f, T.words[0], T.words[1]))}
      scroll={review && !resetting ? kf(f, [[T.words[0], 0], [T.words[0] + 10, 92]]) : 0}
      tap={resetting ? null : tapIn}
      idleMotion={0}
      showNav
    />
  );
  const count = eseg(f, T.count[0], T.count[1]);
  const ready = eseg(f, T.ready[0], T.ready[1]);
  const [deck, labour] = EXAMPLE.lines;
  const draft = (
    <>
      <QuoteReviewScreen
        header={false}
        scroll={kf(f, [[T.toDraft[0], HERO_LINES_SCROLL], [T.up[0], HERO_LINES_SCROLL], [T.up[1], 0]])}
        total={EXAMPLE.total * count}
        decking={{ enter: eseg(f, T.deck[0], T.deck[1]), quantity: deck.quantity, unitPrice: deck.unitPrice, badge: "library" }}
        labour={{ enter: eseg(f, T.labour[0], T.labour[1]), quantity: labour.quantity, unitPrice: labour.unitPrice }}
      />
      <div
        style={{
          position: "absolute",
          left: 16,
          top: 62,
          zIndex: 60,
          display: "flex",
          opacity: ready,
          transform: `translateY(${(1 - ready) * -16}px) scale(${0.94 + 0.06 * ready})`,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 999,
            border: "1px solid rgba(159,225,187,0.5)",
            background: "rgba(20, 44, 34, 0.94)",
            color: "#9fe1bb",
            padding: "10px 18px",
            fontSize: 15,
            fontWeight: 700,
            boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          }}
        >
          <CheckCircle size={19} weight="fill" /> Ready for your review
        </div>
      </div>
    </>
  );
  return (
    <AbsoluteFill style={{ background: "#0c0f0f", fontFamily: FONT.display }}>
      <Screen scale={HERO.width / SCREEN_W} height={HERO_SCREEN_H}>
        {backward > 0 ? (
          <Push p={backward} from={draft} to={capture} back />
        ) : (
          <Push p={forward} from={capture} to={draft} />
        )}
      </Screen>
      <Voiceover src={voiceoverSrc} />
    </AbsoluteFill>
  );
}

