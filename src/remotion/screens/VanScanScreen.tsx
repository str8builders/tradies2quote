/**
 * The client's side of a QR request, before the form: their phone camera
 * pointed at the tradie's sticker on the side of a van. The camera finds
 * the code (yellow brackets), the link pops up, a tap opens the request
 * page. The sticker is the one Your QR code prints
 * (app/print/_components/StickerSheet.tsx): orange band, code, business.
 *
 * The code on the sticker is real and opens tradies2quote.com, so anyone
 * who scans the video off a screen lands somewhere that exists. The
 * business is the demo's ("Your Business"): no real names in marketing.
 */
import type { CSSProperties } from "react";
import QRCode from "qrcode";
import { Compass, Lightning } from "@phosphor-icons/react/dist/ssr";
import { EXAMPLE } from "../demo-script";
import { eseg, seg } from "../marketing/anim";
import { NL_FONT } from "./newlook/ui";
import { Tap } from "./ui";

/** Frames of the scan beat (30 fps), before the request form. */
export const VAN_SCAN_FRAMES = 72;
/** The beats, in frames. */
export const VAN_SCAN_BEATS = {
  approach: [0, 26],
  found: [24, 31],
  chip: [28, 37],
  tap: [44, 54],
  push: [56, 70],
} as const;

/** Where the link chip sits on the 390 × 844 screen (the tap lands on it). */
export const VAN_SCAN_CHIP = { x: 195, y: 602 } as const;

const CAMERA_YELLOW = "#FFD60A";
const QR_URL = "https://tradies2quote.com";
const QR_MATRIX = QRCode.create(QR_URL, { errorCorrectionLevel: "M" }).modules;
/** One path of every dark module, in module units (plus the quiet zone). */
const QR_PATH = (() => {
  let d = "";
  for (let r = 0; r < QR_MATRIX.size; r++) {
    for (let c = 0; c < QR_MATRIX.size; c++) if (QR_MATRIX.get(r, c)) d += `M${c + 1} ${r + 1}h1v1h-1z`;
  }
  return d;
})();

const VIEW_TOP = 110;
const VIEW_H = 540;
/** The sticker on the van, in viewfinder units. */
const STICKER = { cx: 195, top: 128, width: 196 } as const;
const QR_SIZE = 140;
const BAND_H = 40;

function Sticker() {
  const quiet = QR_MATRIX.size + 2;
  return (
    <div
      style={{
        position: "absolute",
        left: STICKER.cx - STICKER.width / 2,
        top: STICKER.top,
        width: STICKER.width,
        background: "#fff",
        border: "4px solid #0A0A0A",
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        boxShadow: "0 2px 0 rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          alignSelf: "stretch",
          height: BAND_H,
          background: "#FF5F15",
          color: "#121211",
          fontFamily: NL_FONT.display,
          fontSize: 16,
          letterSpacing: -0.2,
          display: "grid",
          placeItems: "center",
          textTransform: "uppercase",
        }}
      >
        Scan for a quote
      </div>
      <svg width={QR_SIZE} height={QR_SIZE} viewBox={`0 0 ${quiet} ${quiet}`} style={{ marginTop: 10 }} shapeRendering="crispEdges">
        <rect width={quiet} height={quiet} fill="#fff" />
        <path d={QR_PATH} fill="#0A0A0A" />
      </svg>
      <div style={{ marginTop: 6, fontFamily: NL_FONT.sans, fontWeight: 700, fontSize: 14, color: "#0A0A0A" }}>{EXAMPLE.business}</div>
      <div style={{ margin: "3px 10px 10px", fontFamily: NL_FONT.sans, fontSize: 8, color: "#333", textAlign: "center" }}>
        Point your phone camera at the code. No app needed.
      </div>
    </div>
  );
}

/** Yellow corner brackets around the code once the camera has found it. */
function Found({ shown }: { shown: number }) {
  if (shown <= 0) return null;
  const pad = 9;
  const size = QR_SIZE + pad * 2;
  const left = STICKER.cx - size / 2;
  const top = STICKER.top + 4 + BAND_H + 10 - pad;
  const arm = 24;
  const corner = (style: CSSProperties) => (
    <div style={{ position: "absolute", width: arm, height: arm, borderColor: CAMERA_YELLOW, borderStyle: "solid", borderWidth: 0, ...style }} />
  );
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        opacity: shown,
        transform: `scale(${1.18 - 0.18 * shown})`,
      }}
    >
      {corner({ left: 0, top: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 })}
      {corner({ right: 0, top: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 })}
      {corner({ left: 0, bottom: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 })}
      {corner({ right: 0, bottom: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 })}
    </div>
  );
}

/** The side of the van, with the sticker, as the camera sees it (handheld, stepping closer). */
function Viewfinder({ frame }: { frame: number }) {
  const t = frame / 30;
  const B = VAN_SCAN_BEATS;
  const zoom = 1 + 0.16 * eseg(frame, B.approach[0], B.approach[1]);
  // A hand holding a phone: never quite still, steadier once the code's found.
  const steady = 1 - 0.6 * seg(frame, B.found[0], B.found[1]);
  const dx = Math.sin(t * 1.3) * 3.2 * steady;
  const dy = Math.cos(t * 1.1) * 2.6 * steady;
  const tilt = Math.sin(t * 0.9) * 0.6 * steady;
  const origin = `${STICKER.cx}px ${STICKER.top + 115}px`;
  return (
    <div style={{ position: "absolute", left: 0, top: VIEW_TOP, width: 390, height: VIEW_H, overflow: "hidden", background: "#cfd3d8" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg) scale(${zoom})`,
          transformOrigin: origin,
        }}
      >
        {/* The van's side: panel, window, a crease, the handle, a wheel. */}
        <div style={{ position: "absolute", left: -60, top: -60, right: -60, bottom: -60, background: "linear-gradient(180deg, #F4F5F7 0%, #E4E7EA 55%, #D3D7DC 100%)" }} />
        <div style={{ position: "absolute", left: -40, top: -50, width: 150, height: 150, borderRadius: 22, background: "linear-gradient(160deg, #2B333A, #151A1E)" }} />
        <div style={{ position: "absolute", left: -60, right: -60, top: 408, height: 2, background: "#C2C7CD" }} />
        <div style={{ position: "absolute", left: -60, right: -60, top: 410, height: 1, background: "#FBFCFD" }} />
        <div style={{ position: "absolute", left: 22, top: 300, width: 48, height: 12, borderRadius: 6, background: "#8E959C" }} />
        <div style={{ position: "absolute", left: 250, top: 470, width: 200, height: 200, borderRadius: "50%", background: "#2A2F34" }} />
        <div style={{ position: "absolute", left: 266, top: 486, width: 168, height: 168, borderRadius: "50%", background: "#141618" }} />
        <div style={{ position: "absolute", left: 306, top: 526, width: 88, height: 88, borderRadius: "50%", background: "#9AA0A6" }} />
        <Sticker />
        <Found shown={eseg(frame, B.found[0], B.found[1])} />
      </div>
    </div>
  );
}

function ModeLabels() {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 664, display: "flex", justifyContent: "center", gap: 22, fontFamily: NL_FONT.sans, fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>
      <span style={{ color: "rgba(255,255,255,0.75)" }}>VIDEO</span>
      <span style={{ color: CAMERA_YELLOW }}>PHOTO</span>
      <span style={{ color: "rgba(255,255,255,0.75)" }}>PORTRAIT</span>
    </div>
  );
}

/**
 * The camera screen at `frame` (0 … VAN_SCAN_FRAMES): stepping up to the
 * van, the code found, the link chip, the tap. The push to the request form
 * is the caller's (FeatureScreen), over VAN_SCAN_BEATS.push.
 */
export function VanScanScreen({ frame }: { frame: number }) {
  const B = VAN_SCAN_BEATS;
  const chip = eseg(frame, B.chip[0], B.chip[1]);
  const tapP = seg(frame, B.tap[0], B.tap[1]);
  const press = tapP > 0 && tapP < 1 ? Math.sin(Math.min(1, tapP / 0.6) * Math.PI) : 0;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      {/* Top controls: flash, and the camera's own options. */}
      <div style={{ position: "absolute", left: 24, top: 64, color: "#fff", opacity: 0.9 }}>
        <Lightning size={22} weight="fill" />
      </div>
      <div style={{ position: "absolute", right: 24, top: 62, width: 26, height: 26, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.85)" }} />
      <Viewfinder frame={frame} />
      {chip > 0 ? (
        <div
          style={{
            position: "absolute",
            left: VAN_SCAN_CHIP.x - 112,
            top: VAN_SCAN_CHIP.y - 22,
            width: 224,
            height: 44,
            borderRadius: 22,
            background: CAMERA_YELLOW,
            color: "#111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: NL_FONT.sans,
            fontSize: 16,
            fontWeight: 600,
            opacity: chip,
            transform: `translateY(${(1 - chip) * 10}px) scale(${(0.92 + 0.08 * chip) * (1 - 0.04 * press)})`,
            filter: press ? `brightness(${1 - 0.12 * press})` : undefined,
            boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
          }}
        >
          <Compass size={19} weight="bold" />
          tradies2quote.com
        </div>
      ) : null}
      <ModeLabels />
      {/* The shutter, the last photo, flip camera. */}
      <div style={{ position: "absolute", left: 157, top: 700, width: 76, height: 76, borderRadius: "50%", border: "4px solid #fff", display: "grid", placeItems: "center" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#fff" }} />
      </div>
      <div style={{ position: "absolute", left: 44, top: 716, width: 44, height: 44, borderRadius: 8, background: "linear-gradient(135deg, #5b4a3a, #2a2f34)" }} />
      <div style={{ position: "absolute", left: 304, top: 716, width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.14)" }} />
      <Tap x={VAN_SCAN_CHIP.x} y={VAN_SCAN_CHIP.y} p={tapP} />
    </div>
  );
}
