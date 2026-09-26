/**
 * T2QCALScreen: the phone's full screen for the job-site website's T2QCAL
 * stop. First the real T2QCAL, recorded at phone size by
 * scripts/record-t2qcal.mjs (the deck redrawn at 24 m², then "Use in
 * Tradies2Quote" filled in and "Create quote draft" tapped). Then what that
 * makes in Tradies2Quote: a private draft for Sam Taylor with one material
 * line from the calculator (src/t2qcal/lib/quote-handoff.ts) and the
 * calculator's working attached (the app's T2QCALWorking).
 */
import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame } from "remotion";
import recording from "./media/t2qcal-deck.mp4";
import { EXAMPLE } from "../demo-script";
import { QuoteReviewScreen } from "../screens/QuoteReviewScreen";
import { C, FONT } from "./theme";
import { eseg, seg } from "./anim";
import { SCREEN_H, SCREEN_W, Screen } from "./Phone";
import { Push } from "./Push";
import { SECTIONS_SCROLL, deckingLine } from "./story";

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

function CalculationRecord() {
  return (
    <div style={{ marginTop: 14, borderRadius: 16, border: "1px solid #ffffff14", background: "#161717", padding: 14 }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: C.brand }}>
        T2QCAL calculation record
      </div>
      <div style={{ marginTop: 4, fontSize: 14, color: "#fff" }}>Deck subframe</div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {RECORDED.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: C.ink300 }}>{label}</span>
            <span style={{ fontFamily: FONT.mono, color: "#fff" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function T2QCALScreen() {
  const frame = useCurrentFrame();
  const toApp = seg(frame, RECORDING_FRAMES, RECORDING_FRAMES + PUSH_FRAMES);
  // In the app: the draft's total first, then down to the line (its "calculated"
  // badge flashes, as in the full tour), then on to the calculation record.
  const at = RECORDING_FRAMES + PUSH_FRAMES;
  const scroll = eseg(frame, at + 18, at + 42) * (SECTIONS_SCROLL - 40) + eseg(frame, at + 70, at + 94) * 330;
  const badge = seg(frame, at + 42, at + 66);
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
      <QuoteReviewScreen
        scroll={scroll}
        total={DRAFT_TOTAL}
        lineCount={1}
        decking={deckingLine({ badge: "calculated", flash: badge > 0 && badge < 1 ? Math.sin(badge * Math.PI) : 0 })}
        labour={null}
        after={<CalculationRecord />}
      />
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
