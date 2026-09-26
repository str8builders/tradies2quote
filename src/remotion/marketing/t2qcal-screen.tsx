/**
 * T2QCALScreen: the phone's full screen for the job-site website's T2QCAL
 * stop. First the real T2QCAL, recorded at phone size by
 * scripts/record-t2qcal.mjs (the deck redrawn at 24 m², then "Use in
 * Tradies2Quote" filled in and "Create quote draft" tapped). Then what that
 * makes in Tradies2Quote, in the app's new look: a private draft for Sam
 * Taylor, "Deck subframe material estimate", with one material line from
 * the calculator (src/t2qcal/lib/quote-handoff.ts), and its working under
 * More tools → "How the numbers were worked out" (the app's T2QCALWorking).
 */
import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame } from "remotion";
import recording from "./media/t2qcal-deck.mp4";
import { EXAMPLE } from "../demo-script";
import { DECK, JobScreen, MoreToolsSheet } from "../screens/newlook/JobScreens";
import { Tap } from "../screens/ui";
import { eseg, seg } from "./anim";
import { SCREEN_H, SCREEN_W, Screen } from "./Phone";
import { Push } from "./Push";

const SCALE = 2;
export const T2QCAL_SCREEN = { width: SCREEN_W * SCALE, height: SCREEN_H * SCALE } as const;
/** The recording's length at 30 fps (ffprobe: 369 frames). */
const RECORDING_FRAMES = 369;
const PUSH_FRAMES = 18;
export const T2QCAL_SCREEN_FRAMES = RECORDING_FRAMES + PUSH_FRAMES + 120;

/** One line at $110.00 × 24 m², 0% markup, 15% GST. */
const DRAFT_TOTAL = EXAMPLE.materialsSubtotal * (1 + EXAMPLE.gstRate / 100);
/** The inputs the calculator recorded with the line (as T2QCALWorking lists them). */
const RECORDED = [
  ["Deck length", "6,000 mm"],
  ["Deck width", "4,000 mm"],
  ["Board width", "140 mm"],
  ["Board gap", "5 mm"],
  ["Joist max centres", "450 mm"],
  ["Bearer max centres", "1,800 mm"],
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
  const calculator = (
    <Screen scale={SCALE}>
      {/* The web app runs full screen below the status bar (installed to the Home Screen). */}
      <div style={{ position: "absolute", left: 0, top: 54, width: SCREEN_W, height: SCREEN_H - 54, overflow: "hidden", background: "#111" }}>
        <Sequence durationInFrames={RECORDING_FRAMES + PUSH_FRAMES} layout="none">
          <OffthreadVideo src={recording} muted style={{ width: SCREEN_W, height: SCREEN_H - 54, display: "block" }} />
        </Sequence>
      </div>
    </Screen>
  );
  const app = (
    <Screen scale={SCALE}>
      <JobScreen stage="draft" labour={null} materials={DECK} total={DRAFT_TOTAL} title="Deck subframe material estimate" scroll={scroll} />
      {moreTap > 0 && moreTap < 1 ? <Tap x={366} y={84} p={moreTap} /> : null}
      {sheet > 0 ? <MoreToolsSheet enter={sheet} rows={RECORDED} /> : null}
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
