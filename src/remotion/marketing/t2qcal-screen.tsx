/**
 * T2QCALScreen: the phone's full screen for the job-site website's T2QCAL
 * stop. First the native T2QCAL app (the iPhone app Tradies2Quote opens),
 * recorded in the iOS Simulator on 27 Sep 2026 and cut to 442 frames
 * (media/t2qcal-native.mp4, 780 × 1580, status bar cropped; the Screen draws
 * its own): the home screen, search "deck", Deck board layout drawing the
 * 6,000 × 4,000 deck, the results (28 boards, 184.8 m to order, 24 m²), then
 * Send to a quote tapped. The recording isn't signed in, so the row says to
 * sign in; the clip cuts on the tap, before the sign-in sheet.
 *
 * Then what that send makes in Tradies2Quote, in the app's new look: a draft
 * titled after the calculator with one material line, "Decking lineal length
 * to order" (the tool's hand-off, ToolsDeck.swift), priced from the tradie's
 * list at $8.00/m, nobody picked as the client yet (job-view.ts: "Next: add
 * who the quote is for…"), and its working under More tools → "How the
 * numbers were worked out" (the app's T2QCALWorking, from the line's
 * calculator snapshot).
 */
import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame } from "remotion";
import recording from "./media/t2qcal-native.mp4";
import { EXAMPLE } from "../demo-script";
import { JobScreen, MoreToolsSheet, type LineView } from "../screens/newlook/JobScreens";
import { Tap } from "../screens/ui";
import { eseg, seg } from "./anim";
import { SCREEN_H, SCREEN_W, Screen } from "./Phone";
import { Push } from "./Push";

const SCALE = 2;
export const T2QCAL_SCREEN = { width: SCREEN_W * SCALE, height: SCREEN_H * SCALE } as const;
/** The recording's length at 30 fps (ffprobe: 442 frames). */
const RECORDING_FRAMES = 442;
const PUSH_FRAMES = 18;
export const T2QCAL_SCREEN_FRAMES = RECORDING_FRAMES + PUSH_FRAMES + 120;
/** Send to a quote, where the recording taps it (the simulator's (200, 432) pt, on this screen). */
const SEND_ROW = { x: 195, y: 421 } as const;

/** What Deck board layout sends: its lineal order, priced from the tradie's list. */
const DECKING_ORDER: LineView = { description: "Decking lineal length to order", qty: 184.8, unit: "m", price: 8 };
/** $1,478.40 + 15% GST. */
const DRAFT_TOTAL = Math.round(DECKING_ORDER.qty * DECKING_ORDER.price * (1 + EXAMPLE.gstRate / 100) * 100) / 100;
/** The inputs the calculator recorded with the line (as T2QCALWorking lists them). */
const RECORDED = [
  ["Board run length", "6,000 mm"],
  ["Deck width", "4,000 mm"],
  ["Board width", "140 mm"],
  ["Gap", "5 mm"],
  ["Board thickness", "20 mm"],
  ["Waste allowance", "10 %"],
] as const;

export function T2QCALScreen() {
  const frame = useCurrentFrame();
  const toApp = seg(frame, RECORDING_FRAMES, RECORDING_FRAMES + PUSH_FRAMES);
  // In the app: the draft (its total and its one line), then More tools
  // (⋯, top right) opened on the calculation record.
  const at = RECORDING_FRAMES + PUSH_FRAMES;
  const scroll = eseg(frame, at + 16, at + 36) * 150;
  const moreTap = seg(frame, at + 44, at + 58);
  const sheet = eseg(frame, at + 58, at + 70);
  const sendTap = seg(frame, RECORDING_FRAMES - 14, RECORDING_FRAMES);
  const calculator = (
    <Screen scale={SCALE}>
      {/* The app below the status bar (the recording's own is cropped off). */}
      <div style={{ position: "absolute", left: 0, top: 54, width: SCREEN_W, height: SCREEN_H - 54, overflow: "hidden", background: "#111" }}>
        <Sequence durationInFrames={RECORDING_FRAMES + PUSH_FRAMES} layout="none">
          <OffthreadVideo src={recording} muted style={{ width: SCREEN_W, height: SCREEN_H - 54, display: "block" }} />
        </Sequence>
      </div>
      {sendTap > 0 && sendTap < 1 ? <Tap x={SEND_ROW.x} y={SEND_ROW.y} p={sendTap} /> : null}
    </Screen>
  );
  const app = (
    <Screen scale={SCALE}>
      <JobScreen stage="draft" labour={null} materials={DECKING_ORDER} total={DRAFT_TOTAL} title="Deck board layout" client={null} scroll={scroll} />
      {moreTap > 0 && moreTap < 1 ? <Tap x={366} y={84} p={moreTap} /> : null}
      {sheet > 0 ? <MoreToolsSheet enter={sheet} rows={RECORDED} line={DECKING_ORDER.description} tool="Deck board layout" /> : null}
    </Screen>
  );
  return (
    <AbsoluteFill style={{ background: "#0c0f0f" }}>
      <div style={{ position: "relative", width: T2QCAL_SCREEN.width, height: T2QCAL_SCREEN.height, overflow: "hidden" }}>
        <Push p={toApp} from={calculator} to={app} />
      </div>
    </AbsoluteFill>
  );
}
