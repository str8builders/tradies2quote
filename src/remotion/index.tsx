/**
 * Remotion entry: every composition the marketing render script and the app
 * use. Render with `npm run render:marketing` (see scripts/render-marketing.mjs).
 */
import { Composition, Still, registerRoot } from "remotion";
import { WelcomeScene, WELCOME_FPS, WELCOME_FRAMES } from "./WelcomeScene";
import { DEMO_TIMELINE, HERO_LOOP_FRAMES, SOCIAL_TIMELINE, TOUR_TIMELINE, VIDEO_FPS } from "./demo-script";
import { DemoTall, DemoWide, FullTour, HERO, HeroLoop, SocialCut, TALL, WIDE } from "./marketing/compositions";
import { FEATURE_STILL, FeatureStill } from "./marketing/stills";
import { QuoteVideo } from "./quote-video/QuoteVideo";
import { QUOTE_VIDEO_COMPOSITION } from "../lib/quote-video/constants";
import { sampleQuoteVideoProps } from "../lib/quote-video/sample";

function Root() {
  return (
    <>
      <Composition id="Tradies2QuoteWelcome" component={WelcomeScene} durationInFrames={WELCOME_FRAMES} fps={WELCOME_FPS} width={720} height={520} />
      <Composition id="DemoWide" component={DemoWide} durationInFrames={DEMO_TIMELINE.durationInFrames} fps={VIDEO_FPS} {...WIDE} defaultProps={{}} />
      <Composition id="DemoTall" component={DemoTall} durationInFrames={DEMO_TIMELINE.durationInFrames} fps={VIDEO_FPS} {...TALL} defaultProps={{}} />
      <Composition id="HeroLoop" component={HeroLoop} durationInFrames={HERO_LOOP_FRAMES} fps={VIDEO_FPS} {...HERO} defaultProps={{}} />
      <Composition id="SocialCut" component={SocialCut} durationInFrames={SOCIAL_TIMELINE.durationInFrames} fps={VIDEO_FPS} {...TALL} defaultProps={{}} />
      <Composition id="FullTour" component={FullTour} durationInFrames={TOUR_TIMELINE.durationInFrames} fps={VIDEO_FPS} {...WIDE} defaultProps={{}} />
      <Still id="FeatureStill" component={FeatureStill} {...FEATURE_STILL} defaultProps={{ feature: "voice" as const }} />
      {/* Quote video for a client (rendered by scripts/quote-video-worker.mjs with a real quote's props). */}
      <Composition
        id={QUOTE_VIDEO_COMPOSITION.id}
        component={QuoteVideo}
        durationInFrames={QUOTE_VIDEO_COMPOSITION.durationInFrames}
        fps={QUOTE_VIDEO_COMPOSITION.fps}
        width={QUOTE_VIDEO_COMPOSITION.width}
        height={QUOTE_VIDEO_COMPOSITION.height}
        defaultProps={sampleQuoteVideoProps()}
      />
    </>
  );
}

registerRoot(Root);
