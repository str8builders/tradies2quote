"use client";

import { VoiceWaveform } from "./VoiceWaveform";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createDraftQuote } from "../actions";
import type { Channel } from "../_v2/lib/channels";
import { keepWords, readWords, sessionStore } from "../_v2/lib/saved-job";
import { useVoiceRecorder } from "../_v2/useVoiceRecorder";
import type { RecorderPhase } from "../_v2/lib/recorder";
import type { Clarification } from "@/lib/clarifications";
import {
  ClarificationModal,
  type ClarificationAnswer,
} from "./ClarificationModal";
import { ScanPanel } from "./ScanPanel";
import { AiConsentModal } from "./AiConsentModal";
import { TapeMeasureProgress } from "@/app/app/_components/TapeMeasureProgress";
import { splitTranscript, hasHighlights } from "@/lib/highlightDimensions";
import { startMicrophoneMeter } from "@/lib/microphone-level";
import {
  MIN_TYPED_LENGTH as MIN_TEXT_LENGTH,
  appendAnswersToTranscript,
  requestClarifications,
} from "../_lib/quote-input";

type Tab = "voice" | "type" | "scan";
type VoiceState = "idle" | "recording" | "processing" | "error";

/** The tabs, their words, and whether this tab's kept words have been read back. */
export interface TabWords {
  tab: Tab;
  texts: Record<Channel, string>;
  loaded: boolean;
}

export type TabWordsEvent =
  | { type: "tab"; tab: Tab }
  | { type: "text"; channel: Channel; text: string }
  /** The kept words (lib/saved-job), read after hydration. */
  | { type: "loaded"; saved: { channel: Channel; text: string } | null; voiceEnabled: boolean };

export function tabWordsReducer(state: TabWords, event: TabWordsEvent): TabWords {
  switch (event.type) {
    case "tab":
      return state.tab === event.tab ? state : { ...state, tab: event.tab };
    case "text":
      return state.texts[event.channel] === event.text
        ? state
        : { ...state, texts: { ...state.texts, [event.channel]: event.text } };
    case "loaded": {
      if (state.loaded) return state;
      const loaded = { ...state, loaded: true };
      const saved = event.saved;
      if (!saved || !saved.text.trim()) return loaded;
      // Spoken words go back to Voice; plan-scan words come back as typed
      // words to check, as in the new look.
      if (saved.channel === "talk" && event.voiceEnabled) {
        return { ...loaded, tab: "voice", texts: { ...loaded.texts, talk: saved.text } };
      }
      return { ...loaded, tab: "type", texts: { ...loaded.texts, type: saved.text } };
    }
  }
}

/** The words a reload must not lose: the active tab's, else any other tab's. */
export function keptTabWords(state: TabWords): { channel: Channel; text: string } | null {
  const active: Channel = state.tab === "voice" ? "talk" : state.tab;
  if (state.texts[active].trim()) return { channel: active, text: state.texts[active] };
  for (const channel of ["talk", "type", "scan"] as const) {
    if (state.texts[channel].trim()) return { channel, text: state.texts[channel] };
  }
  return null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function QuoteInputTabs({
  needsAiConsent = false,
  voiceEnabled = true,
  scanEnabled = true,
}: {
  /** iOS shell + not-yet-consented → show the 5.1.2(i) consent modal first. */
  needsAiConsent?: boolean;
  /**
   * Whether the transcription / drawing-scan providers are configured on the
   * server. An unconfigured channel is hidden rather than shown as a button
   * that can only fail — the same rule the SMS send button follows.
   */
  voiceEnabled?: boolean;
  scanEnabled?: boolean;
} = {}) {
  const tabs: Tab[] = [
    ...(voiceEnabled ? (["voice"] as Tab[]) : []),
    "type",
    ...(scanEnabled ? (["scan"] as Tab[]) : []),
  ];
  const [words, dispatch] = useReducer(tabWordsReducer, tabs[0], (first: Tab) => ({
    tab: first,
    texts: { talk: "", type: "", scan: "" },
    loaded: false,
  }));
  const { tab } = words;
  const transcript = words.texts.talk;
  const typed = words.texts.type;
  const scanned = words.texts.scan;
  const setTab = (next: Tab) => dispatch({ type: "tab", tab: next });
  const setTranscript = useCallback((text: string) => dispatch({ type: "text", channel: "talk", text }), []);
  const setTyped = useCallback((text: string) => dispatch({ type: "text", channel: "type", text }), []);
  const setScanned = useCallback((text: string) => dispatch({ type: "text", channel: "scan", text }), []);
  // The words are kept in this tab until the draft quote exists (the new
  // look's backup, lib/saved-job): put back on any load within 30 minutes,
  // so a failed save or a reload never loses them. Browser storage is only
  // readable after hydration, so this belongs in an effect.
  useEffect(() => {
    dispatch({ type: "loaded", saved: readWords(sessionStore(), Date.now()), voiceEnabled });
  }, [voiceEnabled]);
  // Local mirror so accepting the modal reveals the tabs instantly (the
  // server routes enforce consent independently, so this is UX only).
  const [consentBlocked, setConsentBlocked] = useState<boolean>(needsAiConsent);

  // The "Continue" row reads the active tab's text. Scan and voice both
  // produce a fully-formed transcript, so they continue immediately;
  // typed input still requires the 20-char floor so people don't
  // accidentally generate from a single word.
  const activeText =
    tab === "voice" ? transcript : tab === "scan" ? scanned : typed;
  const activeMin = tab === "type" ? MIN_TEXT_LENGTH : 1;
  const kept = keptTabWords(words);
  const keptChannel = kept?.channel ?? null;
  const keptText = kept?.text ?? "";

  // On every change, once what was kept has been read back.
  useEffect(() => {
    if (!words.loaded) return;
    keepWords(sessionStore(), keptChannel ? { channel: keptChannel, text: keptText } : null, Date.now());
  }, [words.loaded, keptChannel, keptText]);

  return (
    <div>
      <AiConsentModal
        open={consentBlocked}
        onGranted={() => setConsentBlocked(false)}
      />
      <div
        role="tablist"
        aria-label="Input method"
        className={[
          "grid gap-2 rounded-sm border border-ink-700 bg-ink-800 p-1",
          tabs.length === 3 ? "grid-cols-3" : tabs.length === 2 ? "grid-cols-2" : "grid-cols-1",
        ].join(" ")}
      >
        {voiceEnabled && (
          <TabButton
            active={tab === "voice"}
            onClick={() => setTab("voice")}
            testId="tab-voice"
            controls="panel-voice"
          >
            Voice
          </TabButton>
        )}
        <TabButton
          active={tab === "type"}
          onClick={() => setTab("type")}
          testId="tab-type"
          controls="panel-type"
        >
          Type
        </TabButton>
        {scanEnabled && (
          <TabButton
            active={tab === "scan"}
            onClick={() => setTab("scan")}
            testId="tab-scan"
            controls="panel-scan"
          >
            Scan
          </TabButton>
        )}
      </div>

      <div className="mt-6">
        {tab === "voice" && (
          <VoicePanel transcript={transcript} setTranscript={setTranscript} />
        )}
        {tab === "type" && <TypePanel value={typed} setValue={setTyped} />}
        {tab === "scan" && (
          <ScanPanel transcript={scanned} setTranscript={setScanned} />
        )}
      </div>

      <ContinueRow text={activeText} minLength={activeMin} kept={kept} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  testId,
  controls,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
  controls: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={testId}
      aria-selected={active}
      aria-controls={controls}
      data-testid={testId}
      onClick={onClick}
      className={[
        "min-h-11 rounded-sm font-display text-sm uppercase tracking-tight transition-colors",
        active
          ? "bg-brand text-ink-900"
          : "text-ink-300 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** The classic panel's four looks for the recorder's phases. */
export function classicVoiceState(phase: RecorderPhase): VoiceState {
  switch (phase) {
    case "recording":
    case "paused":
      return "recording";
    case "transcribing":
      return "processing";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

function VoicePanel({
  transcript,
  setTranscript,
}: {
  transcript: string;
  setTranscript: (s: string) => void;
}) {
  // The new look's recorder (_v2/lib/recorder): the same microphone, format,
  // 3-minute limit and route, plus what the classic panel lacked: a
  // recording that fails to send is kept and "Try again" sends it again,
  // hiding the page stops the recording and writes down what was said, and
  // a recording not yet written down survives a reload.
  const { recorder, state: rec } = useVoiceRecorder(setTranscript);
  const state = classicVoiceState(rec.phase);
  const seconds = rec.seconds;
  const error = rec.error ?? "";
  const [meterLevel, setMeterLevel] = useState<number | null>(null);
  // The waveform follows the open microphone while recording.
  useEffect(() => {
    if (!rec.stream) return;
    return startMicrophoneMeter(rec.stream, (level) => setMeterLevel(level));
  }, [rec.stream]);
  const audioLevel = rec.stream ? meterLevel : null;

  function startRecording() {
    void recorder.start();
  }

  function stopRecording() {
    recorder.finish();
  }

  /** Try again: send the kept recording again, or start over when there's none. */
  function retry() {
    if (rec.canResend) recorder.resend();
    else recorder.reset();
  }

  function reset() {
    setTranscript("");
    recorder.reset();
  }

  return (
    <section
      id="panel-voice"
      role="tabpanel"
      aria-labelledby="tab-voice"
      data-testid="panel-voice"
      className="t2q-card-pro p-6 sm:p-8"
    >
      {transcript ? (
        <TranscriptReview
          transcript={transcript}
          onRedo={reset}
          onChange={setTranscript}
          redoLabel="Re-record"
        />
      ) : (
        <div className="flex flex-col items-center text-center">
          <div className="flex w-full items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ff9a62]">Your site note</p>
            <p className="font-mono text-lg tabular-nums text-ink-300" aria-label="Recording time">{formatTime(seconds)}</p>
          </div>
          <RecordButton
            state={state}
            audioLevel={audioLevel}
            onStart={startRecording}
            onStop={stopRecording}
          />
          {state === "processing" && (
            <div className="mt-5 flex w-full justify-center">
              <TapeMeasureProgress label="// transcribing" estimateMs={9000} />
            </div>
          )}
          <p
            data-testid="voice-status"
            aria-live="polite"
            className="mt-2 min-h-5 text-sm text-ink-300"
          >
            {state === "idle" && "Tap the waveform to start. Up to 3 minutes."}
            {state === "recording" && "Recording — tap again to stop."}
            {state === "processing" && "Transcribing…"}
            {state === "error" && (
              <span data-testid="voice-error" className="text-red-400">
                {error}
              </span>
            )}
          </p>
          {state === "error" && (
            <button
              type="button"
              onClick={retry}
              className="mt-4 inline-flex min-h-[44px] items-center text-sm font-mono uppercase tracking-[0.2em] text-brand hover:text-brand-300"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function RecordButton({
  state,
  audioLevel,
  onStart,
  onStop,
}: {
  state: VoiceState;
  audioLevel: number | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const recording = state === "recording";
  const processing = state === "processing";
  const onClick = recording ? onStop : onStart;
  const disabled = processing;

  return (
    <button
      type="button"
      data-testid="record-button"
      aria-pressed={recording}
      aria-label={recording ? "Stop recording" : processing ? "Transcribing recording" : "Start recording"}
      onClick={onClick}
      disabled={disabled}
      className="t2q-record-control"
    >
      <VoiceWaveform state={state} audioLevel={audioLevel} />
      <span className="t2q-record-label">{recording ? "Stop recording" : processing ? "Preparing your transcript" : "Start recording"}</span>
    </button>
  );
}

function TypePanel({
  value,
  setValue,
}: {
  value: string;
  setValue: (s: string) => void;
}) {
  const len = value.trim().length;
  const ok = len >= MIN_TEXT_LENGTH;
  return (
    <section
      id="panel-type"
      role="tabpanel"
      aria-labelledby="tab-type"
      data-testid="panel-type"
      className="t2q-card-pro p-6 sm:p-8"
    >
      <label
        htmlFor="type-input"
        className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
      >
        Job description
      </label>
      <textarea
        id="type-input"
        data-testid="type-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={10}
        placeholder="e.g. Replace 12 m of weatherboards on south wall, prime and paint, two coats Resene Lumbersider, supply scaffold for two days."
        className="mt-3 block w-full resize-y rounded-sm border border-ink-600 bg-ink-900 px-4 py-3 text-base text-white placeholder:text-ink-500 outline-none focus:border-brand"
      />
      <p
        data-testid="type-counter"
        className="mt-2 font-mono text-xs uppercase tracking-[0.2em]"
      >
        <span className={ok ? "text-ink-400" : "text-ink-500"}>
          {len} chars
        </span>
        {!ok && (
          <span className="ml-2 text-ink-500">
            · {MIN_TEXT_LENGTH - len} more to continue
          </span>
        )}
      </p>
    </section>
  );
}

function TranscriptReview({
  transcript,
  onRedo,
  onChange,
  redoLabel,
}: {
  transcript: string;
  onRedo: () => void;
  onChange: (s: string) => void;
  redoLabel: string;
}) {
  const segments = splitTranscript(transcript);
  const showsHighlights = hasHighlights(transcript);
  return (
    <div>
      <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
        {"// quick check — did I hear you right?"}
      </div>
      <h3 className="mt-1 font-display text-base uppercase tracking-tight text-white sm:text-lg">
        Confirm before I quote
      </h3>
      <p className="mt-1 text-sm text-ink-300">
        {showsHighlights
          ? "Read it back. Numbers and sizes are highlighted — that's where misreads cause bad quotes."
          : "Read it back. Edit anything that's wrong before tapping Continue."}
      </p>

      {showsHighlights && (
        <div
          data-testid="transcript-highlighted"
          aria-hidden="true"
          className="mt-4 whitespace-pre-wrap rounded-sm border border-ink-700 bg-ink-950 px-4 py-3 text-base leading-relaxed text-ink-100"
        >
          {segments.map((seg, i) =>
            seg.kind === "highlight" ? (
              <span
                key={i}
                className="rounded-[2px] bg-brand/20 px-1 font-semibold text-brand"
              >
                {seg.value}
              </span>
            ) : (
              <span key={i}>{seg.value}</span>
            ),
          )}
        </div>
      )}

      <label
        htmlFor="transcript-output"
        className="mt-4 block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500"
      >
        Edit if anything&rsquo;s wrong
      </label>
      <textarea
        id="transcript-output"
        data-testid="transcript-output"
        value={transcript}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="mt-2 block w-full resize-y rounded-sm border border-ink-600 bg-ink-900 px-4 py-3 text-base text-white outline-none focus:border-brand"
      />
      <button
        type="button"
        data-testid="voice-redo"
        onClick={onRedo}
        className="mt-3 inline-flex min-h-[44px] items-center text-sm font-mono uppercase tracking-[0.2em] text-ink-300 hover:text-white"
      >
        ← {redoLabel}
      </button>
    </div>
  );
}

/**
 * ContinueRow — Wave 36 — now wraps the original "Continue" form
 * submission with a clarification modal step.
 *
 * Flow:
 *   1. Tradie clicks Continue → button shows "Checking…"
 *   2. POST /api/quotes/cleanup with the transcript text
 *   3. If the cleanup returned ≥1 clarification question:
 *      open <ClarificationModal>. Each question is shown with
 *      radio-button options (or a free-text input).
 *   4. After the modal completes, append the answers to the
 *      transcript as a clearly labelled "[Additional details]"
 *      block, write the enriched value into the hidden input, then
 *      programmatically submit the existing <form> so the unchanged
 *      `createDraftQuote` server action runs against the enriched
 *      transcript.
 *   5. If cleanup fails / times out / returns no questions, skip
 *      the modal entirely and submit the original transcript. The
 *      server-side cleanup inside /api/quotes/generate still runs
 *      as a safety net, so nothing is lost.
 *
 * Graceful degradation is the rule: an LLM hiccup must NEVER block
 * quote generation. The modal is an enhancement, not a gate.
 */
type ContinueStep = "idle" | "cleaning" | "asking" | "submitting" | "error";

function ContinueRow({
  text,
  minLength,
  kept,
}: {
  text: string;
  minLength: number;
  /** The words kept in this tab (lib/saved-job), marked as sent when the save goes. */
  kept: { channel: Channel; text: string } | null;
}) {
  const ready = text.trim().length >= minLength;
  const formRef = useRef<HTMLFormElement | null>(null);
  const transcriptInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<ContinueStep>("idle");
  const [questions, setQuestions] = useState<Clarification[]>([]);

  function submitForm(enrichedTranscript: string) {
    if (!formRef.current || !transcriptInputRef.current) return;
    transcriptInputRef.current.value = enrichedTranscript;
    setStep("submitting");
    // Marked as sent: the quote page clears them once the draft exists.
    keepWords(sessionStore(), kept, Date.now(), true);
    formRef.current.requestSubmit();
  }

  async function startContinue() {
    if (!ready || step !== "idle") return;
    setStep("cleaning");
    // Any clean-up failure (refusal, timeout, network, bad reply) comes back
    // as no questions, so the job is submitted directly — the generation
    // pipeline still has its own clean-up inside.
    const qs = await requestClarifications(text);
    if (qs.length === 0) {
      submitForm(text);
      return;
    }
    setQuestions(qs);
    setStep("asking");
  }

  function handleModalComplete(answers: ClarificationAnswer[]) {
    const enriched = appendAnswersToTranscript(text, questions, answers);
    setQuestions([]);
    submitForm(enriched);
  }

  function handleModalCancel() {
    // Cancel = "generate without answering". The cleanup-suggested
    // questions remain in the LLM's view via the server-side cleanup
    // pass inside the generate route, so the quote is still made.
    setQuestions([]);
    submitForm(text);
  }

  const busy = step !== "idle";
  const label =
    step === "cleaning"
      ? "Checking…"
      : step === "asking"
        ? "Waiting on you…"
        : step === "submitting"
          ? "Saving…"
          : "Continue →";

  return (
    <>
      <form
        ref={formRef}
        action={createDraftQuote}
        className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <input
          ref={transcriptInputRef}
          type="hidden"
          name="transcript"
          defaultValue={text}
        />
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-500">
          {"// step 2: t2q builds the quote"}
        </p>
        <button
          type="button"
          onClick={startContinue}
          disabled={!ready || busy}
          data-testid="continue-button"
          title={
            ready
              ? "Generate a quote from your description."
              : "Add a description to continue."
          }
          className="t2q-btn-primary-pro disabled:cursor-not-allowed disabled:opacity-40"
        >
          {label}
        </button>
      </form>
      <ClarificationModal
        open={step === "asking" && questions.length > 0}
        questions={questions}
        onComplete={handleModalComplete}
        onCancel={handleModalCancel}
      />
    </>
  );
}
