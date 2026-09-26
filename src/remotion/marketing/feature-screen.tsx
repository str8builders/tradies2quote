/**
 * FeatureScreen: one feature of the app as the phone's own full screen, for
 * the floating 3D phone in the job-site website's "More in the app" tour
 * (the rooms use StepScreen the same way). Bare 390 × 844 screen at 2×, the
 * same example job as everything else:
 *
 *   barcode   the scan sheet over the quote: camera, library check, added
 *   supplier  photograph a supplier's quote, read it, check the lines
 *   request   the client's QR request form, then the tradie's requests
 *   video     the client's quote link playing the real quote video
 *   timesheet finish work on site, the day's hours, invoice the week
 */
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, type CalculateMetadataFunction } from "remotion";
import { EXAMPLE } from "../demo-script";
import { ADD_BUTTON_FROM_TOP, BARCODE_SHEET_TOP as TOP, BarcodeSheet, type BarcodeStage } from "../screens/BarcodeScreens";
import { QuoteReviewScreen } from "../screens/QuoteReviewScreen";
import { ClientVideoScreen } from "../screens/QuoteVideoScreen";
import { SupplierCaptureScreen, SupplierScanScreen } from "../screens/SupplierScanScreen";
import { FinishSheet, InvoiceWeekSheet, TimesheetPage } from "../screens/TimesheetScreens";
import { Tap as TapMark } from "../screens/ui";
import { eseg, seg } from "./anim";
import { SCREEN_H, SCREEN_W, Screen } from "./Phone";
import { Push } from "./Push";
import { SECTIONS_SCROLL, deckingLine, finalLabour, storyShot } from "./story";

export const FEATURE_IDS = ["barcode", "supplier", "request", "video", "timesheet"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];
export type FeatureScreenProps = { feature: FeatureId };

const SCALE = 2;
const FPS = 30;
export const FEATURE_SCREEN = { width: SCREEN_W * SCALE, height: SCREEN_H * SCALE } as const;

/** When the client taps play on the quote video (frames). */
const VIDEO_TAP = 36;
/** Frames each feature runs (30 fps); the video one plays the whole 15-second quote video. */
export const FEATURE_FRAMES: Record<FeatureId, number> = {
  barcode: 204,
  supplier: 204,
  request: 204,
  video: VIDEO_TAP + 450 + 18,
  timesheet: 255,
};
export const featureMetadata: CalculateMetadataFunction<FeatureScreenProps> = ({ props }) => ({
  durationInFrames: FEATURE_FRAMES[props.feature],
});

type Tap = { x: number; y: number; p: number } | null;
const tapAt = (p: number, a: number, b: number, x: number, y: number): Tap => (p > a && p < b ? { x, y, p: seg(p, a, b) } : null);
const pressAt = (p: number, a: number, b: number) => {
  const t = seg(p, a, b);
  return t > 0 && t < 1 ? Math.sin(Math.min(1, t / 0.6) * Math.PI) : 0;
};

function barcode(frame: number): ReactNode {
  const p = frame / (FEATURE_FRAMES.barcode - 1);
  const t = frame / FPS;
  let stage: BarcodeStage = "camera";
  if (p >= 0.5) stage = "checking";
  if (p >= 0.58) stage = "found";
  if (p >= 0.74) stage = "added";
  // The sheet settles to each step's height, as the real one resizes to its content.
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const top =
    p < 0.58
      ? lerp(TOP.camera, TOP.checking, eseg(p, 0.5, 0.53))
      : p < 0.74
        ? lerp(TOP.checking, TOP.found, eseg(p, 0.58, 0.61))
        : lerp(TOP.found, TOP.added, eseg(p, 0.74, 0.77));
  return (
    <>
      <QuoteReviewScreen scroll={SECTIONS_SCROLL} total={EXAMPLE.total} decking={deckingLine()} labour={finalLabour()} />
      <BarcodeSheet
        enter={eseg(p, 0, 0.08)}
        stage={stage}
        top={top}
        t={t}
        scan={(t * 1.15) % 1}
        locked={seg(p, 0.43, 0.49)}
        press={pressAt(p, 0.66, 0.74)}
        tap={tapAt(p, 0.66, 0.74, 195, TOP.found + ADD_BUTTON_FROM_TOP)}
      />
    </>
  );
}

function supplier(frame: number): ReactNode {
  const p = frame / (FEATURE_FRAMES.supplier - 1);
  const t = frame / FPS;
  const captureTap = tapAt(p, 0.1, 0.2, 195, 526) ?? tapAt(p, 0.26, 0.34, 195, 636);
  const checkTap = tapAt(p, 0.84, 0.92, 113, 711);
  const capture = (
    <Screen scale={SCALE}>
      <SupplierCaptureScreen t={t} photo={seg(p, 0.16, 0.22)} reading={p >= 0.32} press={pressAt(p, 0.26, 0.34)} />
      {captureTap ? <TapMark {...captureTap} /> : null}
    </Screen>
  );
  const check = (
    <Screen scale={SCALE}>
      <SupplierScanScreen shown={seg(p, 0.56, 0.74) * 3} press={pressAt(p, 0.84, 0.92)} />
      {checkTap ? <TapMark {...checkTap} /> : null}
    </Screen>
  );
  return <Push p={eseg(p, 0.48, 0.56)} from={capture} to={check} />;
}

function video(frame: number): ReactNode {
  const p = frame < VIDEO_TAP ? seg(frame, VIDEO_TAP - 18, VIDEO_TAP) : 0;
  return <ClientVideoScreen startAt={VIDEO_TAP} tap={p > 0 && p < 1 ? { x: 195, y: 458, p } : null} />;
}

function timesheet(frame: number): ReactNode {
  const p = frame / (FEATURE_FRAMES.timesheet - 1);
  const open = p < 0.56;
  // The shift ticks over its last few minutes while you watch.
  const minutes = 8 * 60 + 8 + Math.min(7, Math.floor(seg(p, 0, 0.14) * 7));
  const elapsed = `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
  const pageScroll = eseg(p, 0.58, 0.66) * 260;
  const finishSheet = Math.min(eseg(p, 0.22, 0.3), 1 - eseg(p, 0.54, 0.6));
  const tap =
    tapAt(p, 0.14, 0.22, 195, 285) ??
    tapAt(p, 0.42, 0.5, 195, 730) ??
    tapAt(p, 0.72, 0.78, 195, 336) ??
    tapAt(p, 0.93, 0.99, 195, 620);
  return (
    <>
      <TimesheetPage
        open={open}
        elapsed={elapsed}
        finishPress={pressAt(p, 0.14, 0.22)}
        invoicePress={pressAt(p, 0.72, 0.78)}
        scroll={pageScroll}
        flash={p > 0.6 && p < 0.72 ? Math.sin(seg(p, 0.6, 0.72) * Math.PI) : 0}
      />
      {finishSheet > 0 ? <FinishSheet enter={finishSheet} breakOn press={pressAt(p, 0.42, 0.5)} finishing={p >= 0.47} /> : null}
      {p >= 0.78 ? <InvoiceWeekSheet enter={eseg(p, 0.78, 0.84)} scroll={0} press={pressAt(p, 0.93, 0.99)} /> : null}
      {tap ? <TapMark {...tap} /> : null}
    </>
  );
}

export function FeatureScreen({ feature }: FeatureScreenProps) {
  const frame = useCurrentFrame();
  let screen: ReactNode;
  if (feature === "request") {
    // The request chapter from the full tour: the client's form, then the tradie's phone.
    const p = Math.min(1, frame / 179);
    const shot = storyShot("request", { p, frame, pace: "full" });
    if (!shot) return null;
    const a = <Screen scale={SCALE}>{shot.a.screen}</Screen>;
    screen = shot.b ? <Push p={shot.mix} from={a} to={<Screen scale={SCALE}>{shot.b.screen}</Screen>} /> : a;
  } else if (feature === "supplier") {
    screen = supplier(frame);
  } else {
    screen = <Screen scale={SCALE}>{feature === "barcode" ? barcode(frame) : feature === "timesheet" ? timesheet(frame) : video(frame)}</Screen>;
  }
  return (
    <AbsoluteFill style={{ background: "#0c0f0f" }}>
      <div style={{ position: "relative", width: FEATURE_SCREEN.width, height: FEATURE_SCREEN.height, overflow: "hidden" }}>{screen}</div>
    </AbsoluteFill>
  );
}
