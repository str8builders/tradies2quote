/**
 * The client QR request flow: the printed poster (`/print/request-poster`),
 * the public request form (`/r/[slug]`: RequestForm.tsx) and the request
 * arriving in the app (`/app/requests`).
 *
 * The QR code encodes the public marketing site, never a real request link.
 */
import type { CSSProperties, ReactNode } from "react";
import QRCode from "qrcode";
import { Camera, CheckCircle, PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE } from "../demo-script";
import { C, FONT, publicCardStyle } from "../marketing/theme";
import { Accent, AppCanvas, Avatar, BottomNav, Card, GhostButton, H1, MonoLabel, Page, PrimaryButton, SectionLabel, Tap, TopScrim } from "./ui";
import { BrowserBar } from "./SystemUI";

const QR = QRCode.create(EXAMPLE.siteUrl, { errorCorrectionLevel: "M" });

export function QrCode({ size, color = "#0A0A0A" }: { size: number; color?: string }) {
  const n = QR.modules.size;
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (QR.modules.get(x, y)) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />);
    }
  }
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" aria-hidden>
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#ffffff" />
      <g fill={color}>{cells}</g>
    </svg>
  );
}

/** The printable request poster, as it hangs on the van or the site fence. */
export function RequestPoster({ width = 360, style }: { width?: number; style?: CSSProperties }) {
  const s = width / 360;
  return (
    <div style={{ width, borderRadius: 22 * s, overflow: "hidden", background: "#ffffff", boxShadow: "0 30px 70px rgba(0,0,0,0.55)", fontFamily: FONT.display, ...style }}>
      <div style={{ padding: `${22 * s}px ${24 * s}px`, background: "linear-gradient(120deg, #141718, #1c2021 60%, #2a1a10)" }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 11 * s, letterSpacing: "0.2em", textTransform: "uppercase", color: "#ffa06d" }}>Scan for a quote</div>
        <div style={{ marginTop: 8 * s, fontSize: 30 * s, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-0.04em", color: "#fff" }}>
          Need a price?
          <br />
          <span style={{ color: C.brand }}>Scan. Describe. Done.</span>
        </div>
      </div>
      <div style={{ padding: 22 * s, display: "flex", gap: 18 * s, alignItems: "center" }}>
        <div style={{ border: `${4 * s}px solid #0A0A0A`, borderRadius: 10 * s, padding: 4 * s, background: "#fff", position: "relative" }}>
          <QrCode size={150 * s} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 * s }}>
          {["Point your camera at the code.", "Tell us about the job.", "We come back with a quote."].map((line, i) => (
            <div key={line} style={{ borderTop: `${3 * s}px solid ${C.hivis}`, paddingTop: 6 * s }}>
              <span style={{ fontSize: 16 * s, fontWeight: 800, color: C.brand }}>{i + 1}</span>
              <div style={{ fontSize: 12.5 * s, lineHeight: 1.3, color: "#1a1a1a", fontWeight: 600 }}>{line}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: `0 ${22 * s}px ${18 * s}px`, fontSize: 11 * s, color: "#555" }}>
        No app needed. Works on any phone. <b>Powered by Tradies2Quote.</b>
      </div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: "0.2em", textTransform: "uppercase", color: C.ink400 }}>{children}</div>
  );
}

function Box({ children, height = 40, focused, style }: { children?: ReactNode; height?: number; focused?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        marginTop: 6,
        minHeight: height,
        borderRadius: 3,
        border: `1px solid ${focused ? C.brand : C.ink600}`,
        background: C.ink900,
        padding: "9px 12px",
        fontSize: 14,
        lineHeight: 1.5,
        color: "#fff",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface RequestFormState {
  /** Characters of the job description typed so far. */
  typed: number;
  name: boolean;
  email: boolean;
  press?: number;
  sent?: boolean;
}

/** The client's phone: the public request form behind the QR code. */
export function RequestFormScreen({ state, scroll = 0, tap = null }: { state: RequestFormState; scroll?: number; tap?: { x: number; y: number; p: number } | null }) {
  const text = EXAMPLE.request.slice(0, state.typed);
  const typing = state.typed > 0 && state.typed < EXAMPLE.request.length;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: C.ink900 }} />
      <div style={{ position: "absolute", left: 16, right: 16, top: 72, transform: `translateY(${-scroll}px)` }}>
        <MonoLabel size={11} color="#ff8b54" style={{ letterSpacing: "0.14em" }}>
          {"// request a quote"}
        </MonoLabel>
        <div style={{ marginTop: 6, fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", textTransform: "uppercase" }}>{EXAMPLE.business}</div>
        <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: C.ink300 }}>
          Tell {EXAMPLE.business} what you need done, in your own words. They&apos;ll review it and come back to you with a quote. No account needed.
        </div>
        {state.sent ? (
          <div style={{ ...publicCardStyle, marginTop: 20, padding: 20 }}>
            <CheckCircle size={30} weight="fill" color={C.brand} />
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Sent to {EXAMPLE.business}</div>
            <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.55, color: C.ink200 }}>
              Thanks {EXAMPLE.clientFirstName}. {EXAMPLE.business} has your request and will come back to you at {EXAMPLE.clientEmail} with a quote.
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label>
                What do you need done? <span style={{ color: C.brand }}>*</span>
              </Label>
              <Box height={96} focused={typing}>
                {text}
                {typing ? <span style={{ display: "inline-block", width: 1.5, height: "1.05em", background: C.brand, verticalAlign: "-0.15em" }} /> : null}
              </Box>
            </div>
            <div>
              <Label>
                Your name <span style={{ color: C.brand }}>*</span>
              </Label>
              <Box>{state.name ? EXAMPLE.client : ""}</Box>
            </div>
            <div>
              <Label>Email</Label>
              <Box>{state.email ? EXAMPLE.clientEmail : ""}</Box>
            </div>
            <div>
              <Label>Photos (optional)</Label>
              <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: C.brand }}>
                <Camera size={16} weight="bold" /> Add a photo
              </div>
            </div>
            <div
              style={{
                marginTop: 4,
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
              }}
            >
              <PaperPlaneTilt size={18} weight="bold" /> Send to {EXAMPLE.business}
            </div>
          </div>
        )}
        <div style={{ marginTop: 18, fontSize: 12, color: C.ink400 }}>Powered by Tradies2Quote. Your details go only to {EXAMPLE.business}.</div>
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

/** The tradie's phone: the request waiting as a draft quote. */
export function RequestsScreen({ arrive = 1, press = 0, tap = null }: { arrive?: number; press?: number; tap?: { x: number; y: number; p: number } | null }) {
  return (
    <>
      <AppCanvas />
      <Page top={112}>
        <SectionLabel>{"// from your request link"}</SectionLabel>
        <H1 style={{ marginTop: 10 }}>
          Quote <Accent>requests.</Accent>
        </H1>
        <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: C.ink300 }}>
          Jobs clients have sent through your public link. Each one is a draft quote on your account — open it, check the numbers, and send.
        </div>
        <Card
          style={{
            marginTop: 18,
            opacity: Math.min(1, arrive * 1.3),
            transform: `translateY(${(1 - arrive) * -30}px) scale(${0.97 + 0.03 * arrive})`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.hivis, boxShadow: "0 0 10px #ffea0088" }} />
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>{EXAMPLE.client}</span>
          </div>
          <div
            style={{
              marginTop: 8,
              display: "inline-block",
              border: `1px solid ${C.ink600}`,
              borderRadius: 3,
              padding: "3px 7px",
              fontFamily: FONT.mono,
              fontSize: 9.5,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: C.ink200,
            }}
          >
            Draft ready to review
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: "#A3A3A3" }}>{EXAMPLE.clientEmail}</div>
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: C.ink100 }}>{EXAMPLE.request}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: C.ink400 }}>Today, 9:41 am</div>
          <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.4fr", gap: 8, marginTop: 14 }}>
            <GhostButton>Dismiss</GhostButton>
            <PrimaryButton pressed={press}>Open draft quote</PrimaryButton>
          </div>
        </Card>
      </Page>
      <TopScrim />
      <Avatar />
      <BottomNav active="home" />
      {tap ? <Tap x={tap.x} y={tap.y} p={tap.p} /> : null}
    </>
  );
}
