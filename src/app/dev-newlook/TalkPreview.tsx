"use client";

import { TalkView } from "@/app/app/quotes/new/_v2/TalkScreen";
import { INITIAL_RECORDER_STATE } from "@/app/app/quotes/new/_v2/lib/recorder";

const noop = () => {};

/** The Talk screen in a fixed state, for looking at (local only). */
export function TalkPreview({ phase }: { phase: "idle" | "recording" }) {
  return (
    <TalkView
      state={{ ...INITIAL_RECORDER_STATE, phase, seconds: phase === "recording" ? 42 : 0, canPause: true, stream: null }}
      back={{ kind: "cancel" }}
      focusOnArrival={false}
      onMic={noop}
      onDone={noop}
      onStartAgain={noop}
      onTryAgain={noop}
      onTypeInstead={noop}
    />
  );
}
