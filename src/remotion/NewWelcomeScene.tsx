"use client";
import { useEffect } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { LOGO_ASPECT, LOGO_PIECES, LOGO_SRC, preloadLogoPieces } from "./logo-pieces";
import { hash01 } from "./marketing/anim";

/**
 * The new-look welcome after signing in: a site being set out, then the
 * T2Q mark built on it, then you're greeted. Portrait, full screen, 6.5 s.
 * Pure and frame-driven: the same art is the first-paint poster (frame 0)
 * and every frame of the player.
 *
 *    0– 40  a blueprint grid draws itself out from the middle
 *   10– 60  an orange tape case slides in and its hi-vis blade shoots across,
 *           the readout counting up to 2400 mm
 *   44– 80  the logo's T slams down from the left and its Q from the right:
 *           the screen shakes, dust kicks out
 *   72–104  the orange 2 drops in like a stamped steel plate: sparks, and the
 *           three land as the owner's T2Q logo (logo-pieces.ts)
 *  100–128  a hi-vis caution stripe sweeps through the mark
 *  112–160  "Good morning," types in, then your name in orange
 *  150–184  chips pop up: today's date, "Ready to quote"
 *  184–195  everything holds, then the app fades in
 *
 * `calm` (Reduce Motion): the same sequence and timing, without the shake,
 * dust and sparks.
 */

export const NEW_WELCOME_FPS = 30;
export const NEW_WELCOME_FRAMES = 195;
export const NEW_WELCOME_WIDTH = 720;
export const NEW_WELCOME_HEIGHT = 1280;

const ORANGE = "#FF5F15";
const ORANGE_TEXT = "#FF8A4C";
const HIVIS = "#FFEA00";
const INK = "#121211";
const TEXT = "#F5F4F0";
const GRID = "rgba(88, 166, 255, 0.16)";
const GRID_STRONG = "rgba(88, 166, 255, 0.3)";
const DISPLAY = 'var(--font-archivo-black), "Archivo Black", "Arial Black", system-ui, sans-serif';
const SANS = 'var(--font-ibm-plex-sans), "IBM Plex Sans", system-ui, sans-serif';

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const lerp = (frame: number, input: number[], output: number[]) => interpolate(frame, input, output, clamp);

export interface NewWelcomeProps {
  greeting: string;
  name: string | null;
  today: string;
  calm?: boolean;
}

function Grid({ frame }: { frame: number }) {
  const lines: React.ReactNode[] = [];
  const step = 80;
  for (let i = 0; i <= NEW_WELCOME_WIDTH / step; i++) {
    const x = i * step;
    const delay = Math.abs(x - NEW_WELCOME_WIDTH / 2) / 30;
    const p = lerp(frame, [delay, delay + 26], [0, 1]);
    lines.push(<line key={`v${i}`} x1={x} x2={x} y1={640 - 640 * p} y2={640 + 640 * p} stroke={i % 4 === 0 ? GRID_STRONG : GRID} strokeWidth={i % 4 === 0 ? 2 : 1} />);
  }
  for (let j = 0; j <= NEW_WELCOME_HEIGHT / step; j++) {
    const y = j * step;
    const delay = Math.abs(y - NEW_WELCOME_HEIGHT / 2) / 40;
    const p = lerp(frame, [delay, delay + 26], [0, 1]);
    lines.push(<line key={`h${j}`} y1={y} y2={y} x1={360 - 360 * p} x2={360 + 360 * p} stroke={j % 4 === 0 ? GRID_STRONG : GRID} strokeWidth={j % 4 === 0 ? 2 : 1} />);
  }
  const fade = lerp(frame, [150, 195], [1, 0.45]);
  return (
    <svg viewBox={`0 0 ${NEW_WELCOME_WIDTH} ${NEW_WELCOME_HEIGHT}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: fade }} aria-hidden>
      {lines}
    </svg>
  );
}

function Tape({ frame }: { frame: number }) {
  const caseIn = lerp(frame, [10, 22], [-140, 0]);
  const blade = lerp(frame, [18, 58], [0, 1]);
  const eased = 1 - Math.pow(1 - blade, 3);
  const length = 560 * eased;
  const reading = Math.round(2400 * eased);
  const y = 820;
  const ticks: React.ReactNode[] = [];
  for (let mm = 0; mm <= 2400; mm += 50) {
    const x = 96 + (mm / 2400) * 560;
    if (x > 96 + length) break;
    const big = mm % 500 === 0;
    ticks.push(<line key={mm} x1={x} x2={x} y1={y - 16} y2={y - 16 + (big ? 20 : 10)} stroke={INK} strokeWidth={big ? 3 : 1.5} />);
  }
  return (
    <svg viewBox={`0 0 ${NEW_WELCOME_WIDTH} ${NEW_WELCOME_HEIGHT}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
      <g transform={`translate(${caseIn} 0)`}>
        <rect x={40} y={y - 28} width={length + 70} height={32} rx={4} fill={HIVIS} opacity={blade > 0 ? 1 : 0} />
        {ticks}
        <rect x={20} y={y - 52} width={84} height={80} rx={18} fill={ORANGE} />
        <circle cx={62} cy={y - 12} r={20} fill={INK} opacity={0.45} />
        <rect x={96 + length} y={y - 34} width={10} height={44} rx={2} fill="#9A9890" opacity={blade > 0 ? 1 : 0} />
      </g>
      <text x={Math.min(96 + length, NEW_WELCOME_WIDTH - 110)} y={y + 58} fill={HIVIS} fontFamily={SANS} fontSize={30} fontWeight={700} textAnchor="middle" opacity={lerp(frame, [22, 30, 150, 170], [0, 1, 1, 0])}>
        {reading} mm
      </text>
    </svg>
  );
}

/** One piece of the logo, on the logo's full canvas (so the three land exactly as the mark). */
function Piece({ piece, style }: { piece: (typeof LOGO_PIECES)[keyof typeof LOGO_PIECES]; style: React.CSSProperties }) {
  return (
    // A plain <img>: the art is also drawn outside a composition (the
    // first-paint poster), where Remotion's <Img> can't run; the pieces are
    // preloaded before the player starts (NewWelcomeScene).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={piece.src}
      alt=""
      draggable={false}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transformOrigin: piece.origin, ...style }}
    />
  );
}

/** The logo, 600 wide, centred on the impact point (360, 560). */
const LOGO_WIDTH = 600;
const LOGO_HEIGHT = LOGO_WIDTH / LOGO_ASPECT;

function Dust({ frame, at, x }: { frame: number; at: number; x: number }) {
  const p = lerp(frame, [at, at + 24], [0, 1]);
  if (p <= 0 || p >= 1) return null;
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => {
        const dir = (hash01(i + at) - 0.5) * 2;
        const dx = dir * 160 * p;
        const dy = -60 * p * hash01(i * 3 + at) + 40 * p * p;
        return <span key={i} style={{ position: "absolute", left: x + dx, top: 560 + dy, width: 10 + 8 * hash01(i + 7), height: 10 + 8 * hash01(i + 7), borderRadius: "50%", background: "rgba(200, 190, 170, 0.5)", opacity: 1 - p, filter: "blur(2px)" }} />;
      })}
    </>
  );
}

function Sparks({ frame, at }: { frame: number; at: number }) {
  const p = lerp(frame, [at, at + 18], [0, 1]);
  if (p <= 0 || p >= 1) return null;
  return (
    <svg viewBox={`0 0 ${NEW_WELCOME_WIDTH} ${NEW_WELCOME_HEIGHT}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
      {Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2 + hash01(i) * 0.3;
        const r1 = 40 + 120 * p;
        const r2 = r1 + 36 * (1 - p);
        const cx = 360;
        const cy = 560;
        return <line key={i} x1={cx + Math.cos(angle) * r1} y1={cy + Math.sin(angle) * r1} x2={cx + Math.cos(angle) * r2} y2={cy + Math.sin(angle) * r2} stroke={i % 3 === 0 ? HIVIS : ORANGE} strokeWidth={4} strokeLinecap="round" opacity={1 - p} />;
      })}
    </svg>
  );
}

/** Width the greeting lines may use (the composition less 40 px each side). */
const LINE_WIDTH = NEW_WELCOME_WIDTH - 80;

/**
 * A font size at which the WHOLE line fits on one line, worked out before
 * typing starts (Archivo Black's advance widths, a little generous). A long
 * business name ("STR8 Builders") used to fill the line exactly, so the
 * blinking caret pushed it over and it jumped between one and two lines.
 */
export function fitFontSize(text: string, max: number): number {
  let em = 0;
  for (const ch of text) em += /[MW]/.test(ch) ? 1.05 : /[A-Z0-9]/.test(ch) ? 0.8 : /[mw]/.test(ch) ? 1.0 : /[a-z]/.test(ch) ? 0.66 : ch === " " ? 0.32 : 0.4;
  return Math.max(28, Math.min(max, Math.floor(LINE_WIDTH / Math.max(em, 1))));
}

/**
 * A line that types in without moving: the whole text is laid out from the
 * first frame (untyped letters hidden, not missing), so a centred line never
 * slides as it grows, and the caret takes no room, so blinking can't reflow.
 */
function TypedLine({ text, shown, caret, size, color }: { text: string; shown: number; caret: boolean; size: number; color?: string }) {
  return (
    <div style={{ whiteSpace: "nowrap", fontSize: size, color }}>
      {text.slice(0, shown)}
      <span style={{ display: "inline-block", width: 0, position: "relative" }}>
        <span style={{ position: "absolute", left: 0, bottom: "-0.1em", color: ORANGE, visibility: caret ? "visible" : "hidden" }}>|</span>
      </span>
      <span style={{ visibility: "hidden" }}>{text.slice(shown)}</span>
    </div>
  );
}

/** One frame of the welcome (also the poster). */
export function NewWelcomeArt({ frame, fps, greeting, name, today, calm = false }: NewWelcomeProps & { frame: number; fps: number }) {
  const s = (from: number, damping: number, stiffness: number) => spring({ frame: frame - from, fps, config: { damping, stiffness } });
  const t = s(44, 11, 170);
  const q = s(50, 11, 170);
  const two = s(72, 9, 190);
  const impactT = 54;
  const impactQ = 60;
  const impact2 = 84;
  const shakeAmount = calm
    ? 0
    : [impactT, impactQ, impact2].reduce((sum, at) => sum + lerp(frame, [at, at + 2, at + 14], [0, 1, 0]) * (at === impact2 ? 14 : 9), 0);
  const shakeX = Math.sin(frame * 2.3) * shakeAmount;
  const shakeY = Math.cos(frame * 3.1) * shakeAmount * 0.6;
  const stripe = lerp(frame, [100, 128], [-1, 1]);
  const glow = lerp(frame, [84, 110], [0, 1]);

  const typed = lerp(frame, [112, 150], [0, 1]);
  const greetingText = name ? `${greeting},` : `${greeting}.`;
  const tail = name ?? "Let's get to work";
  const allChars = greetingText.length + tail.length;
  const shown = Math.floor(typed * allChars + 1e-6);
  const headShown = greetingText.slice(0, Math.min(shown, greetingText.length));
  const tailShown = tail.slice(0, Math.max(0, shown - greetingText.length));
  const caret = frame >= 112 && frame < 170 && Math.floor(frame / 8) % 2 === 0;

  const chip = (at: number) => s(at, 12, 180);
  const chipA = chip(150);
  const chipB = chip(160);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", transform: `translate(${shakeX}px, ${shakeY}px)` }}>
      <Grid frame={frame} />
      <Tape frame={frame} />

      <div aria-hidden style={{ position: "absolute", left: 100, top: 300, width: 520, height: 520, borderRadius: "50%", background: `radial-gradient(circle, rgba(255,95,21,${0.35 * glow}), transparent 65%)` }} />
      <div data-testid="welcome-logo" style={{ position: "absolute", left: 360 - LOGO_WIDTH / 2, top: 560 - LOGO_HEIGHT / 2, width: LOGO_WIDTH, height: LOGO_HEIGHT }}>
        <Piece piece={LOGO_PIECES.T} style={{ transform: `translate(${(1 - t) * -420}px, ${(1 - t) * -260}px) rotate(${(1 - t) * -24}deg)`, opacity: Math.min(1, t * 2) }} />
        <Piece
          piece={LOGO_PIECES.two}
          style={{
            transform: `translateY(${(1 - two) * -620}px) perspective(600px) rotateX(${(1 - Math.min(1, two)) * 70}deg)`,
            opacity: Math.min(1, two * 2),
            filter: `drop-shadow(0 0 ${40 * glow}px rgba(255,95,21,${0.6 * glow}))`,
          }}
        />
        <Piece piece={LOGO_PIECES.Q} style={{ transform: `translate(${(1 - q) * 420}px, ${(1 - q) * -260}px) rotate(${(1 - q) * 24}deg)`, opacity: Math.min(1, q * 2) }} />
        {/* The caution stripe sweeps across the logo itself (masked to its shape). */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
            WebkitMaskImage: `url(${LOGO_SRC})`,
            maskImage: `url(${LOGO_SRC})`,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
          }}
        >
          <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", left: `${30 + stripe * 80}%`, transform: "skewX(-20deg)", background: `repeating-linear-gradient(135deg, ${HIVIS} 0 18px, transparent 18px 36px)`, opacity: stripe > -1 && stripe < 1 ? 0.5 : 0 }} />
        </div>
      </div>

      {calm ? null : (
        <>
          <Dust frame={frame} at={impactT} x={240} />
          <Dust frame={frame} at={impactQ} x={470} />
          <Sparks frame={frame} at={impact2} />
        </>
      )}

      <div style={{ position: "absolute", left: 40, right: 40, top: 900, textAlign: "center", fontFamily: DISPLAY, lineHeight: 1.1, color: TEXT }}>
        <TypedLine text={greetingText} shown={headShown.length} caret={shown <= greetingText.length && caret} size={fitFontSize(greetingText, 64)} />
        <TypedLine text={tail} shown={tailShown.length} caret={shown > greetingText.length && caret} size={fitFontSize(tail, name ? 72 : 44)} color={ORANGE_TEXT} />
      </div>

      {/* One line each, both on screen: the longest date ("Wednesday 30 September") used to wrap and run off the edges. */}
      <div style={{ position: "absolute", left: 24, right: 24, top: 1110, display: "flex", justifyContent: "center", gap: 14, fontFamily: SANS, fontSize: 24, fontWeight: 700, color: TEXT, whiteSpace: "nowrap" }}>
        {[
          { text: today, dot: "#58A6FF", p: chipA },
          { text: "Ready to quote", dot: HIVIS, p: chipB },
        ].map(({ text, dot, p }) => (
          <span key={text} style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "12px 20px", borderRadius: 999, background: "#1B1B1A", border: "2px solid #34332F", transform: `translateY(${(1 - p) * 60}px) scale(${0.8 + 0.2 * Math.min(1, p)})`, opacity: Math.min(1, p * 1.5) }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: dot, flexShrink: 0 }} />
            {text}
          </span>
        ))}
      </div>

    </div>
  );
}

/** The player's scene. */
export function NewWelcomeScene({ onReady, ...props }: NewWelcomeProps & { onReady?: () => void }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Ready once the logo's pieces are decoded (at most 1.5 s), so the letters
  // never land as empty boxes on a slow connection.
  useEffect(() => {
    let live = true;
    void preloadLogoPieces().then(() => {
      if (live) onReady?.();
    });
    return () => {
      live = false;
    };
  }, [onReady]);
  return (
    <AbsoluteFill data-testid="new-welcome-scene" data-frame={frame} style={{ background: "transparent" }}>
      <NewWelcomeArt frame={frame} fps={fps} {...props} />
    </AbsoluteFill>
  );
}
