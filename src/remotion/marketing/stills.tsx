/**
 * Feature stills for the website (4:5, rendered at 960×1200): each shows the
 * recreated screen behind one feature, with the same example job.
 */
import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { EXAMPLE } from "../demo-script";
import { Phone } from "./Phone";
import { Backdrop } from "./stage";
import { FONT } from "./theme";
import { TOTAL_SCROLL } from "./story";
import { CaptureScreen } from "../screens/CaptureScreen";
import { QuoteReviewScreen } from "../screens/QuoteReviewScreen";
import { ClientQuoteScreen } from "../screens/ClientQuoteScreen";
import { InvoiceQuoteScreen } from "../screens/InvoiceScreens";
import { RequestPoster, RequestsScreen } from "../screens/RequestScreens";
import { PaperQuote, SupplierScanScreen } from "../screens/SupplierScanScreen";
import { Waveform } from "../screens/Waveform";

export const FEATURE_STILL = { width: 960, height: 1200 } as const;

export const FEATURES = ["voice", "supplier-scan", "qr-request", "client-accept", "numbers", "invoices"] as const;
export type Feature = (typeof FEATURES)[number];

export type FeatureStillProps = { feature: Feature };

function Centered({ children, finish = "graphite" }: { children: ReactNode; finish?: "graphite" | "silver" }) {
  return (
    <div style={{ position: "absolute", left: 190, top: 84 }}>
      <Phone width={580} finish={finish}>
        {children}
      </Phone>
    </div>
  );
}

function TranscriptBubble() {
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        bottom: 34,
        width: 560,
        borderRadius: 26,
        background: "rgba(14,16,16,0.94)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 30px 70px rgba(0,0,0,0.6)",
        padding: "22px 26px",
        fontFamily: FONT.display,
      }}
    >
      <div style={{ height: 44, width: 250 }}>
        <Waveform frame={40} speaking={1} />
      </div>
      <div style={{ marginTop: 12, fontSize: 25, lineHeight: 1.35, fontWeight: 600, letterSpacing: "-0.02em", color: "#f4f3ef" }}>
        &ldquo;New timber deck for Sam Taylor, <span style={{ color: "#FF5F15" }}>24 square metres</span> off the back of the house…&rdquo;
      </div>
    </div>
  );
}

export function FeatureStill({ feature }: FeatureStillProps) {
  const [deck, labour] = EXAMPLE.lines;
  let content: ReactNode;
  switch (feature) {
    case "voice":
      content = (
        <>
          <Centered>
            <CaptureScreen state="recording" frame={40} speaking={1} elapsed={38} />
          </Centered>
          <TranscriptBubble />
        </>
      );
      break;
    case "supplier-scan":
      content = (
        <>
          <div style={{ position: "absolute", left: 34, top: 250, transform: "rotate(-7deg)" }}>
            <PaperQuote width={430} scan={0.56} />
          </div>
          <div style={{ position: "absolute", left: 360, top: 96 }}>
            <Phone width={560}>
              <SupplierScanScreen />
            </Phone>
          </div>
        </>
      );
      break;
    case "qr-request":
      content = (
        <>
          <div style={{ position: "absolute", left: 30, top: 300, transform: "rotate(-6deg)" }}>
            <RequestPoster width={400} />
          </div>
          <div style={{ position: "absolute", left: 380, top: 96 }}>
            <Phone width={550}>
              <RequestsScreen />
            </Phone>
          </div>
        </>
      );
      break;
    case "client-accept":
      content = (
        <Centered finish="silver">
          <ClientQuoteScreen scroll={850} form={{ name: EXAMPLE.client, email: EXAMPLE.clientEmail, signature: 1, checked: true }} />
        </Centered>
      );
      break;
    case "numbers":
      content = (
        <Centered>
          <QuoteReviewScreen
            scroll={TOTAL_SCROLL}
            total={EXAMPLE.total}
            breakdown={{ open: 1, materials: EXAMPLE.materialsSubtotal, markup: 0, labour: EXAMPLE.labourSubtotal, subtotal: EXAMPLE.subtotal, gst: EXAMPLE.gst }}
            decking={{ enter: 1, quantity: deck.quantity, unitPrice: deck.unitPrice, badge: "library" }}
            labour={{ enter: 1, quantity: labour.quantity, unitPrice: labour.unitPrice }}
          />
        </Centered>
      );
      break;
    case "invoices":
      content = (
        <Centered>
          <InvoiceQuoteScreen stage="paid" />
        </Centered>
      );
      break;
  }
  return (
    <AbsoluteFill style={{ fontFamily: FONT.display }}>
      <Backdrop glowX="55%" glowY="45%" />
      {content}
    </AbsoluteFill>
  );
}
