import type { CSSProperties, ReactNode } from "react";
import { FONT } from "./theme";

/** Screens are authored in CSS px for a 390 px wide phone (iPhone 13/14/15). */
export const SCREEN_W = 390;
export const SCREEN_H = 844;
const BEZEL = 13;
const SCREEN_RADIUS = 52;

type Finish = "graphite" | "silver";

const FINISH: Record<Finish, { body: string; edge: string; inner: string }> = {
  graphite: {
    body: "linear-gradient(150deg, #3a3d40 0%, #1d1f21 38%, #111213 70%, #2c2f31 100%)",
    edge: "#55595c",
    inner: "#050505",
  },
  silver: {
    body: "linear-gradient(150deg, #f1f2f3 0%, #c9cbcd 40%, #a7aaad 72%, #e3e4e5 100%)",
    edge: "#f7f7f7",
    inner: "#0b0b0b",
  },
};

/** iOS-style status bar: 9:41, full signal, wifi and a full battery. */
export function StatusBar({ tone = "light" }: { tone?: "light" | "dark" }) {
  const c = tone === "light" ? "#ffffff" : "#111111";
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 54, zIndex: 50, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          width: 136,
          top: 17,
          textAlign: "center",
          fontFamily: FONT.display,
          fontWeight: 700,
          fontSize: 17,
          letterSpacing: "-0.01em",
          color: c,
        }}
      >
        9:41
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 11,
          width: 122,
          height: 36,
          marginLeft: -61,
          borderRadius: 18,
          background: "#000",
        }}
      />
      <div style={{ position: "absolute", right: 30, top: 21, display: "flex", alignItems: "center", gap: 7 }}>
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 4.8} y={9 - i * 3} width="3.2" height={3 + i * 3} rx="0.9" fill={c} />
          ))}
        </svg>
        <svg width="17" height="12" viewBox="0 0 17 12" aria-hidden>
          <path d="M8.5 11.6 6.2 9.2a3.3 3.3 0 0 1 4.6 0Z" fill={c} />
          <path d="M3.9 6.9a6.5 6.5 0 0 1 9.2 0l-1.5 1.5a4.4 4.4 0 0 0-6.2 0Z" fill={c} />
          <path d="M1.5 4.5a9.9 9.9 0 0 1 14 0L14 6a7.8 7.8 0 0 0-11 0Z" fill={c} />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke={c} strokeOpacity="0.4" />
          <rect x="2" y="2" width="20" height="9" rx="2.4" fill={c} />
          <path d="M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1s-.6-1.8-1.4-2.1Z" fill={c} fillOpacity="0.45" />
        </svg>
      </div>
    </div>
  );
}

export function HomeIndicator({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 8,
        width: 134,
        height: 5,
        marginLeft: -67,
        borderRadius: 3,
        background: tone === "light" ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.8)",
        zIndex: 60,
      }}
    />
  );
}

/**
 * The bare phone screen (status bar, content, home indicator) at `scale`.
 * Used on its own for the hero loop and inside <Phone> everywhere else.
 */
export function Screen({
  children,
  height = SCREEN_H,
  scale = 1,
  background = "#0c0f0f",
  statusTone = "light",
  radius = 0,
}: {
  children: ReactNode;
  height?: number;
  scale?: number;
  background?: string;
  statusTone?: "light" | "dark";
  radius?: number;
}) {
  return (
    <div style={{ width: SCREEN_W * scale, height: height * scale, overflow: "hidden", borderRadius: radius * scale, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: SCREEN_W,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          background,
          overflow: "hidden",
          fontFamily: FONT.display,
          color: "#f4f3ef",
        }}
      >
        {children}
        <StatusBar tone={statusTone} />
        <HomeIndicator tone={statusTone} />
      </div>
    </div>
  );
}

/** A phone body around a <Screen>. `width` is the outer width in canvas px. */
export function Phone({
  width,
  screenHeight = SCREEN_H,
  finish = "graphite",
  background,
  statusTone,
  style,
  children,
}: {
  width: number;
  screenHeight?: number;
  finish?: Finish;
  background?: string;
  statusTone?: "light" | "dark";
  style?: CSSProperties;
  children: ReactNode;
}) {
  const outerW = SCREEN_W + BEZEL * 2;
  const outerH = screenHeight + BEZEL * 2;
  const s = width / outerW;
  const f = FINISH[finish];
  return (
    <div style={{ position: "relative", width, height: outerH * s, ...style }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: (SCREEN_RADIUS + BEZEL) * s,
          background: f.body,
          boxShadow: `0 0 0 ${1.4 * s}px ${f.edge} inset, 0 ${40 * s}px ${90 * s}px -${20 * s}px rgba(0,0,0,0.75), 0 ${8 * s}px ${24 * s}px rgba(0,0,0,0.45)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: (BEZEL - 4) * s,
          top: (BEZEL - 4) * s,
          right: (BEZEL - 4) * s,
          bottom: (BEZEL - 4) * s,
          borderRadius: (SCREEN_RADIUS + 4) * s,
          background: f.inner,
        }}
      />
      <div style={{ position: "absolute", left: BEZEL * s, top: BEZEL * s }}>
        <Screen height={screenHeight} scale={s} background={background} statusTone={statusTone} radius={SCREEN_RADIUS}>
          {children}
        </Screen>
      </div>
    </div>
  );
}
