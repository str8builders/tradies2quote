/**
 * The new-look voice recorder.
 *
 *   idle → starting → recording ⇄ paused → transcribing → review
 *                ↘         ↘          ↘          ↘
 *                                error  (Try again re-sends a kept recording)
 *
 * `recorderReducer` is the pure state machine. `createVoiceRecorder` drives
 * it with the same browser pieces the current flow uses (getUserMedia, a
 * MediaRecorder in the shared audio format, the 3-minute limit, the
 * transcription route), injected so the whole lifecycle runs in node tests.
 *
 * Differences from the current flow, all on the tradie's side of the
 * screen: recording can pause, "Start again" throws the take away and
 * listens again straight off, a recording that fails to send is kept so
 * "Try again" re-sends it without re-recording, and leaving the page
 * (locking the phone, switching apps) stops the recording and writes down
 * what was said so far instead of losing it.
 */

import { MAX_RECORDING_SECONDS, pickMimeType } from "../../_lib/quote-input";
import {
  MIC_UNSUPPORTED,
  NO_AUDIO,
  RECORDING_FAILED,
  RECORDING_UNSUPPORTED,
  TRANSCRIBE_HICCUP,
  micErrorMessage,
  type TalkPhase,
} from "./copy";
import { transcribeRecording, type TranscribeResult } from "./transcribe";

export type RecorderPhase = TalkPhase;

export interface RecorderState {
  phase: RecorderPhase;
  /** Whole seconds recorded, pauses not counted. */
  seconds: number;
  /** A plain-words problem while phase is "error". */
  error: string | null;
  /** The last recording is kept, so "Try again" can send it again. */
  canResend: boolean;
  /** This browser's recorder can pause. */
  canPause: boolean;
  /** What was said, once phase is "review". */
  transcript: string;
}

export const INITIAL_RECORDER_STATE: RecorderState = Object.freeze({
  phase: "idle",
  seconds: 0,
  error: null,
  canResend: false,
  canPause: false,
  transcript: "",
});

export type RecorderEvent =
  | { type: "start" }
  | { type: "started"; canPause: boolean }
  | { type: "tick"; seconds: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "transcribed"; text: string }
  | { type: "failed"; error: string; canResend?: boolean }
  | { type: "resend" }
  | { type: "reset" };

const CAN_START: ReadonlySet<RecorderPhase> = new Set(["idle", "error", "review"]);
const CAN_FAIL: ReadonlySet<RecorderPhase> = new Set(["starting", "recording", "paused", "transcribing"]);

/** The state machine. An event that doesn't fit the current phase changes nothing. */
export function recorderReducer(state: RecorderState, event: RecorderEvent): RecorderState {
  switch (event.type) {
    case "start":
      return CAN_START.has(state.phase) ? { ...INITIAL_RECORDER_STATE, phase: "starting" } : state;
    case "started":
      return state.phase === "starting"
        ? { ...state, phase: "recording", seconds: 0, canPause: event.canPause }
        : state;
    case "tick":
      return state.phase === "recording" && event.seconds > state.seconds
        ? { ...state, seconds: event.seconds }
        : state;
    case "pause":
      return state.phase === "recording" && state.canPause ? { ...state, phase: "paused" } : state;
    case "resume":
      return state.phase === "paused" ? { ...state, phase: "recording" } : state;
    case "stop":
      return state.phase === "recording" || state.phase === "paused"
        ? { ...state, phase: "transcribing" }
        : state;
    case "transcribed":
      return state.phase === "transcribing"
        ? { ...state, phase: "review", transcript: event.text, error: null, canResend: false }
        : state;
    case "failed":
      return CAN_FAIL.has(state.phase)
        ? { ...state, phase: "error", error: event.error, canResend: Boolean(event.canResend) }
        : state;
    case "resend":
      return state.phase === "error" && state.canResend
        ? { ...state, phase: "transcribing", error: null }
        : state;
    case "reset":
      return INITIAL_RECORDER_STATE;
  }
}

// ── The driver ───────────────────────────────────────────────────────────────

/** The parts of MediaRecorder the driver uses. */
export interface MediaRecorderLike {
  readonly state: "inactive" | "recording" | "paused";
  readonly mimeType: string;
  start(): void;
  stop(): void;
  pause?(): void;
  resume?(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: ((event: Event) => void) | null;
}

export interface RecorderDeps {
  /** Undefined when the browser has no microphone API at all. */
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | undefined;
  /** Throws when the browser can't record in any format. */
  createRecorder(stream: MediaStream): MediaRecorderLike;
  transcribe(blob: Blob, type: string, signal: AbortSignal): Promise<TranscribeResult>;
  now(): number;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  maxSeconds?: number;
}

export interface RecorderSnapshot extends RecorderState {
  /** The open microphone while recording or paused (for the level bars). */
  stream: MediaStream | null;
}

export interface VoiceRecorder {
  getSnapshot(): RecorderSnapshot;
  subscribe(listener: () => void): () => void;
  /** Open the microphone and start listening. */
  start(): Promise<void>;
  /** Pause or carry on; stops instead where the browser can't pause. */
  togglePause(): void;
  /** Done: stop and write down what was said. */
  finish(): void;
  /** Throw this take away and listen again. */
  restart(): Promise<void>;
  /** Send the kept recording again after a failed send. */
  resend(): void;
  /** Throw everything away and go back to the start. */
  reset(): void;
  /** The page was hidden (phone locked, app switched): stop and keep what was said. */
  pageHidden(): void;
  /** Mounted. */
  attach(): void;
  /** Unmounted: release the microphone, cancel any send, ignore late results. */
  detach(): void;
  /** Who gets the words once they're written down. */
  setTranscriptHandler(handler: ((text: string) => void) | null): void;
}

/** How often the clock is checked; the seconds shown only change once a second. */
export const TICK_MS = 250;

function stopTracks(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) {
    try {
      track.stop();
    } catch {
      /* Already stopped. */
    }
  }
}

export function createVoiceRecorder(
  deps: RecorderDeps,
  onTranscript: ((text: string) => void) | null = null,
): VoiceRecorder {
  const maxSeconds = deps.maxSeconds ?? MAX_RECORDING_SECONDS;
  let transcriptHandler = onTranscript;
  const listeners = new Set<() => void>();
  let state: RecorderState = INITIAL_RECORDER_STATE;
  let stream: MediaStream | null = null;
  let snapshot: RecorderSnapshot = { ...state, stream };

  /** Bumped whenever a take is thrown away, so its late callbacks are ignored. */
  let session = 0;
  let attached = true;
  let recorder: MediaRecorderLike | null = null;
  let chunks: Blob[] = [];
  let ticker: unknown = null;
  let activeMs = 0;
  let resumedAt: number | null = null;
  let upload: AbortController | null = null;
  let kept: { blob: Blob; type: string } | null = null;

  /** The state the current snapshot was made from. */
  let published: RecorderState = state;

  /** A new snapshot (and a re-render) only when the state or the stream really changed. */
  function publish() {
    if (published === state && snapshot.stream === stream) return;
    published = state;
    snapshot = { ...state, stream };
    for (const listener of Array.from(listeners)) listener();
  }

  function dispatch(event: RecorderEvent) {
    state = recorderReducer(state, event);
    publish();
  }

  // ── Clock (pauses don't count) ──
  function elapsedMs(): number {
    return activeMs + (resumedAt === null ? 0 : deps.now() - resumedAt);
  }
  function startClock() {
    resumedAt = deps.now();
    ticker = deps.setInterval(onTick, TICK_MS);
  }
  function stopClock() {
    if (ticker !== null) deps.clearInterval(ticker);
    ticker = null;
    if (resumedAt !== null) activeMs += deps.now() - resumedAt;
    resumedAt = null;
  }
  function onTick() {
    const seconds = Math.min(maxSeconds, Math.floor(elapsedMs() / 1000));
    dispatch({ type: "tick", seconds });
    if (seconds >= maxSeconds) finish();
  }

  /** Let go of the recorder and the microphone without sending anything. */
  function release() {
    stopClock();
    activeMs = 0;
    const r = recorder;
    recorder = null;
    if (r) {
      r.ondataavailable = null;
      r.onstop = null;
      if (r.state !== "inactive") {
        try {
          r.stop();
        } catch {
          /* Already stopping. */
        }
      }
    }
    stopTracks(stream);
    stream = null;
    chunks = [];
  }

  function abortUpload() {
    upload?.abort();
    upload = null;
  }

  async function send(audio: { blob: Blob; type: string }, take: number) {
    if (audio.blob.size === 0) {
      kept = null;
      dispatch({ type: "failed", error: NO_AUDIO });
      return;
    }
    kept = audio;
    const controller = new AbortController();
    upload = controller;
    let result: TranscribeResult;
    try {
      result = await deps.transcribe(audio.blob, audio.type, controller.signal);
    } catch {
      result = { ok: false, error: TRANSCRIBE_HICCUP, retryable: true };
    }
    if (upload === controller) upload = null;
    if (take !== session || !attached) return;
    if (result.ok) {
      kept = null;
      dispatch({ type: "transcribed", text: result.transcript });
      transcriptHandler?.(result.transcript);
      return;
    }
    if (result.aborted) return;
    if (!result.retryable) kept = null;
    dispatch({ type: "failed", error: result.error, canResend: result.retryable && kept !== null });
  }

  function onRecorderStop(take: number, r: MediaRecorderLike) {
    if (take !== session || !attached) return;
    stopClock();
    const type = r.mimeType || "audio/webm";
    const blob = new Blob(chunks, { type });
    chunks = [];
    recorder = null;
    stopTracks(stream);
    stream = null;
    // Also covers a stop nobody asked for (a call took the microphone):
    // what was said so far still gets written down.
    dispatch({ type: "stop" });
    void send({ blob, type }, take);
  }

  async function start() {
    if (!CAN_START.has(state.phase)) return;
    abortUpload();
    release();
    kept = null;
    const take = ++session;
    dispatch({ type: "start" });
    if (!deps.getUserMedia) {
      dispatch({ type: "failed", error: MIC_UNSUPPORTED });
      return;
    }
    let opened: MediaStream;
    try {
      opened = await deps.getUserMedia({ audio: true });
    } catch (error) {
      if (take !== session || !attached) return;
      dispatch({ type: "failed", error: micErrorMessage(error) });
      return;
    }
    if (take !== session || !attached) {
      stopTracks(opened);
      return;
    }
    let r: MediaRecorderLike;
    try {
      r = deps.createRecorder(opened);
    } catch {
      stopTracks(opened);
      dispatch({ type: "failed", error: RECORDING_UNSUPPORTED });
      return;
    }
    stream = opened;
    recorder = r;
    chunks = [];
    r.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    r.onstop = () => onRecorderStop(take, r);
    try {
      r.start();
    } catch {
      release();
      dispatch({ type: "failed", error: RECORDING_FAILED });
      return;
    }
    activeMs = 0;
    dispatch({
      type: "started",
      canPause: typeof r.pause === "function" && typeof r.resume === "function",
    });
    startClock();
  }

  function finish() {
    if (state.phase !== "recording" && state.phase !== "paused") return;
    stopClock();
    const r = recorder;
    dispatch({ type: "stop" });
    if (!r || r.state === "inactive") return;
    try {
      r.stop();
    } catch {
      release();
      dispatch({ type: "failed", error: RECORDING_FAILED });
    }
  }

  function togglePause() {
    const r = recorder;
    if (state.phase === "recording") {
      if (!state.canPause || !r?.pause) {
        finish();
        return;
      }
      try {
        r.pause();
      } catch {
        finish();
        return;
      }
      stopClock();
      dispatch({ type: "pause" });
    } else if (state.phase === "paused") {
      try {
        r?.resume?.();
      } catch {
        finish();
        return;
      }
      dispatch({ type: "resume" });
      startClock();
    }
  }

  async function restart() {
    if (state.phase !== "recording" && state.phase !== "paused") return;
    session += 1;
    release();
    dispatch({ type: "reset" });
    await start();
  }

  function resend() {
    if (state.phase !== "error" || !state.canResend || !kept) return;
    const take = ++session;
    dispatch({ type: "resend" });
    void send(kept, take);
  }

  function reset() {
    session += 1;
    abortUpload();
    release();
    kept = null;
    dispatch({ type: "reset" });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    togglePause,
    finish,
    restart,
    resend,
    reset,
    pageHidden() {
      if (state.phase === "recording" || state.phase === "paused") finish();
    },
    attach() {
      attached = true;
    },
    detach() {
      attached = false;
      reset();
    },
    setTranscriptHandler(handler) {
      transcriptHandler = handler;
    },
  };
}

// ── Mounting: stop on hide, let go on unmount ──────────────────────────────

export interface VisibilityDocument {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface PageHideWindow {
  addEventListener(type: "pagehide", listener: () => void): void;
  removeEventListener(type: "pagehide", listener: () => void): void;
}

/**
 * What the talk screen does on mount: while mounted, hiding the page
 * (locking the phone, switching apps, leaving) stops the recording and
 * writes down what was said. The returned cleanup is the unmount: stop
 * watching, let go of the microphone and cancel any send. Written against
 * tiny interfaces so it runs in node; the real document and window fit.
 */
export function mountRecorder(
  recorder: VoiceRecorder,
  doc: VisibilityDocument,
  win: PageHideWindow,
): () => void {
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") recorder.pageHidden();
  };
  const onPageHide = () => recorder.pageHidden();
  recorder.attach();
  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("pagehide", onPageHide);
  return () => {
    doc.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("pagehide", onPageHide);
    recorder.detach();
  };
}

/** The real browser pieces. Safe to call during server rendering (nothing runs until used). */
export function browserRecorderDeps(): RecorderDeps {
  const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  return {
    getUserMedia:
      media && typeof media.getUserMedia === "function"
        ? (constraints) => media.getUserMedia(constraints)
        : undefined,
    createRecorder(stream) {
      const mimeType = pickMimeType();
      return (mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)) as MediaRecorderLike;
    },
    transcribe: (blob, type, signal) => transcribeRecording(blob, type, signal),
    now: () => performance.now(),
    setInterval: (callback, ms) => window.setInterval(callback, ms),
    clearInterval: (handle) => window.clearInterval(handle as number),
  };
}
