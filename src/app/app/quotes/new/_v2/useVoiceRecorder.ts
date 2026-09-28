"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  browserRecorderDeps,
  createVoiceRecorder,
  mountRecorder,
  type RecorderSnapshot,
  type VoiceRecorder,
} from "./lib/recorder";
import { base64ToBlob, readRecording, recordingBackup, sessionStore } from "./lib/saved-job";

/**
 * The new-look recorder for one talk screen. Stops and keeps what was said
 * when the page is hidden (phone locked, app switched), and lets go of the
 * microphone and any upload when the screen goes away. A finished recording
 * that isn't written down yet is copied into this tab's storage, so if the
 * page is reloaded meanwhile it is written down again when the screen comes
 * back (lib/saved-job).
 */
export function useVoiceRecorder(
  onTranscript: (text: string) => void,
): { recorder: VoiceRecorder; state: RecorderSnapshot } {
  const [recorder] = useState(() =>
    createVoiceRecorder({
      ...browserRecorderDeps(),
      onKept: recordingBackup(sessionStore, () => Date.now()),
    }),
  );
  const state = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, recorder.getSnapshot);

  useEffect(() => {
    recorder.setTranscriptHandler(onTranscript);
    return () => recorder.setTranscriptHandler(null);
  }, [recorder, onTranscript]);

  useEffect(() => mountRecorder(recorder, document, window), [recorder]);

  // A recording kept through a reload: write it down now (after mounting).
  useEffect(() => {
    const saved = readRecording(sessionStore(), Date.now());
    const blob = saved ? base64ToBlob(saved.data, saved.type) : null;
    if (saved && blob) recorder.resumeKept({ blob, type: saved.type });
  }, [recorder]);

  return { recorder, state };
}
