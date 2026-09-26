/**
 * StepScreen: one step of the job (Talk, Draft, Check, Send, Invoice) as the
 * phone's own full screen, for the floating 3D phone on the job-site website.
 *
 * It plays the same chapter as the 30-second demo (story.tsx, pace "full",
 * the demo's 6-second beats), but as the bare 390 × 844 phone screen at 2×:
 * no phone body, captions or backdrop, so the 3D phone supplies the device.
 * The Send step's switch from the tradie's phone to the client's is the
 * demo's own page push.
 */
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { SCREEN_H, SCREEN_W, Screen } from "./Phone";
import { Push } from "./Push";
import { storyShot } from "./story";

export const STEP_IDS = ["talk", "draft", "check", "send", "invoice"] as const;
export type StepId = (typeof STEP_IDS)[number];
export type StepScreenProps = { step: StepId };

const SCALE = 2;
export const STEP_SCREEN = { width: SCREEN_W * SCALE, height: SCREEN_H * SCALE } as const;
/** A demo chapter is 6 s at 30 fps; the screen then holds on the result. */
const CHAPTER_FRAMES = 180;
export const STEP_SCREEN_FRAMES = CHAPTER_FRAMES + 24;

export function StepScreen({ step }: StepScreenProps) {
  const frame = useCurrentFrame();
  const p = Math.min(1, frame / (CHAPTER_FRAMES - 1));
  const shot = storyShot(step, { p, frame, pace: "full" });
  if (!shot) return null;
  const a = <Screen scale={SCALE}>{shot.a.screen}</Screen>;
  const screen = shot.b ? <Push p={shot.mix} from={a} to={<Screen scale={SCALE}>{shot.b.screen}</Screen>} /> : a;
  return (
    <AbsoluteFill style={{ background: "#0c0f0f" }}>
      <div style={{ position: "relative", width: STEP_SCREEN.width, height: STEP_SCREEN.height, overflow: "hidden" }}>
        {screen}
      </div>
    </AbsoluteFill>
  );
}
