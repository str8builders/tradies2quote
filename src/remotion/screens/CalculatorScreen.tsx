/**
 * The T2QCAL companion calculator (its own app, `src/t2qcal`): a measured
 * deck drawing, then the "Send to quote" sheet that turns the result into a
 * Tradies2Quote line (`QuoteTransfer.tsx`, reference screenshots
 * `public/screens/t2qcal-*.jpg`).
 */
import type { ReactNode } from "react";
import { CaretLeft, Minus, Plus, Books, Ruler } from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE, formatMoney } from "../demo-script";
import { C, FONT } from "../marketing/theme";
import { Tap } from "./ui";

const BG = "#0b0b0b";
const PANEL = "#161617";
const FIELD = "#232325";
const GREEN = "#4ade80";

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = (x: number, y: number, dir: number) => {
    const s = 6;
    return `M${x} ${y} L${x - s * Math.cos(dir - 0.45)} ${y - s * Math.sin(dir - 0.45)} M${x} ${y} L${x - s * Math.cos(dir + 0.45)} ${y - s * Math.sin(dir + 0.45)}`;
  };
  return (
    <path
      d={`M${x1} ${y1} L${x2} ${y2} ${head(x2, y2, a)} ${head(x1, y1, a + Math.PI)}`}
      stroke="#1a1a1a"
      strokeWidth={1.2}
      fill="none"
    />
  );
}

/** Top-down deck plan with boards and dimension lines, like T2QCAL's measured drawings. */
export function DeckDrawing({ reveal = 1 }: { reveal?: number }) {
  const boards = 22;
  const shown = Math.round(boards * Math.max(0, Math.min(1, reveal)));
  return (
    <svg viewBox="0 0 320 250" width="100%" height="100%" aria-hidden>
      <rect x={0} y={0} width={320} height={250} fill="#ffffff" />
      <text x={16} y={24} fontFamily={FONT.mono} fontSize={11} fill="#111">
        Deck 6,000 × 4,000 mm
      </text>
      <text x={16} y={40} fontFamily={FONT.mono} fontSize={11} fill="#111">
        Area {EXAMPLE.deck.area.toFixed(2)} m² · boards 140 × 32
      </text>
      <g transform="translate(40 60)">
        <rect x={0} y={0} width={240} height={150} fill="#f3e3c8" stroke="#1a1a1a" strokeWidth={1.2} />
        {Array.from({ length: shown }, (_, i) => (
          <rect
            key={i}
            x={1}
            y={1 + i * (148 / boards)}
            width={238}
            height={148 / boards - 1.2}
            fill={i % 2 === 0 ? "#c98a45" : "#b87838"}
          />
        ))}
        {[40, 120, 200].map((x) => (
          <line key={x} x1={x} y1={0} x2={x} y2={150} stroke="#6b3f14" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.6} />
        ))}
      </g>
      <Arrow x1={40} y1={228} x2={280} y2={228} />
      <rect x={128} y={220} width={64} height={16} fill="#fff" />
      <text x={160} y={232} textAnchor="middle" fontFamily={FONT.body} fontSize={12} fill="#111">
        6,000
      </text>
      <Arrow x1={298} y1={60} x2={298} y2={210} />
      <g transform="translate(302 135) rotate(90)">
        <rect x={-24} y={-9} width={48} height={14} fill="#fff" />
        <text x={0} y={2} textAnchor="middle" fontFamily={FONT.body} fontSize={12} fill="#111">
          4,000
        </text>
      </g>
      <text x={40 + 240 * 0.5} y={60 + 150 * 0.5 + 6} textAnchor="middle" fontFamily={FONT.display} fontWeight={800} fontSize={22} fill="#15803d">
        {EXAMPLE.deck.area.toFixed(1)} m²
      </text>
    </svg>
  );
}

function Stepper({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #ffffff10" }}>
      <div style={{ fontSize: 15, color: "#f2f2f2" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 15, color: "#fff" }}>{value}</div>
        <div style={{ display: "flex", borderRadius: 999, background: FIELD, height: 32, alignItems: "center" }}>
          <div style={{ width: 36, display: "grid", placeItems: "center", color: "#ddd" }}>
            <Minus size={14} weight="bold" />
          </div>
          <div style={{ width: 1, height: 18, background: "#ffffff22" }} />
          <div style={{ width: 36, display: "grid", placeItems: "center", color: "#ddd" }}>
            <Plus size={14} weight="bold" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBar() {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 26,
        width: 196,
        height: 60,
        marginLeft: -98,
        borderRadius: 30,
        background: "rgba(38,38,40,0.94)",
        border: "1px solid #ffffff18",
        display: "flex",
        alignItems: "center",
        padding: 4,
        zIndex: 40,
      }}
    >
      <div style={{ flex: 1, height: 52, borderRadius: 26, background: "#111", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#ff8b54", fontSize: 11, fontWeight: 600, gap: 2 }}>
        <Ruler size={20} weight="fill" />
        Calculators
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#eee", fontSize: 11, fontWeight: 600, gap: 2 }}>
        <Books size={20} weight="fill" />
        Resources
      </div>
    </div>
  );
}

/** The deck calculator with its live measured drawing. */
export function CalculatorScreen({ reveal = 1, tap = null, children }: { reveal?: number; tap?: { x: number; y: number; p: number } | null; children?: ReactNode }) {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: BG }} />
      <div style={{ position: "absolute", left: 16, right: 16, top: 62 }}>
        <div style={{ position: "relative", height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "#1f1f21",
              border: "1px solid #ffffff14",
              display: "grid",
              placeItems: "center",
              color: "#fff",
            }}
          >
            <CaretLeft size={20} weight="bold" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Deck boards</div>
        </div>
        <div style={{ marginTop: 14, borderRadius: 22, background: PANEL, padding: 6, display: "flex" }}>
          <div style={{ flex: 1, height: 36, borderRadius: 16, background: "#4a4a4d", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 500 }}>Metric</div>
          <div style={{ flex: 1, height: 36, display: "grid", placeItems: "center", fontSize: 14, color: "#ddd" }}>Imperial</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: "#a3a3a3" }}>Board count, fixings and joist layout for a rectangular deck.</div>
        <div style={{ marginTop: 12, borderRadius: 24, background: PANEL, padding: 10 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, fontSize: 12.5 }}>
            {["Measured drawing", "Board layout", "3D assembly"].map((t, i) => (
              <div key={t} style={{ padding: "6px 10px", borderRadius: 12, background: i === 0 ? "#4a4a4d" : "transparent", color: i === 0 ? "#fff" : "#cfcfcf" }}>
                {t}
              </div>
            ))}
          </div>
          <div style={{ borderRadius: 14, overflow: "hidden", height: 250 }}>
            <DeckDrawing reveal={reveal} />
          </div>
        </div>
        <div style={{ marginTop: 16, fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.3em", color: "#8a8a8a" }}>{"// DIMENSIONS"}</div>
        <div style={{ marginTop: 4 }}>
          <Stepper label="Deck length" value="6,000 mm" />
          <Stepper label="Deck width" value="4,000 mm" />
        </div>
      </div>
      <TabBar />
      {children}
      {tap ? <Tap x={tap.x} y={tap.y} p={tap.p} /> : null}
    </>
  );
}

/** "Send to quote": the measured line going across to Tradies2Quote. */
export function SendToQuoteSheet({ enter = 1, press = 0, sent = false }: { enter?: number; press?: number; sent?: boolean }) {
  if (enter <= 0) return null;
  const [deck] = EXAMPLE.lines;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 58,
        bottom: 0,
        zIndex: 45,
        borderRadius: "34px 34px 0 0",
        background: "#101011",
        border: "1px solid #ffffff12",
        transform: `translateY(${(1 - enter) * 820}px)`,
        padding: "18px 18px 0",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          height: 40,
          padding: "0 18px",
          borderRadius: 20,
          alignItems: "center",
          background: "#2a2a2c",
          fontSize: 15,
          color: "#ddd",
        }}
      >
        Cancel
      </div>
      <div style={{ marginTop: 22, fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.3em", color: C.brand }}>/ SEND TO QUOTE</div>
      <div style={{ marginTop: 8, fontSize: 30, lineHeight: 1.02, fontWeight: 800, letterSpacing: "-0.03em", textTransform: "uppercase" }}>
        Measured.
        <br />
        <span style={{ color: C.brand }}>Not guessed.</span>
      </div>
      <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.5, color: "#bdbdbd" }}>
        These quantities go across as a draft quote on your account, marked as calculated so Tradies2Quote does not ask you to confirm them again.
      </div>
      <div style={{ marginTop: 18, fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.3em", color: "#8a8a8a" }}>{"// JOB SUMMARY"}</div>
      <div style={{ marginTop: 8, height: 48, borderRadius: 24, background: "#1c1c1e", display: "flex", alignItems: "center", padding: "0 18px", fontSize: 15 }}>
        {EXAMPLE.job}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.3em", color: "#8a8a8a" }}>
        <span>LINES</span>
        <span>1 of 1</span>
      </div>
      <div style={{ marginTop: 8, borderRadius: 24, background: PANEL, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 20, height: 20, borderRadius: 4, background: C.brand, display: "grid", placeItems: "center" }}>
            <svg width="11" height="9" viewBox="0 0 11 9" aria-hidden>
              <path d="M1 4.5 4 7.5 10 1.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontSize: 15.5 }}>Deck — {deck.description}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 10, paddingLeft: 30 }}>
          <div>
            <div style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: "0.2em", color: "#8a8a8a" }}>QTY</div>
            <div style={{ marginTop: 4, width: 68, height: 34, borderRadius: 9, background: FIELD, display: "flex", alignItems: "center", padding: "0 10px", fontFamily: FONT.mono, fontSize: 14 }}>
              {deck.quantity}
            </div>
          </div>
          <div style={{ fontFamily: FONT.mono, fontSize: 11, color: "#9a9a9a", paddingBottom: 18 }}>m²</div>
          <div>
            <div style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: "0.2em", color: "#8a8a8a" }}>PRICE</div>
            <div style={{ marginTop: 4, width: 74, height: 34, borderRadius: 9, background: FIELD, display: "flex", alignItems: "center", padding: "0 10px", fontFamily: FONT.mono, fontSize: 14 }}>
              {deck.unitPrice}
            </div>
          </div>
          <div style={{ marginLeft: "auto", paddingBottom: 8, fontFamily: FONT.mono, fontSize: 15, fontWeight: 600, color: GREEN }}>{formatMoney(deck.total)}</div>
        </div>
      </div>
      <div
        style={{
          marginTop: 18,
          height: 50,
          borderRadius: 25,
          background: sent ? "#1d3b2a" : C.brand,
          color: sent ? GREEN : "#111",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15.5,
          fontWeight: 700,
          transform: `scale(${1 - press * 0.03})`,
        }}
      >
        {sent ? "Draft created in Tradies2Quote" : "Create quote draft"}
      </div>
    </div>
  );
}

