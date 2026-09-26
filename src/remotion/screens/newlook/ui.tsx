/**
 * The app's new look for the marketing phone screens: the tokens and
 * components of src/components/ui (globals.css --ui-* dark tokens, Archivo
 * Black headings, IBM Plex Sans text, 56 px primary buttons at 16 px radius,
 * the status rail, bottom sheets, the tab bar). Everyone on the web has had
 * the new look since 27 Sep 2026, so the website shows it.
 */
import type { CSSProperties, ReactNode } from "react";
import { loadFont as loadArchivoBlack } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as loadPlexSans } from "@remotion/google-fonts/IBMPlexSans";
import { Briefcase, CaretLeft, Check, DotsThree, House, Plus, Tag, Timer } from "@phosphor-icons/react/dist/ssr";

const archivo = loadArchivoBlack("normal", { weights: ["400"], subsets: ["latin"] });
const plex = loadPlexSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });

export const NL_FONT = { display: archivo.fontFamily, sans: plex.fontFamily } as const;

/** globals.css dark tokens (mirrored in lib/ui/tokens.ts). */
export const NL = {
  bg: "#111110",
  surface: "#1B1B1A",
  surface2: "#242422",
  line: "#34332F",
  lineStrong: "#75736C",
  text: "#F5F4F0",
  muted: "#BDBBB3",
  faint: "#9A9891",
  brand: "#FF5F15",
  brandText: "#FF8A4C",
  onBrand: "#121211",
  brandSoft: "#3A1D0E",
  hivis: "#FFEA00",
  mark: "#3B3509",
  ok: "#3CCB7F",
  okSoft: "#15301F",
  warn: "#FFB224",
  warnSoft: "#35280C",
  bad: "#FF6A5E",
  badSoft: "#3A1916",
  info: "#58A6FF",
  infoSoft: "#132A45",
  ember: "#E0480D",
} as const;

export const BRAND_GRADIENT = `linear-gradient(145deg, #FF7A3D 0%, ${NL.brand} 48%, ${NL.ember} 100%)`;

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "brand";
const TONE: Record<Tone, { fg: string; bg: string }> = {
  ok: { fg: NL.ok, bg: NL.okSoft },
  warn: { fg: NL.warn, bg: NL.warnSoft },
  bad: { fg: NL.bad, bg: NL.badSoft },
  info: { fg: NL.info, bg: NL.infoSoft },
  neutral: { fg: NL.muted, bg: NL.surface2 },
  brand: { fg: NL.brandText, bg: NL.brandSoft },
};

/** The page itself: new-look background and body text. */
export function Page({ children, top = 0, scroll = 0 }: { children: ReactNode; top?: number; scroll?: number }) {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: NL.bg }} />
      <div style={{ position: "absolute", left: 16, right: 16, top, transform: `translateY(${-scroll}px)`, fontFamily: NL_FONT.sans, color: NL.text, fontSize: 17 }}>
        {children}
      </div>
    </>
  );
}

export function Heading({ children, size = 28, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return <div style={{ fontFamily: NL_FONT.display, fontSize: size, lineHeight: 1.12, letterSpacing: "-0.01em", color: NL.text, ...style }}>{children}</div>;
}

export function Muted({ children, size = 16, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return <div style={{ fontSize: size, lineHeight: 1.45, color: NL.muted, ...style }}>{children}</div>;
}

/** Top bar: "‹ Back" / "‹ Cancel" in orange, the title (and a subtitle), an optional ⋯. */
export function TopBar({ back = "Back", title, subtitle, more = false }: { back?: string | null; title: string; subtitle?: string; more?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        // From the very top, so scrolled content never shows behind the status bar.
        top: 0,
        minHeight: 114,
        zIndex: 35,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "54px 8px 0",
        background: NL.bg,
        borderBottom: `1px solid ${NL.line}`,
        fontFamily: NL_FONT.sans,
      }}
    >
      {back ? (
        <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 8px", minHeight: 44, color: NL.brandText, fontSize: 16, fontWeight: 600 }}>
          <CaretLeft size={18} weight="bold" /> {back}
        </div>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: NL.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 14, color: NL.muted }}>{subtitle}</div> : null}
      </div>
      {more ? (
        <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", color: NL.text }}>
          <DotsThree size={26} weight="bold" />
        </div>
      ) : null}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";
export function Button({
  children,
  variant = "primary",
  icon,
  pressed = 0,
  style,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  icon?: ReactNode;
  pressed?: number;
  style?: CSSProperties;
}) {
  const base: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: NL_FONT.sans,
    fontWeight: 600,
    transform: `scale(${1 - pressed * 0.02})`,
  };
  const look: Record<ButtonVariant, CSSProperties> = {
    primary: { minHeight: 56, borderRadius: 16, background: NL.brand, color: NL.onBrand, fontSize: 18, filter: pressed ? `brightness(${1 + pressed * 0.12})` : undefined },
    secondary: { minHeight: 48, borderRadius: 12, background: NL.surface2, border: `1px solid ${NL.line}`, color: NL.text, fontSize: 16 },
    ghost: { minHeight: 44, color: NL.brandText, fontSize: 16 },
  };
  return (
    <div style={{ ...base, ...look[variant], ...style }}>
      {icon ? <span style={{ display: "grid" }}>{icon}</span> : null}
      {children}
    </div>
  );
}

/** Sticky bottom bar: the secondary above the primary, an optional hint above both. */
export function BottomBar({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 36,
        borderTop: `1px solid ${NL.line}`,
        background: NL.bg,
        padding: "12px 16px 34px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily: NL_FONT.sans,
      }}
    >
      {hint ? <div style={{ textAlign: "center", fontSize: 14, color: NL.muted }}>{hint}</div> : null}
      {children}
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ borderRadius: 16, border: `1px solid ${NL.line}`, background: NL.surface, padding: 16, ...style }}>{children}</div>;
}

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", minHeight: 28, padding: "0 10px", borderRadius: 999, background: t.bg, color: t.fg, fontSize: 14, fontWeight: 600 }}>
      {children}
    </span>
  );
}

export function IconChip({ tone = "brand", size = 44, children }: { tone?: Tone; size?: number; children: ReactNode }) {
  const t = TONE[tone];
  return <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 12, display: "grid", placeItems: "center", background: t.bg, color: t.fg }}>{children}</div>;
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 20, fontWeight: 700, color: NL.text, margin: "22px 0 10px", ...style }}>{children}</div>;
}

export const STAGES = ["Quote", "Sent", "Accepted", "Booked", "Done", "Paid"] as const;

/** The job's status rail: done steps ticked green, the current one ringed orange. `current` 6 = all done. */
export function StatusRail({ current }: { current: number }) {
  const last = STAGES.length - 1;
  const progress = Math.min(1, Math.max(0, current / last));
  return (
    <div style={{ position: "relative", fontFamily: NL_FONT.sans }}>
      <div style={{ position: "absolute", left: 18, right: 18, top: 16, height: 4, borderRadius: 999, background: NL.line, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, background: NL.ok, borderRadius: 999 }} />
      </div>
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between" }}>
        {STAGES.map((stage, i) => {
          const state = i < current ? "done" : i === current ? "current" : "upcoming";
          return (
            <div key={stage} style={{ width: 36, display: "flex", flexDirection: "column", gap: 6, alignItems: i === 0 ? "flex-start" : i === last ? "flex-end" : "center" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  border: `2px solid ${state === "done" ? NL.ok : state === "current" ? NL.brand : NL.lineStrong}`,
                  background: state === "done" ? NL.ok : state === "current" ? NL.brandSoft : NL.surface2,
                  color: NL.bg,
                  transform: state === "current" ? "scale(1.1)" : undefined,
                }}
              >
                {state === "done" ? <Check size={18} weight="bold" /> : state === "current" ? <div style={{ width: 10, height: 10, borderRadius: 999, background: NL.brand }} /> : null}
              </div>
              <div style={{ fontSize: 13, whiteSpace: "nowrap", color: state === "current" ? NL.text : NL.muted, fontWeight: state === "current" ? 600 : 400 }}>{stage}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bottom sheet: dims the page, slides up; `top` is where its top edge settles. */
export function Sheet({
  enter,
  top,
  title,
  description,
  children,
  footer,
}: {
  enter: number;
  top: number;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const slide = (1 - enter) * (844 - top);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, zIndex: 60, background: `rgba(0,0,0,${0.6 * enter})` }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: top + slide,
          bottom: -slide,
          zIndex: 61,
          borderRadius: "24px 24px 0 0",
          border: `1px solid ${NL.line}`,
          borderBottom: "none",
          background: NL.surface,
          fontFamily: NL_FONT.sans,
          color: NL.text,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ width: 40, height: 5, borderRadius: 3, background: NL.line, margin: "10px auto 8px", flexShrink: 0 }} />
        <div style={{ padding: "0 16px" }}>
          <div style={{ fontSize: 21, fontWeight: 700 }}>{title}</div>
          {description ? <div style={{ marginTop: 4, fontSize: 16, color: NL.muted }}>{description}</div> : null}
        </div>
        <div style={{ flex: 1, padding: "14px 16px 0", overflow: "hidden" }}>{children}</div>
        {footer ? <div style={{ padding: "12px 16px 34px", display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${NL.line}` }}>{footer}</div> : null}
      </div>
    </>
  );
}

/** A field: label above a dark box (TextField / NumberField). */
export function Field({ label, value, prefix, suffix, focused = false, style }: { label?: string; value: string; prefix?: string; suffix?: string; focused?: boolean; style?: CSSProperties }) {
  return (
    <div style={style}>
      {label ? <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: NL.text }}>{label}</div> : null}
      <div
        style={{
          minHeight: 52,
          borderRadius: 12,
          border: `${focused ? 2 : 1}px solid ${focused ? NL.brand : NL.line}`,
          background: NL.bg,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 14px",
          fontSize: 17,
          color: NL.text,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {prefix ? <span style={{ color: NL.muted }}>{prefix}</span> : null}
        <span style={{ flex: 1 }}>{value}</span>
        {suffix ? <span style={{ color: NL.muted, fontSize: 15 }}>{suffix}</span> : null}
      </div>
    </div>
  );
}

/** The tab bar (Home · Jobs · New · Prices · Timesheet); hidden on the job page and the new-quote flow. */
export function TabBar({ active }: { active: "home" | "jobs" | "prices" | "timesheet" }) {
  const item = (id: string, icon: ReactNode, label: string) => (
    <div style={{ flex: 1, display: "grid", placeItems: "center", gap: 2, color: id === active ? NL.brandText : NL.muted, fontSize: 11.5, fontWeight: id === active ? 700 : 500 }}>
      {icon}
      {label}
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 84,
        zIndex: 40,
        borderTop: `1px solid ${NL.line}`,
        background: NL.bg,
        display: "flex",
        alignItems: "flex-start",
        paddingTop: 8,
        fontFamily: NL_FONT.sans,
      }}
    >
      {item("home", <House size={24} weight={active === "home" ? "fill" : "regular"} />, "Home")}
      {item("jobs", <Briefcase size={24} weight={active === "jobs" ? "fill" : "regular"} />, "Jobs")}
      <div style={{ flex: 1, display: "grid", placeItems: "center", marginTop: -14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: BRAND_GRADIENT, color: NL.onBrand, display: "grid", placeItems: "center", boxShadow: "0 8px 20px -8px rgba(255,95,21,0.7)" }}>
          <Plus size={26} weight="bold" />
        </div>
        <div style={{ fontSize: 11.5, color: NL.muted, fontWeight: 500 }}>New</div>
      </div>
      {item("prices", <Tag size={24} weight={active === "prices" ? "fill" : "regular"} />, "Prices")}
      {item("timesheet", <Timer size={24} weight={active === "timesheet" ? "fill" : "regular"} />, "Timesheet")}
    </div>
  );
}

/** A list row: icon chip, title and subtitle, something on the right. */
export function Row({ icon, tone = "brand", title, subtitle, trailing, style }: { icon?: ReactNode; tone?: Tone; title: string; subtitle?: string; trailing?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 60, ...style }}>
      {icon ? <IconChip tone={tone}>{icon}</IconChip> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: NL.text }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 15, color: NL.muted }}>{subtitle}</div> : null}
      </div>
      {trailing}
    </div>
  );
}

export const money = (n: number) => `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
