"use client";
import { useEffect } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const WELCOME_FRAMES = 150;
export const WELCOME_FPS = 30;

/** Composition units: the scene is authored at 720 wide and scales with its container. */
const u = (px: number) => `${(px / 7.2).toFixed(3)}cqw`;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const DISPLAY = 'var(--font-archivo-black), "Archivo Black", "Arial Black", system-ui, sans-serif';
const MONO = 'var(--font-ibm-plex-mono), "IBM Plex Mono", ui-monospace, monospace';

/**
 * The Tradies2Quote mark binding together, frame by frame, before the app
 * opens. Pure: the same component draws the poster at its final frame, so a
 * reduced-motion visit or a failed player still shows the assembled logo.
 *
 *   0–40   the orange tile slides in, the "2" drops onto it, the hi-vis
 *          strip locks in underneath, the three dots pop
 *   40–60  the pieces snap: a pulse ring and flash
 *   52–100 the wordmark writes out beside the mark and a tape rules under it
 *   92–150 the tagline settles in; the whole mark floats gently
 */
export function LogoAssembly({ frame, fps, calm = false }: { frame: number; fps: number; calm?: boolean }) {
  const s = (from: number, config: { damping: number; stiffness: number }) => spring({ frame: frame - from, fps, config });
  const tile = s(0, { damping: 14, stiffness: 110 });
  const two = s(10, { damping: 11, stiffness: 150 });
  const strip = s(18, { damping: 16, stiffness: 130 });
  const dots = [s(24, { damping: 12, stiffness: 180 }), s(28, { damping: 12, stiffness: 180 }), s(32, { damping: 12, stiffness: 180 })];
  const bind = s(40, { damping: 12, stiffness: 220 });
  const ring = interpolate(frame, [42, 74], [0, 1], clamp);
  const ringOpacity = interpolate(frame, [41, 44, 74], [0, 1, 0], clamp);
  const flash = calm ? 0 : interpolate(frame, [40, 45, 64], [0, 0.85, 0], clamp);
  const words = [s(52, { damping: 18, stiffness: 95 }), s(58, { damping: 18, stiffness: 95 }), s(64, { damping: 18, stiffness: 95 })];
  const tape = interpolate(frame, [66, 104], [0, 1], clamp);
  const tag = interpolate(frame, [96, 118], [0, 1], clamp);
  const settled = interpolate(frame, [84, 116], [0, 1], clamp);
  const float = calm ? 0 : Math.sin(frame / 20) * 3 * settled;
  const snap = 1 + 0.07 * Math.sin(Math.min(1, Math.max(0, bind)) * Math.PI);
  const tileScale = (0.88 + 0.12 * Math.min(1, tile)) * snap;
  return <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: u(26), overflow: "hidden", fontFamily: DISPLAY, transform: `translateY(${float}px)` }}>
    <div style={{ display: "flex", alignItems: "center", gap: u(30) }}>
      {/* The mark */}
      <div style={{ position: "relative", width: u(150), height: u(150), flex: "none" }}>
        <div aria-hidden style={{ position: "absolute", inset: u(-40), borderRadius: "50%", background: "radial-gradient(circle, rgba(255,234,0,.55), rgba(255,95,21,.25) 40%, transparent 70%)", opacity: flash, filter: "blur(6px)" }} />
        <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `${u(3)} solid #ffea00`, opacity: ringOpacity, transform: `scale(${1 + ring * 1.7})` }} />
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${(1 - tile) * -260}px) rotate(${(1 - tile) * -18}deg) scale(${tileScale})`, opacity: Math.min(1, tile * 1.6) }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: u(10), background: "#ff5f15", boxShadow: "0 24px 60px -20px rgba(255,95,21,.8)", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, right: 0, width: u(28), height: u(28), background: "linear-gradient(225deg, #0a0a0a 50%, #1f1f1f 50%)" }} />
            <div style={{ position: "absolute", left: u(44), top: u(6), fontSize: u(112), lineHeight: 1, color: "#fff", letterSpacing: "-0.05em", transform: `translateY(${(1 - two) * -220}px)`, opacity: Math.min(1, two * 2) }}>2</div>
            {[0, 1, 2].map((i) => <span key={i} style={{ position: "absolute", top: u(46), left: u(107 + i * 15), width: u(8 - i * 1.6), height: u(8 - i * 1.6), borderRadius: "50%", background: "#ffea00", opacity: (1 - i * 0.2) * Math.min(1, dots[i]), transform: `scale(${Math.max(0.001, dots[i])})` }} />)}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: u(19), background: "repeating-linear-gradient(-55deg, #ffea00 0, #ffea00 " + u(14) + ", #0a0a0a " + u(14) + ", #0a0a0a " + u(26) + ")", transform: `translateY(${(1 - strip) * 80}px) scaleX(${Math.max(0.001, strip)})`, transformOrigin: "left" }} />
          </div>
        </div>
      </div>
      {/* The wordmark */}
      <div style={{ display: "flex", alignItems: "baseline", fontSize: u(60), letterSpacing: "-0.045em", lineHeight: 1, whiteSpace: "nowrap" }}>
        {[["tradies", "#ffffff"], ["2", "#ff5f15"], ["Quote", "#ffffff"]].map(([text, color], i) => <span key={text} style={{ color, display: "inline-block", transform: `translateX(${(1 - words[i]) * -40}px)`, opacity: Math.max(0, Math.min(1, words[i])) }}>{text}</span>)}
      </div>
    </div>
    {/* Tape rule + tagline */}
    <div style={{ width: u(470), display: "flex", flexDirection: "column", alignItems: "center", gap: u(14) }}>
      <div style={{ width: "100%", height: u(6), borderRadius: u(3), background: "repeating-linear-gradient(90deg, #ffea00 0, #ffea00 " + u(22) + ", #1a1a1a " + u(22) + ", #1a1a1a " + u(26) + ")", transform: `scaleX(${tape})`, transformOrigin: "left", boxShadow: "0 0 18px rgba(255,234,0,.35)" }} />
      <div style={{ fontFamily: MONO, fontSize: u(13), letterSpacing: "0.34em", color: "#b8bdb7", opacity: tag, transform: `translateY(${(1 - tag) * 8}px)` }}>VOICE · QUOTE · INVOICE · PAID</div>
    </div>
  </div>;
}

/** Frame-driven welcome: the T2Q mark assembling before the app opens. */
export function WelcomeScene({ onReady, calm = false }: { onReady?: () => void; calm?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No canvas to wait for: the scene is ready as soon as it mounts.
  useEffect(() => { onReady?.(); }, [onReady]);
  return <AbsoluteFill data-testid="welcome-scene" data-frame={frame} style={{ background: "transparent", containerType: "inline-size" }}>
    <LogoAssembly frame={frame} fps={fps} calm={calm} />
  </AbsoluteFill>;
}
