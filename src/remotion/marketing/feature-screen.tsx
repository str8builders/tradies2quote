/**
 * FeatureScreen: one feature of the app as the phone's own full screen, for
 * the floating 3D phone in the job-site website's "More in the app" tour
 * (the rooms use StepScreen the same way). Bare 390 × 844 screen at 2×, the
 * same example job as everything else:
 *
 *   request   a client scans the QR sticker on the van, fills in the
 *             request form, then the tradie's requests and the draft
 *   supplier  photograph a supplier's quote, read it, check the lines
 *   timesheet finish work on site, the day's hours, invoice the week
 *
 * (The barcode and the quote video left the site on 27 Sep 2026: the owner
 * swapped the barcode for the van QR code and took the video out.)
 */
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, type CalculateMetadataFunction } from "remotion";
import { EXAMPLE } from "../demo-script";
import { SupplierCaptureScreen, SupplierScanScreen } from "../screens/SupplierScanScreen";
import { FinishSheet, InvoiceWeekSheet, TimesheetPage } from "../screens/TimesheetScreens";
import { Tap as TapMark } from "../screens/ui";
import { PushBanner } from "../screens/SystemUI";
import { VAN_SCAN_BEATS, VAN_SCAN_FRAMES, VanScanScreen } from "../screens/VanScanScreen";
import { JobScreen } from "../screens/newlook/JobScreens";
import { ClientRequestsScreen, PricesScreen } from "../screens/newlook/OtherScreens";
import { eseg, seg } from "./anim";
import { SCREEN_H, SCREEN_W, Screen } from "./Phone";
import { Push } from "./Push";
import { REQUEST_BEATS } from "./beats";
import { storyShot } from "./story";

export const FEATURE_IDS = ["request", "supplier", "timesheet"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];
export type FeatureScreenProps = { feature: FeatureId };

const SCALE = 2;
const FPS = 30;
export const FEATURE_SCREEN = { width: SCREEN_W * SCALE, height: SCREEN_H * SCALE } as const;

/** Frames of the request story after the van scan: the form, the requests, the draft. */
export const REQUEST_FRAMES = 204;
/** Frames each feature runs (30 fps). */
export const FEATURE_FRAMES: Record<FeatureId, number> = {
  request: VAN_SCAN_FRAMES + REQUEST_FRAMES,
  supplier: 204,
  timesheet: 255,
};
export const featureMetadata: CalculateMetadataFunction<FeatureScreenProps> = ({ props }) => ({
  durationInFrames: FEATURE_FRAMES[props.feature],
});

/**
 * How a scene's screens are framed. The website clips draw each screen as
 * its own 2× Screen; the narrated tour hands the raw 390 × 844 content to
 * its phone rig, which frames it (pass `raw`).
 */
export type Wrap = (content: ReactNode, opts?: { background?: string }) => ReactNode;
const twoX: Wrap = (content, opts) => (
  <Screen scale={SCALE} background={opts?.background}>
    {content}
  </Screen>
);
export const raw: Wrap = (content, opts) =>
  opts?.background ? <div style={{ position: "absolute", inset: 0, background: opts.background }}>{content}</div> : content;

type Tap = { x: number; y: number; p: number } | null;
const tapAt = (p: number, a: number, b: number, x: number, y: number): Tap => (p > a && p < b ? { x, y, p: seg(p, a, b) } : null);
const pressAt = (p: number, a: number, b: number) => {
  const t = seg(p, a, b);
  return t > 0 && t < 1 ? Math.sin(Math.min(1, t / 0.6) * Math.PI) : 0;
};

function supplier(frame: number, wrap: Wrap): ReactNode {
  const p = frame / (FEATURE_FRAMES.supplier - 1);
  const t = frame / FPS;
  const pricesTap = tapAt(p, 0.02, 0.08, 195, 324);
  const captureTap = tapAt(p, 0.16, 0.22, 195, 511) ?? tapAt(p, 0.28, 0.34, 195, 618);
  const checkTap = tapAt(p, 0.86, 0.93, 113, 711);
  const prices = wrap(
    <>
      <PricesScreen press={pressAt(p, 0.02, 0.08)} />
      {pricesTap ? <TapMark {...pricesTap} /> : null}
    </>,
  );
  const capture = wrap(
    <>
      <SupplierCaptureScreen shell="new" t={t} photo={seg(p, 0.22, 0.26)} reading={p >= 0.34} press={pressAt(p, 0.28, 0.34)} />
      {captureTap ? <TapMark {...captureTap} /> : null}
    </>,
  );
  const check = wrap(
    <>
      <SupplierScanScreen shell="new" shown={seg(p, 0.6, 0.76) * 3} press={pressAt(p, 0.86, 0.93)} />
      {checkTap ? <TapMark {...checkTap} /> : null}
    </>,
  );
  return p < 0.5 ? <Push p={eseg(p, 0.08, 0.14)} from={prices} to={capture} /> : <Push p={eseg(p, 0.5, 0.57)} from={capture} to={check} />;
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

/**
 * One feature's scene at `frame` (0 … FEATURE_FRAMES[feature] - 1). The
 * website clip frames it at 2× (the default); the narrated tour passes
 * `raw` and lets its phone rig frame it.
 */
export function featureScene(feature: FeatureId, frame: number, wrap: Wrap = twoX): ReactNode {
  if (feature === "request") {
    // The client scans the sticker on the van, fills in the request form
    // (the public page, unchanged), then the tradie's "Client requests" in
    // the new look, then the draft it made.
    const f = Math.max(0, frame - VAN_SCAN_FRAMES);
    const p = Math.min(1, f / (REQUEST_FRAMES - 25));
    const T = REQUEST_BEATS;
    const shot = storyShot("request", { p, frame: f, pace: "full" });
    if (!shot) return null;
    const form = wrap(shot.a.screen);
    const scan = wrap(<VanScanScreen frame={frame} />, { background: "#000" });
    const banner = Math.min(eseg(p, T.banner[0], T.banner[1]), 1 - eseg(p, T.banner[2], T.banner[3]));
    const openTap = tapAt(p, T.open[0], T.open[1], 195, 462);
    const requests = wrap(
      <>
        <ClientRequestsScreen arrive={eseg(p, T.arrive[0], T.arrive[1])} press={pressAt(p, T.open[0], T.open[1])}>
          <PushBanner title="New quote request" body={`${EXAMPLE.client}: new timber deck, about 24 m²`} enter={banner} />
        </ClientRequestsScreen>
        {openTap ? <TapMark {...openTap} /> : null}
      </>,
    );
    const draft = wrap(<JobScreen stage="draft" />);
    return frame < VAN_SCAN_FRAMES ? (
      <Push p={eseg(frame, VAN_SCAN_BEATS.push[0], VAN_SCAN_BEATS.push[1])} from={scan} to={form} />
    ) : p < T.open[1] ? (
      <Push p={eseg(p, T.swap[0], T.swap[1])} from={form} to={requests} />
    ) : (
      <Push p={eseg(p, T.open[1], 1)} from={requests} to={draft} />
    );
  }
  if (feature === "supplier") return supplier(frame, wrap);
  return wrap(timesheet(frame));
}

export function FeatureScreen({ feature }: FeatureScreenProps) {
  const frame = useCurrentFrame();
  const screen = featureScene(feature, frame);
  return (
    <AbsoluteFill style={{ background: "#0c0f0f" }}>
      <div style={{ position: "relative", width: FEATURE_SCREEN.width, height: FEATURE_SCREEN.height, overflow: "hidden" }}>{screen}</div>
    </AbsoluteFill>
  );
}
