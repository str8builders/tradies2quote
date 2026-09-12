import { Composition, registerRoot } from "remotion";
import { WelcomeScene, WELCOME_FPS, WELCOME_FRAMES } from "./WelcomeScene";
function Root() { return <Composition id="Tradies2QuoteWelcome" component={WelcomeScene} durationInFrames={WELCOME_FRAMES} fps={WELCOME_FPS} width={720} height={520} />; }
registerRoot(Root);
