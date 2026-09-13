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
 * The T, the 2 and the Q of the Tradies2Quote mark binding together before
 * the app opens. Pure: the same component draws the poster at its final
 * frame, so a reduced-motion visit or a failed player still shows the mark.
 *
 *   0–40   T slides in from the left, Q from the right, the 2 drops between
 *          them and lands with a bounce
 *   40–64  the three snap: a pulse ring, a flash, a scale bump
 *   66–104 a tape rules under the mark
 *   96–150 the tagline settles in; the mark floats gently
 */
export function LogoAssembly({ frame, fps, calm = false }: { frame: number; fps: number; calm?: boolean }) {
  const s = (from: number, config: { damping: number; stiffness: number }) => spring({ frame: frame - from, fps, config });
  const t = s(0, { damping: 14, stiffness: 110 });
  const q = s(4, { damping: 14, stiffness: 110 });
  const two = s(14, { damping: 10, stiffness: 150 });
  const bind = s(40, { damping: 12, stiffness: 220 });
  const ring = interpolate(frame, [42, 74], [0, 1], clamp);
  const ringOpacity = interpolate(frame, [41, 44, 74], [0, 1, 0], clamp);
  const flash = calm ? 0 : interpolate(frame, [40, 45, 64], [0, 0.85, 0], clamp);
  const tape = interpolate(frame, [66, 104], [0, 1], clamp);
  const tag = interpolate(frame, [96, 118], [0, 1], clamp);
  const settled = interpolate(frame, [84, 116], [0, 1], clamp);
  const float = calm ? 0 : Math.sin(frame / 20) * 3 * settled;
  const snap = 1 + 0.06 * Math.sin(Math.min(1, Math.max(0, bind)) * Math.PI);
  const glow = interpolate(frame, [44, 70], [0, 1], clamp);
  const letter = (text: string, color: string, transform: string, opacity: number) =>
    <span style={{ color, display: "inline-block", transform, opacity: Math.max(0, Math.min(1, opacity)), textShadow: color === "#ff5f15" ? `0 0 ${u(30 * glow)} rgba(255,95,21,${0.55 * glow})` : `0 ${u(4)} ${u(24)} rgba(0,0,0,.45)` }}>{text}</span>;
  return <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: u(24), overflow: "hidden", fontFamily: DISPLAY, transform: `translateY(${float}px)` }}>
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: u(230), transform: `scale(${snap})` }}>
      <div aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: u(300), height: u(300), marginLeft: u(-150), marginTop: u(-150), borderRadius: "50%", background: "radial-gradient(circle, rgba(255,234,0,.5), rgba(255,95,21,.22) 40%, transparent 70%)", opacity: flash, filter: "blur(6px)" }} />
      <div aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: u(220), height: u(220), marginLeft: u(-110), marginTop: u(-110), borderRadius: "50%", border: `${u(3)} solid #ffea00`, opacity: ringOpacity, transform: `scale(${1 + ring * 1.7})` }} />
      <div style={{ display: "flex", alignItems: "baseline", fontSize: u(200), lineHeight: 1, letterSpacing: "-0.06em", whiteSpace: "nowrap", position: "relative" }}>
        {letter("T", "#ffffff", `translateX(${(1 - t) * -320}px) rotate(${(1 - t) * -14}deg)`, t * 1.6)}
        {letter("2", "#ff5f15", `translateY(${(1 - two) * -300}px) scale(${0.7 + 0.3 * Math.min(1, two)})`, two * 2)}
        {letter("Q", "#ffffff", `translateX(${(1 - q) * 320}px) rotate(${(1 - q) * 14}deg)`, q * 1.6)}
      </div>
    </div>
    <div style={{ width: u(420), display: "flex", flexDirection: "column", alignItems: "center", gap: u(14) }}>
      <div style={{ width: "100%", height: u(6), borderRadius: u(3), background: "repeating-linear-gradient(90deg, #ffea00 0, #ffea00 " + u(22) + ", #1a1a1a " + u(22) + ", #1a1a1a " + u(26) + ")", transform: `scaleX(${tape})`, transformOrigin: "left", boxShadow: "0 0 18px rgba(255,234,0,.35)" }} />
      <div style={{ fontFamily: MONO, fontSize: u(13), letterSpacing: "0.34em", color: "#b8bdb7", opacity: tag, transform: `translateY(${(1 - tag) * 8}px)` }}>TRADIES2QUOTE</div>
    </div>
  </div>;
}

/** Frame-driven welcome: the T, 2 and Q binding together before the app opens. */
export function WelcomeScene({ onReady, calm = false }: { onReady?: () => void; calm?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No canvas to wait for: the scene is ready as soon as it mounts.
  useEffect(() => { onReady?.(); }, [onReady]);
  return <AbsoluteFill data-testid="welcome-scene" data-frame={frame} style={{ background: "transparent", containerType: "inline-size" }}>
    <LogoAssembly frame={frame} fps={fps} calm={calm} />
  </AbsoluteFill>;
}
