"use client";

import { TalkScreen } from "@/app/app/quotes/new/_v2/TalkScreen";

const noop = () => {};

/** The real Talk screen with the real microphone and meter (local only). */
export function TalkLive() {
  return <TalkScreen back={{ kind: "cancel" }} focusOnArrival={false} onTranscript={noop} onTypeInstead={noop} />;
}
