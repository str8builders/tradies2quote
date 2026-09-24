// The new-look recorder, end to end in node: a fake microphone, a fake
// MediaRecorder that delivers its audio when told to, a hand-cranked clock
// and a transcription route that answers when the test decides.

import { describe, expect, it, vi } from "vitest";
import { MAX_RECORDING_SECONDS } from "../../_lib/quote-input";
import {
  MIC_UNSUPPORTED,
  NO_AUDIO,
  RECORDING_FAILED,
  RECORDING_UNSUPPORTED,
  TRANSCRIBE_HICCUP,
  TRANSCRIBE_OFFLINE,
} from "./copy";
import {
  INITIAL_RECORDER_STATE,
  TICK_MS,
  createVoiceRecorder,
  mountRecorder,
  recorderReducer,
  type MediaRecorderLike,
  type RecorderDeps,
  type RecorderEvent,
  type RecorderState,
} from "./recorder";
import type { TranscribeResult } from "./transcribe";

// ── Fakes ────────────────────────────────────────────────────────────────────

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

type FakeStream = MediaStream & { tracks: FakeTrack[] };

function fakeStream(): FakeStream {
  const tracks = [new FakeTrack()];
  return { tracks, getTracks: () => tracks } as unknown as FakeStream;
}

class FakeRecorder implements MediaRecorderLike {
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  calls: string[] = [];
  pause?: () => void = () => {
    this.state = "paused";
    this.calls.push("pause");
  };
  resume?: () => void = () => {
    this.state = "recording";
    this.calls.push("resume");
  };
  constructor(
    readonly stream: MediaStream,
    canPause: boolean,
    private readonly startThrows: boolean,
  ) {
    if (!canPause) {
      this.pause = undefined;
      this.resume = undefined;
    }
  }
  start() {
    if (this.startThrows) throw new Error("NotSupportedError");
    this.state = "recording";
    this.calls.push("start");
  }
  stop() {
    this.state = "inactive";
    this.calls.push("stop");
  }
  /** The browser hands over the audio and fires "stop" (asynchronously, in real life). */
  deliver(audio = "voice") {
    if (audio) this.ondataavailable?.({ data: new Blob([audio], { type: this.mimeType }) });
    this.onstop?.(new Event("stop"));
  }
}

interface PendingTranscription {
  blob: Blob;
  type: string;
  signal: AbortSignal;
  answer(result: TranscribeResult): Promise<void>;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup({
  canPause = true,
  getUserMedia,
  createThrows = false,
  startThrows = false,
  maxSeconds,
  transcribe,
}: {
  canPause?: boolean;
  getUserMedia?: RecorderDeps["getUserMedia"] | null;
  createThrows?: boolean;
  startThrows?: boolean;
  maxSeconds?: number;
  transcribe?: RecorderDeps["transcribe"];
} = {}) {
  let now = 1_000;
  const intervals = new Map<number, () => void>();
  let nextInterval = 1;
  const streams: FakeStream[] = [];
  const recorders: FakeRecorder[] = [];
  const sent: PendingTranscription[] = [];
  const deps: RecorderDeps = {
    getUserMedia:
      getUserMedia === null
        ? undefined
        : (getUserMedia ??
          (async () => {
            const stream = fakeStream();
            streams.push(stream);
            return stream;
          })),
    createRecorder(stream) {
      if (createThrows) throw new Error("NotSupportedError");
      const recorder = new FakeRecorder(stream, canPause, startThrows);
      recorders.push(recorder);
      return recorder;
    },
    transcribe:
      transcribe ??
      ((blob, type, signal) =>
        new Promise<TranscribeResult>((resolve) => {
        sent.push({
          blob,
          type,
          signal,
          answer: async (result) => {
            resolve(result);
            await flush();
          },
        });
      })),
    now: () => now,
    setInterval(callback) {
      const id = nextInterval++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id as number);
    },
    maxSeconds,
  };
  const transcripts: string[] = [];
  const recorder = createVoiceRecorder(deps, (text) => transcripts.push(text));
  const changes = vi.fn();
  recorder.subscribe(changes);
  return {
    recorder,
    streams,
    recorders,
    sent,
    transcripts,
    changes,
    intervals,
    state: () => recorder.getSnapshot(),
    /** Let time pass, firing the recorder's clock like the browser would. */
    advance(ms: number) {
      for (let passed = 0; passed < ms; passed += TICK_MS) {
        now += TICK_MS;
        for (const tick of Array.from(intervals.values())) tick();
      }
    },
  };
}

// ── The pure state machine ───────────────────────────────────────────────────

describe("recorderReducer", () => {
  const at = (phase: RecorderState["phase"], extra: Partial<RecorderState> = {}): RecorderState => ({
    ...INITIAL_RECORDER_STATE,
    phase,
    ...extra,
  });

  it("walks idle → starting → recording → transcribing → review", () => {
    let state = INITIAL_RECORDER_STATE;
    const events: RecorderEvent[] = [
      { type: "start" },
      { type: "started", canPause: true },
      { type: "tick", seconds: 3 },
      { type: "stop" },
      { type: "transcribed", text: "Deck 6 by 4" },
    ];
    const phases = events.map((event) => (state = recorderReducer(state, event)).phase);
    expect(phases).toEqual(["starting", "recording", "recording", "transcribing", "review"]);
    expect(state).toMatchObject({ seconds: 3, transcript: "Deck 6 by 4", canPause: true, error: null });
  });

  it("pauses and carries on only while recording, and only where pausing works", () => {
    expect(recorderReducer(at("recording", { canPause: true }), { type: "pause" }).phase).toBe("paused");
    expect(recorderReducer(at("recording", { canPause: false }), { type: "pause" }).phase).toBe("recording");
    expect(recorderReducer(at("paused", { canPause: true }), { type: "resume" }).phase).toBe("recording");
    expect(recorderReducer(at("paused", { canPause: true }), { type: "stop" }).phase).toBe("transcribing");
    // The clock doesn't move while paused.
    const paused = at("paused", { seconds: 4 });
    expect(recorderReducer(paused, { type: "tick", seconds: 9 })).toBe(paused);
  });

  it("fails into a plain error, keeping the recording only when asked", () => {
    const failed = recorderReducer(at("transcribing"), { type: "failed", error: "No signal", canResend: true });
    expect(failed).toMatchObject({ phase: "error", error: "No signal", canResend: true });
    expect(recorderReducer(failed, { type: "resend" })).toMatchObject({ phase: "transcribing", error: null });
    const lost = recorderReducer(at("starting"), { type: "failed", error: "Blocked" });
    expect(lost.canResend).toBe(false);
    expect(recorderReducer(lost, { type: "resend" })).toBe(lost);
    expect(recorderReducer(lost, { type: "start" }).phase).toBe("starting");
  });

  it("ignores events that don't fit the phase", () => {
    const idle = INITIAL_RECORDER_STATE;
    for (const event of [
      { type: "started", canPause: true },
      { type: "tick", seconds: 5 },
      { type: "pause" },
      { type: "resume" },
      { type: "stop" },
      { type: "transcribed", text: "x" },
      { type: "failed", error: "x" },
      { type: "resend" },
    ] as RecorderEvent[]) {
      expect(recorderReducer(idle, event)).toBe(idle);
    }
    const recording = at("recording", { seconds: 5 });
    expect(recorderReducer(recording, { type: "start" })).toBe(recording);
    expect(recorderReducer(recording, { type: "tick", seconds: 5 })).toBe(recording);
    expect(recorderReducer(recording, { type: "transcribed", text: "x" })).toBe(recording);
    expect(recorderReducer(recording, { type: "reset" })).toBe(INITIAL_RECORDER_STATE);
  });
});

// ── The driver ───────────────────────────────────────────────────────────────

describe("voice recorder", () => {
  it("records, stops, sends the audio and hands back the words (idle → recording → stopped → review)", async () => {
    const t = setup();
    expect(t.state().phase).toBe("idle");
    const opening = t.recorder.start();
    expect(t.state().phase).toBe("starting");
    await opening;
    expect(t.state()).toMatchObject({ phase: "recording", seconds: 0, canPause: true });
    expect(t.state().stream).toBe(t.streams[0]);

    t.advance(2_100);
    expect(t.state().seconds).toBe(2);

    t.recorder.finish();
    expect(t.state().phase).toBe("transcribing");
    expect(t.recorders[0].calls).toEqual(["start", "stop"]);
    expect(t.intervals.size).toBe(0);

    t.recorders[0].deliver("deck six by four");
    expect(t.streams[0].tracks[0].stopped).toBe(true);
    expect(t.state().stream).toBeNull();
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].type).toBe("audio/webm;codecs=opus");
    expect(await t.sent[0].blob.text()).toBe("deck six by four");

    await t.sent[0].answer({ ok: true, transcript: "Deck six by four" });
    expect(t.state()).toMatchObject({ phase: "review", transcript: "Deck six by four", error: null });
    expect(t.transcripts).toEqual(["Deck six by four"]);
  });

  it("tells subscribers only when something they can see changed", async () => {
    const t = setup();
    await t.recorder.start();
    const before = t.state();
    const calls = t.changes.mock.calls.length;
    t.advance(TICK_MS); // still 0 seconds
    expect(t.state()).toBe(before);
    expect(t.changes.mock.calls.length).toBe(calls);
    t.advance(1_000);
    expect(t.state()).not.toBe(before);
    expect(t.changes.mock.calls.length).toBe(calls + 1);
  });

  it("pauses: the clock stops, the microphone stays open, and it carries on", async () => {
    const t = setup();
    await t.recorder.start();
    t.advance(3_000);
    t.recorder.togglePause();
    expect(t.state().phase).toBe("paused");
    expect(t.state().stream).toBe(t.streams[0]);
    expect(t.intervals.size).toBe(0);
    t.advance(10_000);
    expect(t.state().seconds).toBe(3);
    t.recorder.togglePause();
    expect(t.state().phase).toBe("recording");
    t.advance(2_000);
    expect(t.state().seconds).toBe(5);
    expect(t.recorders[0].calls).toEqual(["start", "pause", "resume"]);
  });

  it("where the browser can't pause, the mic button stops instead", async () => {
    const t = setup({ canPause: false });
    await t.recorder.start();
    expect(t.state().canPause).toBe(false);
    t.recorder.togglePause();
    expect(t.state().phase).toBe("transcribing");
    expect(t.recorders[0].calls).toEqual(["start", "stop"]);
  });

  it("stops by itself at the three-minute limit and keeps what was said", async () => {
    expect(MAX_RECORDING_SECONDS).toBe(180);
    const t = setup();
    await t.recorder.start();
    t.advance(179_000);
    expect(t.state().phase).toBe("recording");
    t.advance(1_000);
    expect(t.state()).toMatchObject({ phase: "transcribing", seconds: 180 });
    t.recorders[0].deliver();
    expect(t.sent).toHaveLength(1);
  });

  it("a stop nobody asked for (a call takes the microphone) still writes down what was said", async () => {
    const t = setup();
    await t.recorder.start();
    t.advance(4_000);
    t.recorders[0].deliver("half the job");
    expect(t.state().phase).toBe("transcribing");
    expect(t.intervals.size).toBe(0);
    await t.sent[0].answer({ ok: true, transcript: "Half the job" });
    expect(t.state().phase).toBe("review");
  });

  it("Start again throws the take away and listens again", async () => {
    const t = setup();
    await t.recorder.start();
    t.advance(5_000);
    await t.recorder.restart();
    expect(t.recorders[0].calls).toEqual(["start", "stop"]);
    expect(t.streams[0].tracks[0].stopped).toBe(true);
    t.recorders[0].deliver("the old take");
    expect(t.sent).toHaveLength(0);
    expect(t.state()).toMatchObject({ phase: "recording", seconds: 0 });
    expect(t.state().stream).toBe(t.streams[1]);
  });

  it("keeps a recording that failed to send, and Try again sends the same audio", async () => {
    const t = setup();
    await t.recorder.start();
    t.recorder.finish();
    t.recorders[0].deliver("fence 20 m");
    await t.sent[0].answer({ ok: false, error: TRANSCRIBE_OFFLINE, retryable: true });
    expect(t.state()).toMatchObject({ phase: "error", error: TRANSCRIBE_OFFLINE, canResend: true });

    t.recorder.resend();
    expect(t.state().phase).toBe("transcribing");
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1].blob).toBe(t.sent[0].blob);
    await t.sent[1].answer({ ok: true, transcript: "Fence 20 m" });
    expect(t.state()).toMatchObject({ phase: "review", transcript: "Fence 20 m" });
  });

  it("drops a recording that can't be sent again, and the mic starts over", async () => {
    const t = setup();
    await t.recorder.start();
    t.recorder.finish();
    t.recorders[0].deliver();
    await t.sent[0].answer({ ok: false, error: "Your free trial has ended.", retryable: false });
    expect(t.state()).toMatchObject({ phase: "error", canResend: false });
    t.recorder.resend();
    expect(t.sent).toHaveLength(1);
    await t.recorder.start();
    expect(t.state().phase).toBe("recording");
  });

  it("a transcriber that throws counts as a hiccup worth re-sending", async () => {
    const t = setup({
      transcribe: async () => {
        throw new Error("boom");
      },
    });
    await t.recorder.start();
    t.recorder.finish();
    t.recorders[0].deliver();
    await flush();
    expect(t.state()).toMatchObject({ phase: "error", error: TRANSCRIBE_HICCUP, canResend: true });
  });

  it("says so when nothing was recorded, without calling the route", async () => {
    const t = setup();
    await t.recorder.start();
    t.recorder.finish();
    t.recorders[0].deliver("");
    await flush();
    expect(t.sent).toHaveLength(0);
    expect(t.state()).toMatchObject({ phase: "error", error: NO_AUDIO, canResend: false });
  });

  it("explains a blocked microphone and never builds a recorder", async () => {
    const t = setup({
      getUserMedia: async () => {
        throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      },
    });
    await t.recorder.start();
    expect(t.state().phase).toBe("error");
    expect(t.state().error).toMatch(/blocked/);
    expect(t.recorders).toHaveLength(0);
  });

  it("explains a browser with no microphone API or no usable recorder", async () => {
    const none = setup({ getUserMedia: null });
    await none.recorder.start();
    expect(none.state()).toMatchObject({ phase: "error", error: MIC_UNSUPPORTED });

    const noFormat = setup({ createThrows: true });
    await noFormat.recorder.start();
    expect(noFormat.state()).toMatchObject({ phase: "error", error: RECORDING_UNSUPPORTED });
    expect(noFormat.streams[0].tracks[0].stopped).toBe(true);

    const noStart = setup({ startThrows: true });
    await noStart.recorder.start();
    expect(noStart.state()).toMatchObject({ phase: "error", error: RECORDING_FAILED });
    expect(noStart.streams[0].tracks[0].stopped).toBe(true);
  });

  it("ignores a second tap while the microphone is opening", async () => {
    const t = setup();
    const first = t.recorder.start();
    const second = t.recorder.start();
    await Promise.all([first, second]);
    expect(t.streams).toHaveLength(1);
    expect(t.recorders).toHaveLength(1);
  });
});

describe("stop on hide, let go on unmount", () => {
  function fakePage() {
    const docListeners = new Set<() => void>();
    const winListeners = new Set<() => void>();
    const doc = {
      visibilityState: "visible",
      addEventListener: (_type: "visibilitychange", listener: () => void) => docListeners.add(listener),
      removeEventListener: (_type: "visibilitychange", listener: () => void) => docListeners.delete(listener),
    };
    const win = {
      addEventListener: (_type: "pagehide", listener: () => void) => winListeners.add(listener),
      removeEventListener: (_type: "pagehide", listener: () => void) => winListeners.delete(listener),
    };
    return {
      doc,
      win,
      docListeners,
      winListeners,
      hide() {
        doc.visibilityState = "hidden";
        for (const listener of Array.from(docListeners)) listener();
      },
      show() {
        doc.visibilityState = "visible";
        for (const listener of Array.from(docListeners)) listener();
      },
      leave() {
        for (const listener of Array.from(winListeners)) listener();
      },
    };
  }

  it("hiding the page while recording stops it and writes down what was said", async () => {
    const t = setup();
    const page = fakePage();
    mountRecorder(t.recorder, page.doc, page.win);
    await t.recorder.start();
    t.advance(6_000);
    page.show();
    expect(t.state().phase).toBe("recording");
    page.hide();
    expect(t.state().phase).toBe("transcribing");
    expect(t.recorders[0].calls).toContain("stop");
    t.recorders[0].deliver();
    await t.sent[0].answer({ ok: true, transcript: "Kept it" });
    expect(t.state().phase).toBe("review");
  });

  it("a paused recording stops too, and leaving the page (pagehide) does the same", async () => {
    const t = setup();
    const page = fakePage();
    mountRecorder(t.recorder, page.doc, page.win);
    await t.recorder.start();
    t.recorder.togglePause();
    page.leave();
    expect(t.state().phase).toBe("transcribing");
  });

  it("hiding the page when not recording changes nothing", async () => {
    const t = setup();
    const page = fakePage();
    mountRecorder(t.recorder, page.doc, page.win);
    page.hide();
    expect(t.state().phase).toBe("idle");
  });

  it("unmounting while recording lets go of the microphone and sends nothing", async () => {
    const t = setup();
    const page = fakePage();
    const unmount = mountRecorder(t.recorder, page.doc, page.win);
    await t.recorder.start();
    t.advance(3_000);
    unmount();
    expect(page.docListeners.size).toBe(0);
    expect(page.winListeners.size).toBe(0);
    expect(t.recorders[0].calls).toEqual(["start", "stop"]);
    expect(t.streams[0].tracks[0].stopped).toBe(true);
    expect(t.intervals.size).toBe(0);
    t.recorders[0].deliver("too late");
    expect(t.sent).toHaveLength(0);
    expect(t.state().phase).toBe("idle");
  });

  it("unmounting while sending cancels the send and ignores its answer", async () => {
    const t = setup();
    const page = fakePage();
    const unmount = mountRecorder(t.recorder, page.doc, page.win);
    await t.recorder.start();
    t.recorder.finish();
    t.recorders[0].deliver();
    unmount();
    expect(t.sent[0].signal.aborted).toBe(true);
    await t.sent[0].answer({ ok: true, transcript: "Too late" });
    expect(t.transcripts).toEqual([]);
    expect(t.state().phase).toBe("idle");
  });

  it("unmounting while the microphone is still opening closes it as soon as it opens", async () => {
    let open!: (stream: MediaStream) => void;
    const stream = fakeStream();
    const t = setup({ getUserMedia: () => new Promise<MediaStream>((resolve) => (open = resolve)) });
    const page = fakePage();
    const unmount = mountRecorder(t.recorder, page.doc, page.win);
    const opening = t.recorder.start();
    unmount();
    open(stream);
    await opening;
    expect(stream.tracks[0].stopped).toBe(true);
    expect(t.recorders).toHaveLength(0);
    expect(t.state().phase).toBe("idle");
  });

  it("mounting again (React's strict-mode double mount) leaves a working recorder", async () => {
    const t = setup();
    const page = fakePage();
    mountRecorder(t.recorder, page.doc, page.win)();
    mountRecorder(t.recorder, page.doc, page.win);
    await t.recorder.start();
    expect(t.state().phase).toBe("recording");
    t.recorder.finish();
    t.recorders[0].deliver();
    await t.sent[0].answer({ ok: true, transcript: "Works" });
    expect(t.transcripts).toEqual(["Works"]);
  });

  it("Reset throws everything away, including a send in flight", async () => {
    const t = setup();
    await t.recorder.start();
    t.recorder.finish();
    t.recorders[0].deliver();
    t.recorder.reset();
    expect(t.sent[0].signal.aborted).toBe(true);
    await t.sent[0].answer({ ok: false, error: TRANSCRIBE_HICCUP, retryable: true });
    expect(t.state()).toMatchObject({ phase: "idle", error: null, canResend: false });
  });
});
