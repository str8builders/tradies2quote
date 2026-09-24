"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  browserRecorderDeps,
  createVoiceRecorder,
  mountRecorder,
  type RecorderSnapshot,
  type VoiceRecorder,
} from "./lib/recorder";

/**
 * The new-look recorder for one talk screen. Stops and keeps what was said
 * when the page is hidden (phone locked, app switched), and lets go of the
 * microphone and any upload when the screen goes away.
 */
export function useVoiceRecorder(
  onTranscript: (text: string) => void,
): { recorder: VoiceRecorder; state: RecorderSnapshot } {
  const [recorder] = useState(() => createVoiceRecorder(browserRecorderDeps()));
  const state = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, recorder.getSnapshot);

  useEffect(() => {
    recorder.setTranscriptHandler(onTranscript);
    return () => recorder.setTranscriptHandler(null);
  }, [recorder, onTranscript]);

  useEffect(() => mountRecorder(recorder, document, window), [recorder]);

  return { recorder, state };
}
