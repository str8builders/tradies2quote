/**
 * QuoteVideo — a 15-second portrait video of one quote for the client's
 * phone (720×1280, 30 fps, 450 frames, no audio).
 *
 *   0–2 s    the tradie's logo and business name
 *   2–5 s    "Quote for {first name}" and the job in one line
 *   5–10 s   up to four key items appear one by one with their amounts
 *   10–13 s  the total counts up and lands on the exact figure
 *   13–15 s  "Tap the link to accept" and the valid-until date; the exact
 *            total stays on screen to the last frame
 *
 * Every frame is a pure function of the frame number and the props built by
 * src/lib/quote-video/props.ts: no clock, no randomness, no network apart from
 * the two Google Fonts families (the logo arrives as a data: URI).
 */
import type { CSSProperties } from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { HandTap } from "@phosphor-icons/react/dist/ssr";
import type { QuoteVideoProps } from "../../lib/quote-video/props";
import { QUOTE_VIDEO_TIMELINE as T } from "../../lib/quote-video/constants";
import { QV_FONT, useQuoteVideoFonts } from "./fonts";
import { fitDisplaySize, logoBox, moneyFontSize, totalTextAt } from "./layout";

const C = {
  ink950: "#0A0A0A",
  ink900: "#111111",
  ink700: "#1F1F1F",
  ink300: "#A8A8A8",
  ink200: "#D4D4D4",
  ink100: "#E5E5E5",
  brand: "#FF5F15",
  hivis: "#FFEA00",
  white: "#FFFFFF",
} as const;

const W = 720;
const PAD = 56;
const CONTENT_W = W - PAD * 2;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);

/** 0 → 1 between frames a and b (eased). */
const rise = (frame: number, a: number, b: number) => interpolate(frame, [a, b], [0, 1], { ...clamp, easing: ease });
/** 1 → 0 between frames a and b. */
const fall = (frame: number, a: number, b: number) => interpolate(frame, [a, b], [1, 0], clamp);

const eyebrow: CSSProperties = {
  fontFamily: QV_FONT.body,
  fontWeight: 600,
  fontSize: 24,
  letterSpacing: "0.3em",
  textTransform: "uppercase",
  color: C.hivis,
};

const clampLines = (lines: number): CSSProperties => ({
  display: "-webkit-box",
  WebkitLineClamp: lines,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  overflowWrap: "anywhere",
});

const tape = (stripe: number, offset = 0): CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(135deg, ${C.hivis} 0 ${stripe}px, ${C.ink900} ${stripe}px ${stripe * 1.7}px)`,
  backgroundPosition: `${offset}px 0`,
});

function LogoTile({ src, aspect, maxW, maxH, radius }: { src: string; aspect: number | null; maxW: number; maxH: number; radius: number }) {
  const box = logoBox(aspect, maxW, maxH);
  const pad = Math.round(Math.min(box.width, box.height) * 0.12);
  return (
    <div
      style={{
        width: box.width,
        height: box.height,
        borderRadius: radius,
        background: C.white,
        padding: pad,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxShadow: "0 24px 60px -24px rgba(0,0,0,0.9)",
        flexShrink: 0,
      }}
    >
      <Img src={src} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
    </div>
  );
}

function Backdrop({ frame }: { frame: number }) {
  const drift = frame / 450;
  return (
    <AbsoluteFill style={{ background: C.ink950 }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 85% 55% at ${72 - drift * 22}% ${88 - drift * 14}%, rgba(255,95,21,0.24), transparent 70%), radial-gradient(ellipse 70% 40% at 8% 0%, rgba(255,234,0,0.07), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 85%)",
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 8, background: C.hivis }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 18, ...tape(22, frame * 1.2) }} />
    </AbsoluteFill>
  );
}

/** Small logo + business name at the top from the second scene on. */
function Header({ props, frame }: { props: QuoteVideoProps; frame: number }) {
  const p = rise(frame, 48, 64);
  return (
    <div
      style={{
        position: "absolute",
        left: PAD,
        right: PAD,
        top: 60,
        height: 84,
        display: "flex",
        alignItems: "center",
        gap: 20,
        opacity: p,
        transform: `translateY(${(1 - p) * -18}px)`,
      }}
    >
      {props.logoSrc ? <LogoTile src={props.logoSrc} aspect={props.logoAspect} maxW={200} maxH={76} radius={16} /> : null}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: QV_FONT.body,
          fontWeight: 600,
          fontSize: 30,
          lineHeight: 1.2,
          color: C.white,
          ...clampLines(2),
        }}
      >
        {props.businessName}
      </div>
    </div>
  );
}

function BrandScene({ props, frame, fps }: { props: QuoteVideoProps; frame: number; fps: number }) {
  const hasLogo = Boolean(props.logoSrc);
  const pop = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const label = rise(frame, 2, 16);
  const name = rise(frame, 8, 24);
  const stripe = rise(frame, 16, 38);
  const out = fall(frame, 42, 56);
  const nameText = props.businessName.toUpperCase();
  const size = fitDisplaySize(nameText, { max: hasLogo ? 72 : 92, min: 34, width: CONTENT_W, maxLines: 3 });
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: `0 ${PAD}px`,
        opacity: out,
        transform: `translateY(${(1 - out) * -36}px)`,
      }}
    >
      <div style={{ ...eyebrow, opacity: label }}>A quote from</div>
      {props.logoSrc ? (
        <div style={{ marginTop: 44, opacity: Math.min(1, pop * 1.4), transform: `scale(${0.82 + 0.18 * pop})` }}>
          <LogoTile src={props.logoSrc} aspect={props.logoAspect} maxW={520} maxH={280} radius={40} />
        </div>
      ) : null}
      <div
        style={{
          marginTop: hasLogo ? 52 : 36,
          maxWidth: CONTENT_W,
          fontFamily: QV_FONT.display,
          fontSize: size,
          lineHeight: 1.04,
          color: C.white,
          textAlign: "center",
          textWrap: "balance",
          opacity: name,
          transform: `translateY(${(1 - name) * 26}px)`,
          ...clampLines(3),
        }}
      >
        {nameText}
      </div>
      <div style={{ marginTop: 40, width: 280, height: 14, borderRadius: 3, ...tape(18), transform: `scaleX(${stripe})` }} />
    </AbsoluteFill>
  );
}

function ClientScene({ props, frame, fps }: { props: QuoteVideoProps; frame: number; fps: number }) {
  const label = rise(frame, 52, 66);
  const pop = spring({ frame: frame - 56, fps, config: { damping: 14, stiffness: 140 } });
  const job = rise(frame, 72, 90);
  const out = fall(frame, 138, 150);
  const nameText = (props.clientName ?? "you").toUpperCase();
  const size = fitDisplaySize(nameText, { max: 150, min: 56, width: CONTENT_W, maxLines: 2 });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        padding: `40px ${PAD}px 120px`,
        opacity: out,
        transform: `translateY(${(1 - out) * -30}px)`,
      }}
    >
      <div style={{ ...eyebrow, opacity: label }}>Quote for</div>
      <div
        style={{
          marginTop: 18,
          fontFamily: QV_FONT.display,
          fontSize: size,
          lineHeight: 1,
          color: C.brand,
          opacity: Math.min(1, pop * 1.3),
          transform: `scale(${0.9 + 0.1 * pop})`,
          transformOrigin: "left center",
          textShadow: "0 0 60px rgba(255,95,21,0.35)",
          ...clampLines(2),
        }}
      >
        {nameText}
      </div>
      {props.jobLine ? (
        <div
          style={{
            marginTop: 40,
            paddingLeft: 22,
            borderLeft: `6px solid ${C.hivis}`,
            fontFamily: QV_FONT.body,
            fontWeight: 500,
            fontSize: 38,
            lineHeight: 1.25,
            color: C.ink100,
            opacity: job,
            transform: `translateY(${(1 - job) * 20}px)`,
            ...clampLines(2),
          }}
        >
          {props.jobLine}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

const ITEM_START = 162;
const ITEM_STEP = 22;

function ItemsScene({ props, frame, fps }: { props: QuoteVideoProps; frame: number; fps: number }) {
  const label = rise(frame, 152, 166);
  const out = fall(frame, 288, 300);
  const moreAt = ITEM_START + props.items.length * ITEM_STEP + 4;
  const more = rise(frame, moreAt, moreAt + 16);
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        padding: `150px ${PAD}px 60px`,
        opacity: out,
        transform: `translateY(${(1 - out) * -30}px)`,
      }}
    >
      <div style={{ ...eyebrow, opacity: label }}>What&apos;s included</div>
      <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 18 }}>
        {props.items.map((item, i) => {
          const p = spring({ frame: frame - (ITEM_START + i * ITEM_STEP), fps, config: { damping: 18, stiffness: 150 } });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                padding: "26px 28px 26px 24px",
                borderRadius: 20,
                background: "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
                border: "1px solid rgba(255,255,255,0.09)",
                borderLeft: `6px solid ${C.brand}`,
                opacity: Math.min(1, p * 1.2),
                transform: `translateX(${(1 - p) * 90}px)`,
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: QV_FONT.body,
                  fontWeight: 500,
                  fontSize: 30,
                  lineHeight: 1.22,
                  color: C.white,
                  ...clampLines(2),
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  flexShrink: 0,
                  fontFamily: QV_FONT.body,
                  fontWeight: 700,
                  fontSize: 32,
                  color: C.white,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {item.amount}
              </div>
            </div>
          );
        })}
      </div>
      {props.items.length === 0 ? (
        <div style={{ marginTop: 26, fontFamily: QV_FONT.body, fontWeight: 500, fontSize: 36, color: C.ink100, opacity: more }}>
          The full breakdown is on your quote.
        </div>
      ) : props.moreItems > 0 ? (
        <div style={{ marginTop: 26, fontFamily: QV_FONT.body, fontWeight: 500, fontSize: 28, color: C.ink300, opacity: more }}>
          + {props.moreItems} more {props.moreItems === 1 ? "item" : "items"} on your quote
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

/** Total (10–15 s): count-up, land, then lift to make room for the call to action. */
const TOTAL_TOP_CENTRED = 500;
const TOTAL_TOP_LIFTED = 380;
const CTA_TOP = 712;
const VALID_TOP = 900;

function TotalScene({ props, frame, fps }: { props: QuoteVideoProps; frame: number; fps: number }) {
  const enter = rise(frame, 300, 316);
  const landed = frame >= T.countEnd;
  const land = spring({ frame: frame - T.countEnd, fps, config: { damping: 11, stiffness: 170 } });
  const pulse = landed ? 1 + 0.05 * Math.sin(Math.min(1, land) * Math.PI) : 1;
  const lift = spring({ frame: frame - T.accept.from, fps, config: { damping: 18, stiffness: 110 } });
  const top = TOTAL_TOP_CENTRED + (TOTAL_TOP_LIFTED - TOTAL_TOP_CENTRED) * lift;
  const note = rise(frame, 326, 342);
  const underline = rise(frame, T.countEnd - 4, T.countEnd + 12);
  const cta = spring({ frame: frame - (T.accept.from + 6), fps, config: { damping: 13, stiffness: 140 } });
  const valid = rise(frame, T.accept.from + 18, T.accept.from + 34);
  const nudge = frame > T.accept.from + 30 ? Math.sin(((frame - T.accept.from - 30) / 30) * Math.PI * 2) * 6 : 0;
  const size = moneyFontSize(props.total.text, CONTENT_W - 8);

  return (
    <AbsoluteFill style={{ opacity: enter }}>
      <div style={{ position: "absolute", left: PAD, right: PAD, top, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...eyebrow, fontSize: 26 }}>Total</div>
        <div
          style={{
            marginTop: 14,
            fontFamily: QV_FONT.display,
            fontSize: size,
            lineHeight: 1.05,
            color: C.white,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
            transform: `scale(${pulse})`,
            textShadow: `0 0 ${40 + 40 * underline}px rgba(255,95,21,${0.25 + 0.25 * underline})`,
          }}
        >
          {totalTextAt(frame, props.total)}
        </div>
        <div style={{ marginTop: 16, width: 300, height: 10, borderRadius: 3, background: C.brand, transform: `scaleX(${underline})` }} />
        {props.taxNote ? (
          <div style={{ marginTop: 20, fontFamily: QV_FONT.body, fontWeight: 500, fontSize: 36, color: C.ink200, opacity: note }}>
            {props.taxNote}
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: "absolute",
          left: PAD,
          right: PAD,
          top: CTA_TOP,
          display: "flex",
          alignItems: "center",
          gap: 28,
          opacity: Math.min(1, cta * 1.3),
          transform: `translateY(${(1 - cta) * 60}px)`,
        }}
      >
        <div
          style={{
            width: 128,
            height: 128,
            borderRadius: 999,
            background: C.hivis,
            color: C.ink900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transform: `translateY(${nudge}px)`,
            boxShadow: "0 18px 50px -14px rgba(255,234,0,0.55)",
          }}
        >
          <HandTap size={70} weight="fill" />
        </div>
        <div style={{ fontFamily: QV_FONT.display, fontSize: 52, lineHeight: 1.04, color: C.white }}>
          TAP THE LINK
          <br />
          TO <span style={{ color: C.brand }}>ACCEPT</span>
        </div>
      </div>

      {props.validUntil ? (
        <div
          style={{
            position: "absolute",
            left: PAD,
            right: PAD,
            top: VALID_TOP,
            display: "flex",
            justifyContent: "center",
            opacity: valid,
            transform: `translateY(${(1 - valid) * 16}px)`,
          }}
        >
          <div
            style={{
              padding: "16px 30px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.05)",
              fontFamily: QV_FONT.body,
              fontWeight: 500,
              fontSize: 32,
              color: C.ink100,
              whiteSpace: "nowrap",
            }}
          >
            Valid until <span style={{ fontWeight: 700, color: C.white }}>{props.validUntil}</span>
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

export function QuoteVideo(props: QuoteVideoProps) {
  useQuoteVideoFonts();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: C.ink950, overflow: "hidden" }}>
      <Backdrop frame={frame} />
      {frame < T.client.from ? <BrandScene props={props} frame={frame} fps={fps} /> : null}
      {frame >= T.client.from - 14 ? <Header props={props} frame={frame} /> : null}
      {frame >= T.client.from - 10 && frame < T.items.from + 2 ? <ClientScene props={props} frame={frame} fps={fps} /> : null}
      {frame >= T.items.from - 2 && frame < T.total.from + 2 ? <ItemsScene props={props} frame={frame} fps={fps} /> : null}
      {frame >= T.total.from - 2 ? <TotalScene props={props} frame={frame} fps={fps} /> : null}
    </AbsoluteFill>
  );
}
