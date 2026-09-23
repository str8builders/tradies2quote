/**
 * The wide layout's side card: the chapter's key detail in large type, in
 * sync with the phone, so the story still reads when the video is small.
 */
import type { CSSProperties, ReactNode } from "react";
import { Calculator, Check, CheckCircle, Receipt } from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE, formatMoney, lineTotal, type SceneId } from "../demo-script";
import { eseg, seg, wordsShown } from "./anim";
import { C, FONT } from "./theme";
import { CALC_BEATS, checkBeats, draftBeats, invoiceBeats, labourLineAt, sendBeats, talkBeats, type Pace } from "./beats";
import { Waveform } from "../screens/Waveform";
import { SignatureInk } from "../screens/ClientQuoteScreen";
import { RequestPoster } from "../screens/RequestScreens";

const [DECK, LABOUR] = EXAMPLE.lines;

export function CalloutCard({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        borderRadius: 30,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))",
        boxShadow: "0 30px 80px -30px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
        padding: "30px 36px",
        color: "#f4f3ef",
        ...style,
      }}
    >
      <div style={{ fontFamily: FONT.mono, fontSize: 19, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a9aeab" }}>{label}</div>
      <div style={{ marginTop: 18 }}>{children}</div>
    </div>
  );
}

function Row({ label, value, show = 1, strong, detail }: { label: ReactNode; value: string; show?: number; strong?: boolean; detail?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 24,
        padding: "12px 0",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        opacity: show,
        transform: `translateY(${(1 - show) * -14}px)`,
      }}
    >
      <div>
        <div style={{ fontSize: strong ? 34 : 30, fontWeight: strong ? 800 : 600, letterSpacing: "-0.03em", color: "#f4f3ef" }}>{label}</div>
        {detail ? <div style={{ marginTop: 4, fontFamily: FONT.mono, fontSize: 18, letterSpacing: "0.08em", color: "#a9aeab" }}>{detail}</div> : null}
      </div>
      <div
        style={{
          fontSize: strong ? 44 : 32,
          fontWeight: strong ? 800 : 600,
          letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums",
          color: strong ? C.brand : "#f4f3ef",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Tick({ on }: { on: number }) {
  return (
    <span
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 34,
        height: 34,
        marginRight: 14,
        borderRadius: "50%",
        verticalAlign: "-4px",
        border: `2px solid ${on > 0.5 ? C.emerald : "rgba(255,255,255,0.25)"}`,
        background: on > 0.5 ? "rgba(16,185,129,0.18)" : "transparent",
        color: C.emerald300,
        transform: `scale(${0.85 + 0.15 * on})`,
      }}
    >
      {on > 0.5 ? <Check size={18} weight="bold" /> : null}
    </span>
  );
}

function TalkCallout({ p, frame, pace }: { p: number; frame: number; pace: Pace }) {
  const T = talkBeats(pace);
  const speaking = eseg(p, T.rec[0], T.rec[0] + 0.04) * (1 - eseg(p, T.rec[1] - 0.04, T.rec[1]));
  const words = wordsShown(EXAMPLE.transcript, seg(p, T.rec[0] + 0.02, T.rec[1] - 0.02));
  const all = EXAMPLE.transcript.split(" ");
  const highlight = p >= T.words[0];
  return (
    <CalloutCard label="// You, on site">
      <div style={{ height: 70, width: 420 }}>
        <Waveform frame={frame} speaking={speaking} idleMotion={0.6} />
      </div>
      <div style={{ marginTop: 18, fontSize: 38, lineHeight: 1.34, fontWeight: 600, letterSpacing: "-0.025em", color: "#f4f3ef" }}>
        {all.map((w, i) => {
          const size = /^(24|square|metres)$/.test(w.replace(/[.,]/g, ""));
          return (
            <span key={i} style={{ opacity: i < words ? 1 : 0.16 }}>
              <span style={highlight && size ? { color: C.brand } : undefined}>{w}</span>{" "}
            </span>
          );
        })}
      </div>
    </CalloutCard>
  );
}

function DraftCallout({ p, pace }: { p: number; pace: Pace }) {
  const T = draftBeats(pace);
  const count = eseg(p, T.count[0], T.count[1]);
  return (
    <CalloutCard label={`// Draft quote · ${EXAMPLE.quoteNumber}`}>
      <Row label={DECK.description} value={formatMoney(DECK.total)} show={eseg(p, T.deck[0], T.deck[1])} />
      <Row
        label={LABOUR.description}
        value={formatMoney(lineTotal(EXAMPLE.draftLabour.quantity, EXAMPLE.draftLabour.unitPrice))}
        show={eseg(p, T.labour[0], T.labour[1])}
      />
      <Row label={`GST (${EXAMPLE.gstRate}%)`} value={formatMoney(EXAMPLE.gst * count)} show={eseg(p, T.count[0] - 0.06, T.count[0])} />
      <Row label="Total (NZD)" value={formatMoney(EXAMPLE.total * count)} show={eseg(p, T.count[0] - 0.06, T.count[0])} strong />
    </CalloutCard>
  );
}

function CheckCallout({ p, pace }: { p: number; pace: Pace }) {
  const T = checkBeats(pace);
  const line = labourLineAt(p, pace);
  const hoursEdited = line.quantity !== EXAMPLE.draftLabour.quantity;
  const rateEdited = line.unitPrice !== EXAMPLE.draftLabour.unitPrice;
  return (
    <CalloutCard label="// Your call, line by line">
      <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em", padding: "10px 0" }}>
        <Tick on={eseg(p, T.deckTick[0], T.deckTick[1])} />
        {DECK.description}
        <div style={{ marginLeft: 48, marginTop: 4, fontFamily: FONT.mono, fontSize: 20, color: "#a9aeab" }}>
          {DECK.quantity} m² × {formatMoney(DECK.unitPrice)} = {formatMoney(lineTotal(DECK.quantity, DECK.unitPrice))}
        </div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em", padding: "10px 0" }}>
        <Tick on={eseg(p, T.labourTick[0], T.labourTick[1])} />
        {LABOUR.description}
        <div style={{ marginLeft: 48, marginTop: 4, fontFamily: FONT.mono, fontSize: 20, color: "#a9aeab" }}>
          <span style={{ color: hoursEdited ? C.hivis : "#a9aeab" }}>{line.quantity} hr</span> ×{" "}
          <span style={{ color: rateEdited ? C.hivis : "#a9aeab" }}>{formatMoney(line.unitPrice)}</span> ={" "}
          <span style={{ color: line.flash > 0 ? "#ffffff" : "#a9aeab" }}>{formatMoney(line.total)}</span>
        </div>
      </div>
      <div
        style={{
          marginTop: 16,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          borderRadius: 999,
          border: "1px solid rgba(255,234,0,0.35)",
          background: "rgba(255,234,0,0.08)",
          padding: "10px 20px",
          fontSize: 24,
          fontWeight: 600,
          color: C.hivis,
          opacity: rateEdited ? 1 : 0,
        }}
      >
        Your rate: {formatMoney(LABOUR.unitPrice)} an hour
      </div>
    </CalloutCard>
  );
}

function Stage({ label, on, tone }: { label: string; on: number; tone: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 30,
        fontWeight: 700,
        color: on > 0.5 ? tone : "rgba(255,255,255,0.3)",
        transform: `scale(${0.96 + 0.04 * on})`,
      }}
    >
      <CheckCircle size={34} weight={on > 0.5 ? "fill" : "regular"} />
      {label}
    </div>
  );
}

function SendCallout({ p, pace }: { p: number; pace: Pace }) {
  const T = sendBeats(pace);
  const sentAt = T.email ? T.email[1] : 0;
  return (
    <CalloutCard label={`// Sent to ${EXAMPLE.client}`}>
      <div style={{ display: "flex", gap: 34 }}>
        <Stage label="Sent" on={p >= sentAt ? 1 : 0} tone={C.blue300} />
        <Stage label="Viewed" on={p >= T.read[0] + 0.04 ? 1 : 0} tone={C.hivis} />
        <Stage label="Accepted" on={p >= T.accepted ? 1 : 0} tone="#ff8b54" />
      </div>
      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ width: 300, height: 108, borderRadius: 14, background: "#fff", padding: 6 }}>
          <SignatureInk progress={seg(p, T.sign[0], T.sign[1])} width={3.2} />
        </div>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em" }}>{EXAMPLE.client}</div>
          <div style={{ marginTop: 6, fontSize: 24, color: "#a9aeab" }}>
            {p >= T.accepted ? `Accepted · ${formatMoney(EXAMPLE.total)}` : "Signing on their phone…"}
          </div>
        </div>
      </div>
    </CalloutCard>
  );
}

function InvoiceCallout({ p, pace }: { p: number; pace: Pace }) {
  const T = invoiceBeats(pace);
  const created = p >= T.draft;
  const paid = p >= T.paid;
  const stamp = eseg(p, T.paid, T.paid + 0.08);
  return (
    <CalloutCard label="// Invoice">
      <div style={{ display: "flex", alignItems: "center", gap: 20, opacity: created ? 1 : 0.35 }}>
        <Receipt size={54} weight="duotone" color={C.brand} />
        <div>
          <div style={{ fontSize: 50, fontWeight: 800, letterSpacing: "-0.04em" }}>{created ? EXAMPLE.invoiceNumber : "Ready to invoice"}</div>
          <div style={{ fontSize: 26, color: "#c9ccca" }}>
            {EXAMPLE.client} · {formatMoney(EXAMPLE.total)}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            borderRadius: 14,
            border: `3px solid ${paid ? C.emerald : "rgba(255,255,255,0.2)"}`,
            color: paid ? C.emerald300 : "#9a9f9c",
            padding: "10px 22px",
            fontFamily: FONT.mono,
            fontSize: 34,
            fontWeight: 600,
            letterSpacing: "0.16em",
            transform: `rotate(${-4 * stamp}deg) scale(${1 + 0.2 * Math.sin(stamp * Math.PI)})`,
          }}
        >
          {paid ? "PAID" : created ? "DUE IN 7 DAYS" : "DRAFT"}
        </div>
        {paid ? <div style={{ fontSize: 24, color: "#a9aeab" }}>Paid in full · {EXAMPLE.paid}</div> : null}
      </div>
    </CalloutCard>
  );
}

function RequestCallout({ p }: { p: number }) {
  return (
    <div style={{ transform: `rotate(${-2 + p * 1.5}deg)`, transformOrigin: "30% 60%", width: 400, marginLeft: 24, marginTop: -44 }}>
      <RequestPoster width={380} />
    </div>
  );
}

function CalculatorCallout({ p }: { p: number }) {
  const T = CALC_BEATS;
  const sent = p >= T.sent;
  return (
    <CalloutCard label="// Measured in T2QCAL">
      <div style={{ display: "flex", alignItems: "baseline", gap: 20, fontFamily: FONT.mono }}>
        <span style={{ fontSize: 44, color: "#f4f3ef" }}>6.0 m × 4.0 m</span>
        <span style={{ fontSize: 44, color: "#4ade80", opacity: eseg(p, T.draw[1] - 0.06, T.draw[1]) }}>= 24.0 m²</span>
      </div>
      <div
        style={{
          marginTop: 24,
          borderRadius: 18,
          border: "1px solid rgba(147,197,253,0.3)",
          background: "rgba(59,130,246,0.08)",
          padding: "18px 22px",
          opacity: sent ? 1 : 0.3,
          transform: `translateY(${sent ? 0 : 10}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: FONT.mono, fontSize: 18, letterSpacing: "0.16em", color: C.blue300, textTransform: "uppercase" }}>
          <Calculator size={20} weight="bold" /> Calculated takeoff
        </div>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 30, fontWeight: 600, letterSpacing: "-0.03em" }}>
          <span>{DECK.description}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(DECK.total)}</span>
        </div>
        <div style={{ marginTop: 4, fontFamily: FONT.mono, fontSize: 20, color: "#a9aeab" }}>
          {DECK.quantity} m² × {formatMoney(DECK.unitPrice)}
        </div>
      </div>
    </CalloutCard>
  );
}

export function Callout({ id, p, frame, pace }: { id: SceneId; p: number; frame: number; pace: Pace }) {
  switch (id) {
    case "talk":
      return <TalkCallout p={p} frame={frame} pace={pace} />;
    case "draft":
      return <DraftCallout p={p} pace={pace} />;
    case "check":
      return <CheckCallout p={p} pace={pace} />;
    case "send":
      return <SendCallout p={p} pace={pace} />;
    case "invoice":
      return <InvoiceCallout p={p} pace={pace} />;
    case "request":
      return <RequestCallout p={p} />;
    case "calculator":
      return <CalculatorCallout p={p} />;
    default:
      return null;
  }
}
