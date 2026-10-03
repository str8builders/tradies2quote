import type { SceneId } from "../demo-script";
import { VAN_SCAN_FRAMES } from "../screens/VanScanScreen";
import { eseg } from "./anim";
import { REQUEST_BEATS } from "./beats";
import { FEATURE_FRAMES, REQUEST_FRAMES, featureScene, raw, type FeatureId } from "./feature-screen";
import { newLookShot } from "./newlook-story";
import { STEP_IDS, type StepId } from "./step-screen";
import { finalDevice, kf, storyShot, type DeviceShot, type ShotArgs, type StoryShot } from "./story";

/**
 * The homepage demo (DemoWide, DemoTall) in the app's new look.
 *
 * ./story draws the old look; ./newlook-story draws the same five steps in
 * the new look on the same 6-second beat (it already feeds the floating
 * phone in the 3D site's rooms). This turns a new-look step into the
 * StoryShot the demo's phone rig expects: which phone (the tradie's
 * graphite one, or the client's silver one for the quote link), which page
 * (a change between chapters animates as a push) and where the camera
 * looks on the screen (`focus`, in screen px, 0–844) so the tall cut keeps
 * the part being tapped in view.
 *
 * The tour's extra chapters (request, supplier, timesheet) play the same
 * new-look scenes as the website's "More in the app" stops
 * (feature-screen.tsx), stretched over the chapter. Chapters without a
 * new-look version (calculator, title cards) fall through to the old story.
 */

const isStep = (id: SceneId): id is StepId => (STEP_IDS as readonly string[]).includes(id);

/** The bottom bar's main button sits at y≈782: frame it and what's above. */
const BAR = 560;
/** The top of a page: its title and first rows. */
const TOP = 330;

type Pages = { a: string; b?: string };
const PAGES: Record<StepId, Pages> = {
  talk: { a: "nl-talk", b: "nl-review" },
  draft: { a: "nl-generating", b: "nl-job" },
  check: { a: "nl-job" },
  send: { a: "nl-job", b: "nl-client" },
  invoice: { a: "nl-job" },
};

/** Camera focus over each chapter (p 0–1), matched to newlook-story's beats. */
function focusOf(step: StepId, p: number): { a: number; b: number } {
  switch (step) {
    case "talk":
      // The mic and its Talk/Done button, then the top of "Did I hear you right?".
      return { a: 530, b: TOP };
    case "draft":
      // "Writing your quote…" centred, then the job page as it scrolls to the labour line.
      return { a: 422, b: kf(p, [[0, TOP], [0.66, TOP], [0.8, 400]]) };
    case "check":
      // The labour line, the sheet's fields and Save while it's up, then the line again.
      return { a: kf(p, [[0, 400], [0.14, 400], [0.22, BAR], [0.7, BAR], [0.8, 400]]), b: 400 };
    case "send":
      // "Send to Sam" and the send sheet, then the quote on Sam's phone.
      return { a: BAR, b: kf(p, [[0.46, 380], [0.7, 420], [1, 500]]) };
    case "invoice":
      return { a: BAR, b: BAR };
  }
}

const FEATURES: readonly FeatureId[] = ["request", "supplier", "timesheet"];
const isFeature = (id: SceneId): id is FeatureId => (FEATURES as readonly string[]).includes(id);

/** A feature scene's frame at chapter progress p. */
const featureFrame = (feature: FeatureId, p: number) => Math.round(Math.min(1, Math.max(0, p)) * (FEATURE_FRAMES[feature] - 1));

function featureShot(feature: FeatureId, p: number): StoryShot {
  const frame = featureFrame(feature, p);
  if (feature === "request") {
    // The client's phone while they scan the van and fill in the form, then
    // the tradie's as the request arrives (the scene's own push, as a swap of phones).
    const swapAt = VAN_SCAN_FRAMES + Math.round(REQUEST_BEATS.swap[0] * (REQUEST_FRAMES - 25));
    const swapEnd = VAN_SCAN_FRAMES + Math.round(REQUEST_BEATS.swap[1] * (REQUEST_FRAMES - 25));
    const scanning = frame < VAN_SCAN_FRAMES;
    return {
      a: { finish: "silver", page: "nl-request-client", screen: featureScene("request", Math.min(frame, swapAt - 1), raw), focus: scanning ? 422 : 500 },
      b: { finish: "graphite", page: "nl-requests", screen: featureScene("request", Math.max(frame, swapEnd), raw), focus: TOP },
      mix: eseg(frame, swapAt, swapEnd),
    };
  }
  if (feature === "supplier") {
    const q = frame / (FEATURE_FRAMES.supplier - 1);
    return { a: { finish: "graphite", page: "nl-prices", screen: featureScene("supplier", frame, raw), focus: kf(q, [[0, TOP], [0.14, TOP], [0.2, 520], [0.5, 520], [0.6, BAR]]) }, mix: 0 };
  }
  const q = frame / (FEATURE_FRAMES.timesheet - 1);
  return {
    a: { finish: "graphite", page: "nl-timesheet", screen: featureScene("timesheet", frame, raw), focus: kf(q, [[0, TOP], [0.2, TOP], [0.28, BAR], [0.56, BAR], [0.62, TOP], [0.76, TOP], [0.84, 520]]) },
    mix: 0,
  };
}

export function demoShot(id: SceneId, args: ShotArgs): StoryShot | null {
  if (isFeature(id)) return featureShot(id, args.p);
  if (!isStep(id)) return storyShot(id, args);
  const shot = newLookShot(id, { p: args.p, frame: args.frame });
  const pages = PAGES[id];
  const focus = focusOf(id, args.p);
  const a: DeviceShot = { finish: "graphite", page: pages.a, screen: shot.a, focus: focus.a };
  const b: DeviceShot | undefined =
    shot.b && pages.b
      ? { finish: id === "send" ? "silver" : "graphite", page: pages.b, screen: shot.b, focus: focus.b }
      : undefined;
  return { a, b, mix: b ? shot.mix : 0 };
}

/**
 * The device a chapter ends on. The old story overrides some end pages
 * (draft ends on "review"); the new-look pages above already say where
 * each chapter ends, so only old chapters take the override.
 */
export function demoFinalDevice(shot: StoryShot, id: SceneId): DeviceShot {
  if (!isStep(id) && !isFeature(id)) return finalDevice(shot, id);
  return shot.b && shot.mix >= 0.5 ? shot.b : shot.a;
}

/**
 * The wide cut's rig shows the phone larger than the frame and anchors the
 * focus lower (stage.tsx panFor), so the same focus leaves the new look's
 * bottom-bar buttons just off the frame. Looking 90 px lower keeps them in;
 * focuses near the top of the page still clamp to no pan, so they're unchanged.
 */
const WIDE_LOWER = 90;

export function demoShotWide(id: SceneId, args: ShotArgs): StoryShot | null {
  const shot = demoShot(id, args);
  if (!shot || (!isStep(id) && !isFeature(id))) return shot;
  const lower = (d: DeviceShot): DeviceShot => ({ ...d, focus: d.focus + WIDE_LOWER });
  return { ...shot, a: lower(shot.a), b: shot.b ? lower(shot.b) : undefined };
}
