/**
 * Barcode scanning (materials/_components/BarcodeScanSheet.tsx and
 * BarcodeScanViews.tsx): the "Scan barcode" sheet over the quote, the live
 * camera on a box of deck screws, the code checked against the tradie's own
 * prices, then the item added to the quote. The wording is the app's; the
 * product is generic and its barcode is an in-store code (see ./ean13).
 */
import type { ReactNode } from "react";
import { Barcode, Camera, CheckCircle, CircleNotch, Keyboard, X } from "@phosphor-icons/react/dist/ssr";
import { C, FONT } from "../marketing/theme";
import { DEMO_BARCODE, ean13Modules } from "./ean13";
import { PrimaryButton, Tap } from "./ui";

export type BarcodeStage = "camera" | "checking" | "found" | "added";

/** The example item in the tradie's price list. */
/** The screws from the scanned supplier quote (EXAMPLE.supplierLines), now in the tradie's prices. */
export const SCREWS = { name: "Stainless deck screws", unit: "box", price: 45 } as const;

/**
 * Where the sheet's top edge sits for each step: it hugs its content like the
 * real one (tall for the camera, short once the item is found).
 */
export const BARCODE_SHEET_TOP: Record<BarcodeStage, number> = { camera: 138, checking: 545, found: 479, added: 401 };
/** "Add to quote", from the sheet's top edge (header 65 + padding 16 + item 104 + gap 20 + half the button). */
export const ADD_BUTTON_FROM_TOP = 228;

function EanBars({ code, width, height }: { code: string; width: number; height: number }) {
  const modules = ean13Modules(code);
  // Quiet zones of 9 modules each side, as the standard asks.
  const total = modules.length + 18;
  const m = width / total;
  const guards = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  const bars: ReactNode[] = [];
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== "1") continue;
    bars.push(<rect key={i} x={(9 + i) * m} y={0} width={m + 0.02} height={guards.has(i) ? height : height - 9} fill="#101010" />);
  }
  const digits = (text: string, from: number, count: number) => (
    <text x={(9 + from + count * 3.5) * m} y={height + 1} fontSize={11} textAnchor="middle" fill="#101010" fontFamily={FONT.mono} letterSpacing={2.2}>
      {text}
    </text>
  );
  return (
    <svg width={width} height={height + 4} viewBox={`0 0 ${width} ${height + 4}`} aria-hidden>
      {bars}
      <text x={3 * m} y={height + 1} fontSize={11} fill="#101010" fontFamily={FONT.mono}>
        {code[0]}
      </text>
      {digits(code.slice(1, 7), 3, 6)}
      {digits(code.slice(7), 50, 6)}
    </svg>
  );
}

/** The live camera: the end of a box of deck screws, held a little unsteadily. */
function CameraView({ t, scan, locked }: { t: number; scan: number; locked: number }) {
  const sway = Math.sin(t * 5.1) * 4 + Math.sin(t * 2.3) * 3;
  const tilt = -4 + Math.sin(t * 1.7) * 1.2;
  return (
    <div style={{ position: "relative", height: 318, borderRadius: 18, overflow: "hidden", background: "#2a2118" }}>
      <div
        style={{
          position: "absolute",
          inset: -30,
          transform: `translate(${sway}px, ${sway * 0.6}px) rotate(${tilt}deg) scale(1.06)`,
          background: "linear-gradient(160deg, #b98c55 0%, #a67a45 45%, #8f6637 100%)",
        }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, top: 92, height: 2, background: "#0000002a" }} />
        <div
          style={{
            position: "absolute",
            left: 70,
            top: 118,
            width: 262,
            borderRadius: 8,
            background: "#f7f4ec",
            boxShadow: "0 2px 0 #00000026",
            padding: "12px 14px 10px",
            color: "#151515",
          }}
        >
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 15, letterSpacing: "0.02em" }}>STAINLESS DECK SCREWS</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 10.5, marginTop: 3, color: "#444" }}>10g × 65 mm · Type 17 · 500 pcs</div>
          <div style={{ marginTop: 10 }}>
            <EanBars code={DEMO_BARCODE} width={232} height={62} />
          </div>
        </div>
      </div>
      {/* The guide frame and the reading line. */}
      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          top: 128,
          height: 128,
          borderRadius: 14,
          border: `2px solid ${locked > 0 ? `rgba(95, 214, 160, ${0.5 + locked * 0.5})` : "rgba(255,255,255,0.55)"}`,
          boxShadow: locked > 0 ? `0 0 ${24 * locked}px rgba(95, 214, 160, ${0.45 * locked})` : "none",
        }}
      />
      {locked < 1 ? (
        <div
          style={{
            position: "absolute",
            left: 52,
            right: 52,
            top: 136 + scan * 112,
            height: 2,
            background: C.brand,
            boxShadow: `0 0 12px 2px ${C.brand}`,
            opacity: 1 - locked,
          }}
        />
      ) : null}
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: C.brand }}>{children}</div>;
}

function Ghost({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: 46,
        borderRadius: 12,
        border: "1px solid #ffffff1f",
        color: "#f2efe9",
        fontWeight: 600,
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

function ItemCard({ added }: { added: boolean }) {
  return (
    <div>
      <Eyebrow>{added ? "// added to your quote" : "// in your library"}</Eyebrow>
      <div style={{ marginTop: 10, fontFamily: FONT.display, fontWeight: 800, fontSize: 24, lineHeight: 1.1, textTransform: "uppercase", color: "#fff" }}>
        {SCREWS.name}
      </div>
      <div style={{ marginTop: 10, fontSize: 21, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
        ${SCREWS.price.toFixed(2)} / {SCREWS.unit}
      </div>
      <div style={{ marginTop: 4, fontFamily: FONT.mono, fontSize: 12, color: C.ink400 }}>
        Barcode <span style={{ color: C.ink200 }}>{DEMO_BARCODE}</span>
      </div>
    </div>
  );
}

/**
 * The scan sheet over the (dimmed) quote. `enter` slides it up; `t` is time
 * in seconds for the hand-held camera; `scan` 0–1 moves the reading line;
 * `locked` 0–1 is the moment the code is read.
 */
export function BarcodeSheet({
  enter,
  stage,
  top = BARCODE_SHEET_TOP[stage],
  t,
  scan = 0,
  locked = 0,
  press = 0,
  tap = null,
}: {
  enter: number;
  stage: BarcodeStage;
  /** The sheet's top edge (defaults to the step's own height). */
  top?: number;
  t: number;
  scan?: number;
  locked?: number;
  press?: number;
  tap?: { x: number; y: number; p: number } | null;
}) {
  let body: ReactNode;
  if (stage === "camera") {
    body = (
      <>
        <CameraView t={t} scan={scan} locked={locked} />
        <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.5, color: C.ink300 }}>
          Point the camera at the barcode. Hold still — it reads by itself.
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <Ghost>
            <Camera size={19} weight="bold" /> Take a photo of the barcode
          </Ghost>
          <Ghost>
            <Keyboard size={19} weight="bold" /> Type the number instead
          </Ghost>
        </div>
      </>
    );
  } else if (stage === "checking") {
    body = (
      <div style={{ height: 160, display: "grid", placeItems: "center", alignContent: "center", gap: 14, color: C.ink200 }}>
        <div style={{ transform: `rotate(${t * 360}deg)`, color: C.brand, display: "grid" }}>
          <CircleNotch size={40} weight="bold" />
        </div>
        <div style={{ fontSize: 15 }}>Checking your library…</div>
      </div>
    );
  } else {
    const added = stage === "added";
    body = (
      <>
        <ItemCard added={added} />
        {added ? (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 8,
              borderRadius: 10,
              border: "1px solid rgba(16, 185, 129, 0.4)",
              background: "rgba(16, 185, 129, 0.1)",
              padding: "12px 12px",
              fontSize: 14,
              lineHeight: 1.45,
              color: "#d1fae5",
            }}
          >
            <span style={{ color: "#34d399", display: "grid", flexShrink: 0 }}>
              <CheckCircle size={20} weight="fill" />
            </span>
            Added as 1 {SCREWS.unit}. Change the quantity on the quote, then save.
          </div>
        ) : null}
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {added ? (
            <>
              <PrimaryButton>
                <Camera size={19} weight="bold" /> Scan another
              </PrimaryButton>
              <Ghost>Done</Ghost>
            </>
          ) : (
            <>
              <PrimaryButton pressed={press}>Add to quote</PrimaryButton>
              <Ghost>
                <Camera size={19} weight="bold" /> Scan another
              </Ghost>
            </>
          )}
        </div>
      </>
    );
  }

  const slide = (1 - enter) * (844 - top);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, zIndex: 60, background: `rgba(0,0,0,${0.7 * enter})` }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: top + slide,
          bottom: -slide,
          zIndex: 61,
          borderRadius: "24px 24px 0 0",
          border: "1px solid #ffffff1a",
          borderBottom: "none",
          background: C.ink900,
          boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid #ffffff1a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT.display, fontWeight: 800, fontSize: 18, textTransform: "uppercase", color: "#fff" }}>
            <span style={{ color: C.brand, display: "grid" }}>
              <Barcode size={24} weight="bold" />
            </span>
            Scan barcode
          </div>
          <div style={{ width: 48, height: 48, borderRadius: 999, border: "1px solid #ffffff1a", display: "grid", placeItems: "center", color: C.ink300 }}>
            <X size={20} weight="bold" />
          </div>
        </div>
        <div style={{ padding: "16px 16px 0" }}>{body}</div>
      </div>
      {tap ? <Tap {...tap} /> : null}
    </>
  );
}
