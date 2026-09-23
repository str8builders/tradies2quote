/**
 * What the client sees: the public quote page (`/quote/[token]`:
 * PublicQuoteSummary, AcceptForm, SignaturePad, AcceptedView). Always dark,
 * outside the app shell, so it keeps the plain `.t2q-card-pro` finish.
 */
import type { CSSProperties, ReactNode } from "react";
import { CheckCircle, Eraser } from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE, formatMoney } from "../demo-script";
import { C, FONT, publicCardStyle } from "../marketing/theme";
import { Tap, TotalsRow } from "./ui";
import { BrowserBar } from "./SystemUI";

const [DECKING, LABOUR] = EXAMPLE.lines;

/**
 * A deterministic hand-drawn signature: Catmull-Rom curves through fixed
 * control points, sampled once so the ink reveal and the fingertip share
 * the same arc length.
 */
const SIGNATURE_STROKES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[22, 62], [38, 28], [62, 30], [52, 50], [30, 62], [36, 82], [70, 74], [86, 52]],
  [[90, 64], [102, 40], [108, 80], [120, 54], [134, 68], [148, 50], [162, 70], [178, 50], [194, 68], [208, 48], [224, 66], [242, 46], [264, 54]],
];

function sampleStroke(points: ReadonlyArray<readonly [number, number]>, steps = 14) {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([points[points.length - 1][0], points[points.length - 1][1]]);
  return out;
}

const SIGNATURE = (() => {
  const strokes = SIGNATURE_STROKES.map((s) => sampleStroke(s));
  const lengths = strokes.map((pts) => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0));
  const total = lengths.reduce((a, b) => a + b, 0);
  return { strokes, lengths, total };
})();

export const SIGNATURE_PATHS = SIGNATURE.strokes.map(
  (pts) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")}`,
);

/** Fingertip position after `p` (0..1) of the signature's total length. */
function pointOnSignature(p: number) {
  let remaining = Math.max(0, Math.min(1, p)) * SIGNATURE.total;
  for (let s = 0; s < SIGNATURE.strokes.length; s++) {
    const pts = SIGNATURE.strokes[s];
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (remaining <= d) {
        const t = d === 0 ? 0 : remaining / d;
        return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t };
      }
      remaining -= d;
    }
  }
  const last = SIGNATURE.strokes[SIGNATURE.strokes.length - 1];
  return { x: last[last.length - 1][0], y: last[last.length - 1][1] };
}

/** How much of each stroke is inked at overall progress `p`. */
function strokeProgress(p: number) {
  let remaining = Math.max(0, Math.min(1, p)) * SIGNATURE.total;
  return SIGNATURE.lengths.map((len) => {
    const drawn = Math.max(0, Math.min(len, remaining));
    remaining -= len;
    return len === 0 ? 1 : drawn / len;
  });
}

export function SignatureInk({ progress = 1, width = 3 }: { progress?: number; width?: number }) {
  const parts = strokeProgress(progress);
  return (
    <svg viewBox="0 0 280 100" width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
      {SIGNATURE_PATHS.map((d, i) => (
        <path
          key={i}
          d={d}
          pathLength={1}
          fill="none"
          stroke="#111111"
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1 1"
          strokeDashoffset={1 - parts[i]}
        />
      ))}
    </svg>
  );
}

function Display({ children, size, style }: { children: ReactNode; size: number; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: size, fontWeight: 800, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1.1, ...style }}>
      {children}
    </div>
  );
}

function Mono({ children, size = 10, color = C.ink500, style }: { children: ReactNode; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: FONT.mono, fontSize: size, letterSpacing: "0.2em", textTransform: "uppercase", color, ...style }}>{children}</div>
  );
}

function LineRow({ description, detail, total, last }: { description: string; detail: string; total: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        borderBottom: last ? "none" : `1px solid ${C.ink700}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "#fff" }}>{description}</div>
        <Mono color={C.ink400} style={{ marginTop: 2 }}>
          {detail}
        </Mono>
      </div>
      <div style={{ fontFamily: FONT.mono, fontSize: 14, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{total}</div>
    </div>
  );
}

export function QuoteSummary() {
  const card: CSSProperties = { ...publicCardStyle, padding: 20 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={card}>
        <Mono size={11} color={C.ink400}>
          {"// quote from"}
        </Mono>
        <Display size={24} style={{ marginTop: 4 }}>
          {EXAMPLE.business}
        </Display>
        <div style={{ display: "flex", gap: 28, marginTop: 12 }}>
          <div>
            <Mono>Issued</Mono>
            <Display size={14} style={{ marginTop: 2 }}>
              {EXAMPLE.issued}
            </Display>
          </div>
          <div>
            <Mono>Valid until</Mono>
            <Display size={14} style={{ marginTop: 2 }}>
              {EXAMPLE.validUntil}
            </Display>
          </div>
        </div>
        <div style={{ marginTop: 16, borderTop: `1px solid ${C.ink700}`, paddingTop: 14 }}>
          <Mono>For</Mono>
          <Display size={16} style={{ marginTop: 3 }}>
            {EXAMPLE.client}
          </Display>
        </div>
        <div style={{ marginTop: 14, borderTop: `1px solid ${C.ink700}`, paddingTop: 14, fontSize: 14, lineHeight: 1.5, color: C.ink200 }}>
          {EXAMPLE.jobSummary}
        </div>
      </div>
      <div style={card}>
        <Display size={16} style={{ color: C.brand }}>
          Materials
        </Display>
        <div style={{ marginTop: 6 }}>
          <LineRow
            description={DECKING.description}
            detail={`${DECKING.quantity} ${DECKING.unit} · ${formatMoney(DECKING.unitPrice)}`}
            total={formatMoney(DECKING.total)}
            last
          />
        </div>
      </div>
      <div style={card}>
        <Display size={16} style={{ color: C.brand }}>
          Labour
        </Display>
        <div style={{ marginTop: 6 }}>
          <LineRow
            description={LABOUR.description}
            detail={`${LABOUR.quantity} ${LABOUR.unit} · ${formatMoney(LABOUR.unitPrice)}`}
            total={formatMoney(LABOUR.total)}
            last
          />
        </div>
      </div>
      <div style={card}>
        <TotalsRow label="Materials subtotal" value={formatMoney(EXAMPLE.materialsSubtotal)} />
        <TotalsRow label="Markup" value={formatMoney(EXAMPLE.markup)} />
        <TotalsRow label="Labour subtotal" value={formatMoney(EXAMPLE.labourSubtotal)} />
        <TotalsRow label="Subtotal (excl. GST)" value={formatMoney(EXAMPLE.subtotal)} divider />
        <TotalsRow label={`GST (${EXAMPLE.gstRate}%)`} value={formatMoney(EXAMPLE.gst)} />
        <TotalsRow label="Total (incl. GST)" value={formatMoney(EXAMPLE.total)} emphasis />
      </div>
    </div>
  );
}

export interface AcceptFormState {
  name: string;
  email: string;
  /** 0..1 of the signature drawn. */
  signature: number;
  checked: boolean;
  press?: number;
}

function FormField({ label, value, focused }: { label: string; value: string; focused?: boolean }) {
  return (
    <div>
      <Mono size={10.5} color={C.ink400}>
        {label} <span style={{ color: C.brand }}>*</span>
      </Mono>
      <div
        style={{
          marginTop: 6,
          height: 40,
          borderRadius: 3,
          border: `1px solid ${focused ? C.brand : C.ink600}`,
          background: C.ink900,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          fontSize: 14,
          color: "#fff",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function SignaturePad({ progress, finger }: { progress: number; finger?: boolean }) {
  const tip = pointOnSignature(progress);
  return (
    <div>
      <div
        style={{
          position: "relative",
          height: 118,
          borderRadius: 3,
          border: `2px dashed ${C.ink600}`,
          background: "#ffffff",
          overflow: "hidden",
        }}
      >
        <SignatureInk progress={progress} width={2.6} />
        {finger && progress > 0 && progress < 1 ? (
          <div
            style={{
              position: "absolute",
              left: `${(tip.x / 280) * 100}%`,
              top: `${(tip.y / 100) * 100}%`,
              width: 30,
              height: 30,
              marginLeft: -15,
              marginTop: -15,
              borderRadius: "50%",
              background: "rgba(40, 40, 40, 0.28)",
              border: "2px solid rgba(40,40,40,0.45)",
            }}
          />
        ) : null}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <Mono size={10} color={C.ink400} style={{ letterSpacing: "0.12em" }}>
          {progress >= 1 ? "// signature captured" : "// sign above with your finger or trackpad"}
        </Mono>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: FONT.mono, fontSize: 10.5, color: C.ink300, textTransform: "uppercase", letterSpacing: "0.14em" }}>
          <Eraser size={12} weight="bold" /> Clear
        </div>
      </div>
    </div>
  );
}

export function AcceptForm({ state }: { state: AcceptFormState }) {
  return (
    <div style={{ ...publicCardStyle, padding: 20 }}>
      <Display size={22}>
        Accept this <span style={{ color: C.brand }}>quote.</span>
      </Display>
      <div style={{ marginTop: 6, fontSize: 14, color: C.ink300 }}>Total {formatMoney(EXAMPLE.total)} incl GST.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <FormField label="Your name" value={state.name} />
        <FormField label="Your email" value={state.email} />
      </div>
      <Mono size={10.5} color={C.ink400} style={{ marginTop: 16, marginBottom: 6 }}>
        Signature
      </Mono>
      <SignaturePad progress={state.signature} finger />
      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          borderRadius: 3,
          border: `1px solid ${C.ink700}`,
          background: C.ink800,
          padding: 12,
          fontSize: 13,
          lineHeight: 1.45,
          color: C.ink200,
        }}
      >
        <div
          style={{
            flexShrink: 0,
            width: 18,
            height: 18,
            marginTop: 1,
            borderRadius: 4,
            border: `1.5px solid ${state.checked ? C.brand : C.ink400}`,
            background: state.checked ? C.brand : "transparent",
            display: "grid",
            placeItems: "center",
          }}
        >
          {state.checked ? (
            <svg width="11" height="9" viewBox="0 0 11 9" aria-hidden>
              <path d="M1 4.5 4 7.5 10 1.5" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </div>
        I accept this quote and authorise the work as described above.
      </div>
      <div
        style={{
          marginTop: 16,
          height: 48,
          borderRadius: 999,
          background: C.brand,
          color: C.ink900,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontSize: 15,
          fontWeight: 700,
          transform: `scale(${1 - (state.press ?? 0) * 0.03})`,
          filter: state.press ? `brightness(${1 + state.press * 0.15})` : undefined,
        }}
      >
        <CheckCircle size={19} weight="bold" /> Accept and sign
      </div>
    </div>
  );
}

export function AcceptedView() {
  return (
    <div style={{ borderRadius: 3, border: "1px solid rgba(255,95,21,0.4)", background: "rgba(255,95,21,0.1)", padding: 20 }}>
      <CheckCircle size={28} weight="fill" color={C.brand} />
      <Display size={22} style={{ marginTop: 8, textTransform: "none", letterSpacing: "-0.03em" }}>
        Quote accepted
      </Display>
      <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5, color: C.ink200 }}>
        Accepted by {EXAMPLE.client} on {EXAMPLE.accepted}.
        <br />
        Total {formatMoney(EXAMPLE.total)} incl GST.
      </div>
      <Mono size={10} color={C.brand} style={{ marginTop: 14 }}>
        Signature
      </Mono>
      <div style={{ marginTop: 6, height: 64, width: 190, borderRadius: 3, border: `1px solid ${C.ink700}`, background: "#fff" }}>
        <SignatureInk />
      </div>
    </div>
  );
}

export interface ClientQuoteScreenProps {
  scroll?: number;
  form?: AcceptFormState;
  accepted?: boolean;
  tap?: { x: number; y: number; p: number } | null;
}

export function ClientQuoteScreen({ scroll = 0, form, accepted = false, tap = null }: ClientQuoteScreenProps) {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: C.ink900 }} />
      <div style={{ position: "absolute", left: 16, right: 16, top: 70, transform: `translateY(${-scroll}px)` }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", textTransform: "uppercase", marginBottom: 22 }}>
          tradies<span style={{ color: C.brand }}>2</span>Quote
        </div>
        {accepted ? (
          <div style={{ marginBottom: 24 }}>
            <AcceptedView />
          </div>
        ) : null}
        <QuoteSummary />
        {!accepted && form ? (
          <div style={{ marginTop: 24 }}>
            <AcceptForm state={form} />
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 62,
          zIndex: 30,
          background: "linear-gradient(180deg, rgba(17,17,17,1) 0%, rgba(17,17,17,0.96) 70%, rgba(17,17,17,0) 100%)",
        }}
      />
      <BrowserBar host={EXAMPLE.site} />
      {tap ? <Tap x={tap.x} y={tap.y} p={tap.p} /> : null}
    </>
  );
}
