"use client";

import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * QuoteDemo — the Remotion composition behind the landing page's
 * <DemoReel /> section. A 15-second self-playing product reel:
 *
 *   Scene 1 (0.0–3.5s)   "// voice in"  — mic waveform + the tradie's
 *                         words typing out.
 *   Scene 2 (3.5–10.5s)  "// quote builds itself" — line items spring
 *                         in one at a time while the total counts up.
 *   Scene 3 (10.5–12.5s) "// send"      — GST line lands, the send
 *                         button fills and fires.
 *   Scene 4 (12.5–15s)   "// paid"      — hi-vis PAID stamp slams in.
 *
 * Marketing surface only — same rules as AppShowcase: no imports from
 * src/lib/quote*, no Supabase, demo numbers only (they intentionally
 * match the Hero phone mockup's Bathroom Reno figures so the two
 * surfaces tell one story). All styling is inline with brand hex
 * values (not Tailwind classes) so the composition stays portable if
 * it's ever rendered to MP4 with the Remotion CLI, where the site's
 * stylesheet doesn't exist. Fonts fall back gracefully in that case.
 */

export const QUOTE_DEMO_FPS = 30;
export const QUOTE_DEMO_DURATION = 450; // 15s
export const QUOTE_DEMO_WIDTH = 1280;
export const QUOTE_DEMO_HEIGHT = 720;

const BRAND = "#FF5F15";
const HIVIS = "#FFEA00";
const INK_950 = "#0A0A0A";
const INK_900 = "#111111";
const INK_800 = "#1A1A1A";
const INK_600 = "#262626";
const INK_400 = "#737373";
const INK_200 = "#D4D4D4";

const FONT_DISPLAY =
  'var(--font-archivo-black, "Archivo Black"), "Archivo Black", system-ui, sans-serif';
const FONT_MONO =
  'var(--font-ibm-plex-mono, "IBM Plex Mono"), "IBM Plex Mono", ui-monospace, monospace';
const FONT_SANS =
  'var(--font-ibm-plex-sans, "IBM Plex Sans"), "IBM Plex Sans", system-ui, sans-serif';

const TRANSCRIPT =
  "Bathroom reno for Sarah — new vanity, retile the floor, rainfall shower. Two days labour plus the plumber...";

const LINE_ITEMS = [
  { d: "Vanity unit 900mm + soft-close", v: 980 },
  { d: "Floor tiles 600×600 porcelain · 6m²", v: 540 },
  { d: "Rainfall shower head + arm", v: 380 },
  { d: "Plumbing rough-in & connect", v: 620 },
  { d: "Tiling install · 2 days", v: 1180 },
  { d: "Demo, prep & site clean", v: 491.3 },
] as const;

const SUBTOTAL = 4191.3;
const TOTAL = 4820; // = SUBTOTAL + 15% GST ($628.70)

const nzd = (n: number) =>
  n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Section label in the site's `// comment` voice. */
function Label({ children, color = BRAND }: { children: string; color?: string }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 18,
        letterSpacing: "0.25em",
        textTransform: "uppercase",
        color,
      }}
    >
      {children}
    </div>
  );
}

/** Scene 1 — voice waveform + typing transcript. */
function VoiceScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const charsShown = Math.floor(
    interpolate(frame, [12, 95], [0, TRANSCRIPT.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  // Whole scene (incl. its Label) fades before scene 2 starts.
  const sceneOut = interpolate(frame, [92, 104], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 42,
        padding: 80,
        opacity: sceneOut,
      }}
    >
      <div style={{ transform: `scale(${enter})` }}>
        <Label>{"// voice in"}</Label>
      </div>

      {/* Waveform — 28 bars driven by out-of-phase sine waves. */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, height: 110 }}>
        {Array.from({ length: 28 }).map((_, i) => {
          const talking = frame > 8 && frame < 96;
          const h = talking
            ? 14 +
              Math.abs(Math.sin(frame / 3.1 + i * 0.9)) * 52 +
              Math.abs(Math.sin(frame / 7.7 + i * 1.7)) * 34
            : 8;
          return (
            <div
              key={i}
              style={{
                width: 9,
                height: h,
                borderRadius: 4,
                background: i % 5 === 2 ? HIVIS : BRAND,
                opacity: enter,
              }}
            />
          );
        })}
      </div>

      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 27,
          lineHeight: 1.5,
          color: INK_200,
          maxWidth: 860,
          textAlign: "center",
          minHeight: 120,
        }}
      >
        “{TRANSCRIPT.slice(0, charsShown)}
        <span style={{ color: BRAND, opacity: frame % 16 < 8 ? 1 : 0 }}>▎</span>
      </div>
    </AbsoluteFill>
  );
}

/** Scenes 2+3 — the quote assembles itself, then sends. */
function QuoteBuildScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardIn = spring({ frame, fps, config: { damping: 15, stiffness: 90 } });

  // Each line item springs in 22 frames after the previous one.
  const itemAt = (i: number) => 14 + i * 22;
  const lastItemLanded = itemAt(LINE_ITEMS.length - 1) + 12;

  // Running total: sums the portion of each item already revealed.
  let running = 0;
  LINE_ITEMS.forEach((it, i) => {
    running += interpolate(frame, [itemAt(i), itemAt(i) + 14], [0, it.v], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  });
  const showGst = frame > lastItemLanded + 6;
  const displayTotal = showGst
    ? interpolate(frame, [lastItemLanded + 6, lastItemLanded + 26], [SUBTOTAL, TOTAL], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : running;

  // Send button: fills, then "fires" with a flash.
  const sendStart = lastItemLanded + 34;
  const sendFill = interpolate(frame, [sendStart, sendStart + 24], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fired = frame > sendStart + 26;
  const firedPulse = spring({
    frame: Math.max(0, frame - (sendStart + 26)),
    fps,
    config: { damping: 9, stiffness: 190 },
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 60 }}>
      <div
        style={{
          width: 780,
          background: "#FFFFFF",
          border: `3px solid ${INK_950}`,
          boxShadow: `14px 14px 0 ${BRAND}`,
          opacity: cardIn,
          transform: `translateY(${(1 - cardIn) * 90}px)`,
        }}
      >
        {/* Card header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 28px",
            borderBottom: `2px solid ${INK_950}`,
            background: "#F5F5F5",
          }}
        >
          <div>
            <Label>{"// quote builds itself"}</Label>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 30,
                textTransform: "uppercase",
                letterSpacing: "-0.03em",
                color: INK_950,
                marginTop: 6,
              }}
            >
              Bathroom Reno — Sarah K
            </div>
          </div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 15,
              padding: "6px 12px",
              background: BRAND,
              color: "#fff",
              letterSpacing: "0.15em",
            }}
          >
            Q-202607-3B
          </div>
        </div>

        {/* Line items */}
        <div style={{ padding: "10px 28px" }}>
          {LINE_ITEMS.map((it, i) => {
            const s = spring({
              frame: Math.max(0, frame - itemAt(i)),
              fps,
              config: { damping: 13, stiffness: 150 },
            });
            return (
              <div
                key={it.d}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "11px 0",
                  borderBottom: i < LINE_ITEMS.length - 1 ? "1px solid #E5E5E5" : "none",
                  opacity: s,
                  transform: `translateX(${(1 - s) * -46}px)`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      color: BRAND,
                      fontSize: 19,
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                  <span style={{ fontFamily: FONT_SANS, fontSize: 21, color: INK_950 }}>
                    {it.d}
                  </span>
                </div>
                <span style={{ fontFamily: FONT_MONO, fontSize: 20, color: INK_950 }}>
                  ${nzd(it.v)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Totals + send */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "18px 28px",
            borderTop: `2px solid ${INK_950}`,
            background: INK_950,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 14,
                letterSpacing: "0.2em",
                color: showGst ? HIVIS : INK_400,
                textTransform: "uppercase",
                minHeight: 18,
              }}
            >
              {showGst ? "GST 15% in · NZD" : "adding it up..."}
            </div>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 52,
                color: BRAND,
                letterSpacing: "-0.03em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ${nzd(displayTotal)}
            </div>
          </div>

          <div
            style={{
              position: "relative",
              overflow: "hidden",
              border: `2px solid ${fired ? HIVIS : BRAND}`,
              padding: "16px 30px",
              fontFamily: FONT_DISPLAY,
              fontSize: 22,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              color: "#fff",
              transform: fired ? `scale(${1 + (1 - firedPulse) * 0.12})` : undefined,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: fired ? HIVIS : BRAND,
                width: `${sendFill}%`,
              }}
            />
            <span style={{ position: "relative", color: fired ? INK_950 : "#fff" }}>
              {fired ? "Sent ✓" : "Send to client"}
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** Scene 4 — PAID stamp slams onto the frozen quote card. */
function PaidScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slam = spring({ frame: Math.max(0, frame - 6), fps, config: { damping: 10, stiffness: 210 } });
  const sub = spring({ frame: Math.max(0, frame - 22), fps, config: { damping: 13, stiffness: 130 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 30 }}>
      <div
        style={{
          transform: `scale(${0.4 + slam * 0.6}) rotate(${-45 + slam * 33}deg)`,
          opacity: Math.min(1, slam * 2),
          background: HIVIS,
          color: INK_950,
          border: `4px solid ${INK_950}`,
          boxShadow: `16px 16px 0 ${BRAND}`,
          padding: "34px 74px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 17,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            opacity: 0.7,
          }}
        >
          Status
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 130,
            lineHeight: 0.95,
            textTransform: "uppercase",
            letterSpacing: "-0.04em",
          }}
        >
          PAID
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 17,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            opacity: 0.7,
            marginTop: 8,
          }}
        >
          $4,820.00 · 3 days
        </div>
      </div>

      <div
        style={{
          opacity: sub,
          transform: `translateY(${(1 - sub) * 30}px)`,
          fontFamily: FONT_DISPLAY,
          fontSize: 34,
          textTransform: "uppercase",
          letterSpacing: "-0.02em",
          color: "#fff",
          textAlign: "center",
        }}
      >
        Talked. Quoted. <span style={{ color: BRAND }}>Paid.</span>
      </div>
    </AbsoluteFill>
  );
}

/** Root composition. */
export function QuoteDemo() {
  const frame = useCurrentFrame();

  // Fade out only at the tail so the loop restart reads as a cut, not
  // a flash. Deliberately NO fade-in at frame 0: a paused player (e.g.
  // reduced-motion users, or before the IntersectionObserver starts
  // playback) sits on frame 0, which must show real content — an
  // opacity-0 first frame renders as a solid black box.
  const loopFade = interpolate(
    frame,
    [QUOTE_DEMO_DURATION - 10, QUOTE_DEMO_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ background: INK_900 }}>
      {/* Backdrop: faint blueprint grid + brand glow, echoing the site. */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${INK_800} 1px, transparent 1px), linear-gradient(90deg, ${INK_800} 1px, transparent 1px)`,
          backgroundSize: "44px 44px",
          opacity: 0.55,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(600px 400px at 78% 18%, ${BRAND}26, transparent 70%), radial-gradient(520px 380px at 18% 85%, ${HIVIS}14, transparent 70%)`,
        }}
      />

      <AbsoluteFill style={{ opacity: loopFade }}>
        <Sequence durationInFrames={105}>
          <VoiceScene />
        </Sequence>
        <Sequence from={105} durationInFrames={270}>
          <QuoteBuildScene />
        </Sequence>
        <Sequence from={375}>
          <PaidScene />
        </Sequence>
      </AbsoluteFill>

      {/* Progress tick along the bottom — measuring-tape nod. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 6,
          width: `${(frame / QUOTE_DEMO_DURATION) * 100}%`,
          background: BRAND,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 20,
          bottom: 16,
          fontFamily: FONT_MONO,
          fontSize: 13,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: INK_400,
        }}
      >
        demo data · 15 sec
      </div>
    </AbsoluteFill>
  );
}

/** Divider between scene borders (kept for future scenes). */
export const QUOTE_DEMO_BORDER = INK_600;
