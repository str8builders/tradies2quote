/**
 * UI atoms that recreate the Tradies2Quote app's look for the marketing
 * videos. Presentational only: every animated value arrives through props,
 * so the same screen renders identically in any composition or still.
 *
 * Source of truth for the look: `src/app/app/premium.css` (app shell),
 * `src/app/globals.css` (tokens) and the page components named per atom.
 */
import type { CSSProperties, ReactNode } from "react";
import { CaretDown, FileText, HouseLine, Package, Plus, Receipt } from "@phosphor-icons/react/dist/ssr";
import { C, FONT, TONE, type Tone, cardStyle, pageIntroStyle, rgba } from "../marketing/theme";
import { EXAMPLE } from "../demo-script";

/* ─── App shell ──────────────────────────────────────────────────────────── */

/** The app canvas: near-black with the wallpaper's faint warm and teal glow. */
export function AppCanvas({ tone = "quotes" }: { tone?: Tone }) {
  const t = TONE[tone];
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse 120% 55% at 18% 0%, ${rgba(t.rgb, 0.16)}, transparent 62%), radial-gradient(ellipse 90% 45% at 100% 100%, ${rgba(t.secondary, 0.1)}, transparent 70%), linear-gradient(180deg, #111514 0%, #0b0d0d 55%, #090a0a 100%)`,
      }}
    />
  );
}

/** Keeps scrolled content from colliding with the status bar, like the app's safe-area header. */
export function TopScrim({ color = "14, 17, 16" }: { color?: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: 104,
        zIndex: 30,
        background: `linear-gradient(180deg, rgba(${color}, 1) 0%, rgba(${color}, 0.98) 86%, rgba(${color}, 0) 100%)`,
      }}
    />
  );
}

/** Content column below the status bar; `scroll` moves it like a page scroll. */
export function Page({ children, scroll = 0, top = 64 }: { children: ReactNode; scroll?: number; top?: number }) {
  return (
    <div style={{ position: "absolute", left: 16, right: 16, top, transform: `translateY(${-scroll}px)` }}>
      {children}
    </div>
  );
}

/** Mobile account avatar, fixed top-right (`.t2q-profile-trigger`), generic initials. */
export function Avatar() {
  return (
    <div style={{ position: "absolute", right: 16, top: 58, width: 44, height: 44, zIndex: 40 }}>
      <div
        style={{
          position: "absolute",
          inset: -5,
          borderRadius: "50%",
          border: "2px solid #75e7acb8",
          opacity: 0.7,
          boxShadow: "0 0 14px #58d8974d, inset 0 0 7px #58d89726",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: "1px solid #dfb59085",
          background: "linear-gradient(145deg, #4d392b, #1c2825)",
          boxShadow: "inset 0 1px 0 #ffe3bd40, 0 4px 14px #0005",
          display: "grid",
          placeItems: "center",
          color: "#ffe4c7",
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: "0.02em",
        }}
      >
        {EXAMPLE.initials}
      </div>
    </div>
  );
}

type NavId = "home" | "quotes" | "invoices" | "materials";

/** Floating bottom navigation (`MobileAppMenuClient` + premium.css). */
export function BottomNav({ active }: { active: NavId }) {
  const items: { id: NavId | "new"; label: string; Icon: typeof HouseLine }[] = [
    { id: "home", label: "Home", Icon: HouseLine },
    { id: "quotes", label: "Quotes", Icon: FileText },
    { id: "new", label: "New", Icon: Plus },
    { id: "invoices", label: "Invoices", Icon: Receipt },
    { id: "materials", label: "Materials", Icon: Package },
  ];
  return (
    <>
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 120,
        zIndex: 43,
        background: "linear-gradient(180deg, rgba(10,12,12,0) 0%, rgba(10,12,12,0.94) 42%, rgba(10,12,12,1) 100%)",
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 26,
        height: 66,
        borderRadius: 26,
        border: "1px solid #a5c8b333",
        background: "linear-gradient(125deg, #1d2c27f5, #16201ff5 65%, #24291ff5)",
        boxShadow: "0 14px 36px #0009, inset 0 1px 0 #d4e7d414",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        padding: "0 6px",
        zIndex: 45,
      }}
    >
      {items.map(({ id, label, Icon }) =>
        id === "new" ? (
          <div
            key={id}
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: "linear-gradient(150deg, #ffcc91, #ff9454)",
              boxShadow: "0 5px 20px #ff9c5333, inset 0 1px 0 #fff5",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#2a1608",
            }}
          >
            <Icon size={22} weight="bold" />
            <span style={{ fontSize: 9, lineHeight: "11px", fontWeight: 800 }}>New</span>
          </div>
        ) : (
          <div
            key={id}
            style={{
              width: 66,
              height: 54,
              borderRadius: 18,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              color: id === active ? "#ffd6a8" : "#b6c9c0",
              fontSize: 11,
              fontWeight: 600,
              ...(id === active
                ? {
                    border: "1px solid #8ec6a94a",
                    background: "linear-gradient(145deg, #385344, #273b33)",
                    boxShadow: "inset 0 1px 0 #ffffff12",
                  }
                : {}),
            }}
          >
            <Icon size={22} weight={id === active ? "fill" : "duotone"} color={id === active ? C.brand : undefined} />
            {label}
          </div>
        ),
      )}
    </div>
    </>
  );
}

/* ─── Type ───────────────────────────────────────────────────────────────── */

/** `.t2q-section-label-pro`: small caps eyebrow in the section tone. */
export function SectionLabel({ children, tone = "quotes", style }: { children: ReactNode; tone?: Tone; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: TONE[tone].light,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Mono `// label` in the app's IBM Plex Mono style. */
export function MonoLabel({ children, color = C.ink300, size = 10, style }: { children: ReactNode; color?: string; size?: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: FONT.mono,
        fontSize: size,
        fontWeight: 500,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function H1({ children, size = 28, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: size, lineHeight: 1.18, fontWeight: 600, letterSpacing: "-0.04em", color: "#f4f3ef", ...style }}>
      {children}
    </div>
  );
}

export function Accent({ children, color = C.brand }: { children: ReactNode; color?: string }) {
  return <span style={{ color }}>{children}</span>;
}

/* ─── Surfaces ───────────────────────────────────────────────────────────── */

export function PageIntro({ eyebrow, title, body, tone = "quotes" }: { eyebrow: string; title: ReactNode; body?: ReactNode; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <div style={pageIntroStyle(tone)}>
      <div
        style={{
          position: "absolute",
          width: 270,
          height: 270,
          right: -100,
          top: -160,
          borderRadius: "50%",
          border: `1px solid ${rgba(t.rgb, 0.2)}`,
          boxShadow: `0 0 0 28px ${rgba(t.rgb, 0.035)}, 0 0 0 56px ${rgba(t.rgb, 0.025)}`,
        }}
      />
      <SectionLabel tone={tone}>{eyebrow}</SectionLabel>
      <H1 style={{ marginTop: 10 }}>{title}</H1>
      {body ? <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: "#d0d9d4" }}>{body}</div> : null}
    </div>
  );
}

export function Card({ children, tone = "quotes", style }: { children: ReactNode; tone?: Tone; style?: CSSProperties }) {
  return <div style={{ ...cardStyle(tone), padding: 20, ...style }}>{children}</div>;
}

/* ─── Controls ───────────────────────────────────────────────────────────── */

export function PrimaryButton({ children, style, pressed = 0 }: { children: ReactNode; style?: CSSProperties; pressed?: number }) {
  return (
    <div
      style={{
        minHeight: 46,
        borderRadius: 12,
        border: "1px solid #ffad7c66",
        background: pressed > 0 ? `color-mix(in srgb, #ff8b4b ${100 - pressed * 18}%, #ffffff)` : "#ff8b4b",
        color: "#201209",
        fontWeight: 700,
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "0 18px",
        boxShadow: "inset 0 1px 0 #ffffff2a, 0 6px 16px -10px #ff8b4b70",
        transform: `scale(${1 - pressed * 0.03})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function GhostButton({ children, tone = "quotes", style }: { children: ReactNode; tone?: Tone; style?: CSSProperties }) {
  const t = TONE[tone];
  return (
    <div
      style={{
        minHeight: 44,
        borderRadius: 12,
        border: `1px solid ${rgba(t.rgb, 0.3)}`,
        background: rgba(t.rgb, 0.07),
        color: "#e8eae8",
        fontWeight: 600,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "0 14px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A text input as the app draws it; `caret`/`selected` animate an edit. */
export function Input({
  value,
  placeholder,
  tone = "quotes",
  focused = false,
  caret = false,
  selected = false,
  multiline = false,
  style,
  textStyle,
}: {
  value?: ReactNode;
  placeholder?: string;
  tone?: Tone;
  focused?: boolean;
  caret?: boolean;
  selected?: boolean;
  multiline?: boolean;
  style?: CSSProperties;
  textStyle?: CSSProperties;
}) {
  const t = TONE[tone];
  const empty = value === undefined || value === "";
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${focused ? C.brand : rgba(t.rgb, 0.3)}`,
        boxShadow: focused ? `0 0 0 3px ${rgba("255, 95, 21", 0.18)}` : "inset 0 1px 2px #0002",
        background: "#152121",
        color: "#f1f2ee",
        fontSize: 14,
        padding: multiline ? "10px 12px" : "0 12px",
        minHeight: 40,
        display: "flex",
        alignItems: multiline ? "flex-start" : "center",
        lineHeight: 1.5,
        ...style,
      }}
    >
      <span style={{ position: "relative", ...textStyle }}>
        {empty ? <span style={{ color: "#94a8a4" }}>{placeholder}</span> : null}
        {!empty ? (
          <span style={selected ? { background: "rgba(255, 139, 75, 0.45)", borderRadius: 3, padding: "0 1px" } : undefined}>{value}</span>
        ) : null}
        {caret ? (
          <span
            style={{
              display: "inline-block",
              width: 1.5,
              height: "1.1em",
              marginLeft: 1,
              verticalAlign: "-0.15em",
              background: C.brand,
            }}
          />
        ) : null}
      </span>
    </div>
  );
}

/** Field label as the quote editor draws it (`NumberField`). */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <MonoLabel color="#8C8C8C">{children}</MonoLabel>;
}

type PillKind = "draft" | "sent" | "viewed" | "accepted" | "paid" | "neutral";
const PILL: Record<PillKind, { border: string; bg: string; color: string }> = {
  draft: { border: "rgba(255, 234, 0, 0.45)", bg: "rgba(255, 234, 0, 0.1)", color: C.hivis },
  sent: { border: "rgba(59, 130, 246, 0.4)", bg: "rgba(59, 130, 246, 0.1)", color: C.blue300 },
  viewed: { border: "rgba(255, 234, 0, 0.45)", bg: "rgba(255, 234, 0, 0.1)", color: C.hivis },
  accepted: { border: "rgba(255, 95, 21, 0.45)", bg: "rgba(255, 95, 21, 0.12)", color: "#ff8b54" },
  paid: { border: "rgba(16, 185, 129, 0.45)", bg: "rgba(16, 185, 129, 0.12)", color: C.emerald300 },
  neutral: { border: C.ink600, bg: C.ink800, color: C.ink200 },
};

export function Pill({ kind, children, style }: { kind: PillKind; children: ReactNode; style?: CSSProperties }) {
  const p = PILL[kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: `1px solid ${p.border}`,
        background: p.bg,
        color: p.color,
        borderRadius: 3,
        padding: "3px 7px",
        fontFamily: FONT.mono,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** `TotalsRow` from the quote editor. */
export function TotalsRow({ label, value, divider, emphasis, style }: { label: string; value: string; divider?: boolean; emphasis?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        ...(emphasis
          ? { marginTop: 12, borderRadius: 12, border: "1px solid rgba(255, 95, 21, 0.4)", background: "rgba(255, 95, 21, 0.1)", padding: "12px 14px" }
          : divider
            ? { marginTop: 8, borderTop: "1px solid #ffffff14", padding: "12px 0 6px" }
            : { padding: "6px 0" }),
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: emphasis ? 13 : 11,
          fontWeight: emphasis ? 600 : 400,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: emphasis ? "#ffffff" : C.ink300,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: emphasis ? 700 : 500,
          fontSize: emphasis ? 17 : 14,
          color: emphasis ? C.brand : "#ffffff",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** `.t2q-review-section`: the collapsible Materials / Labour panels. */
export function ReviewSection({ title, summary, open = true, children, style }: { title: string; summary: string; open?: boolean; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ border: "1px solid #8da99040", borderRadius: 17, background: "linear-gradient(120deg, #25362c, #1d2929)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 64, padding: "12px 18px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#f0f4ec", fontSize: 16, fontWeight: 650 }}>{title}</div>
          <div style={{ marginTop: 3, color: "#adbcaf", fontSize: 12, lineHeight: 1.5 }}>{summary}</div>
        </div>
        <CaretDown size={18} weight="bold" color="#a8d9b8" style={{ transform: open ? "rotate(180deg)" : undefined, flexShrink: 0 }} />
      </div>
      {open && children ? <div style={{ padding: "0 8px 8px" }}>{children}</div> : null}
    </div>
  );
}

/** Finger tap: a soft dot that presses in, then a ring that spreads out. */
export function Tap({ x, y, p }: { x: number; y: number; p: number }) {
  if (p <= 0 || p >= 1) return null;
  const press = Math.sin(Math.min(1, p / 0.55) * Math.PI);
  const ring = Math.max(0, (p - 0.25) / 0.75);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, zIndex: 80, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: -22,
          top: -22,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.5)",
          border: "2px solid rgba(255,255,255,0.85)",
          boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
          opacity: press * 0.9,
          transform: `scale(${0.75 + 0.25 * press})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -22,
          top: -22,
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.8)",
          opacity: ring > 0 ? (1 - ring) * 0.8 : 0,
          transform: `scale(${1 + ring * 1.4})`,
        }}
      />
    </div>
  );
}
