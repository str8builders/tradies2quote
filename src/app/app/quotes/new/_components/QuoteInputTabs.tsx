"use client";

import { useEffect, useRef, useState } from "react";
import { createDraftQuote } from "../actions";
import type { Clarification } from "@/lib/clarifications";
import {
  ClarificationModal,
  type ClarificationAnswer,
} from "./ClarificationModal";
import { ScanPanel } from "./ScanPanel";
import { AiConsentModal } from "./AiConsentModal";
import { TapeMeasureProgress } from "@/app/app/_components/TapeMeasureProgress";
import { splitTranscript, hasHighlights } from "@/lib/highlightDimensions";

type Tab = "voice" | "type" | "scan";
type VoiceState = "idle" | "recording" | "processing" | "error";

const MAX_SECONDS = 180;
const MIN_TEXT_LENGTH = 20;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(1, "0");
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
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const [transcript, setTranscript] = useState<string>("");
  const [typed, setTyped] = useState<string>("");
  const [scanned, setScanned] = useState<string>("");
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

      <ContinueRow text={activeText} minLength={activeMin} />
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

function VoicePanel({
  transcript,
  setTranscript,
}: {
  transcript: string;
  setTranscript: (s: string) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState<number>(0);
  const [error, setError] = useState<string>("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  function cleanup() {
    if (tickRef.current) clearInterval(tickRef.current);
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    tickRef.current = null;
    stopTimeoutRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }

  async function startRecording() {
    setError("");
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setError("Microphone access isn't available in this browser.");
      setState("error");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission denied. Allow access and try again.");
      setState("error");
      return;
    }
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("Your browser can't record audio in a supported format.");
      setState("error");
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void uploadAudio(blob, type);
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setState("recording");

    tickRef.current = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS) stopRecording();
        return next;
      });
    }, 1000);
    stopTimeoutRef.current = setTimeout(stopRecording, MAX_SECONDS * 1000 + 500);
  }

  function stopRecording() {
    if (tickRef.current) clearInterval(tickRef.current);
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    tickRef.current = null;
    stopTimeoutRef.current = null;
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      setState("processing");
      r.stop();
    }
  }

  async function uploadAudio(blob: Blob, type: string) {
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const form = new FormData();
    form.append("audio", new File([blob], `recording.${ext}`, { type }));
    try {
      const res = await fetch("/api/quotes/transcribe", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || `Transcription failed (${res.status}).`);
        setState("error");
        return;
      }
      const data = (await res.json()) as { transcript?: string };
      setTranscript((data.transcript ?? "").trim());
      setState("idle");
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "TimeoutError"
          ? "Transcription is taking too long. Check your connection and try again."
          : "Network error. Check your connection and try again.",
      );
      setState("error");
    }
  }

  function reset() {
    setTranscript("");
    setError("");
    setState("idle");
    setSeconds(0);
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
          <RecordButton
            state={state}
            onStart={startRecording}
            onStop={stopRecording}
          />
          <div className="mt-5 font-mono text-2xl tabular-nums text-white">
            {formatTime(seconds)}
            <span className="ml-2 text-sm text-ink-400">
              / {formatTime(MAX_SECONDS)}
            </span>
          </div>
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
            {state === "idle" && "Tap to record. Up to 3 minutes."}
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
              onClick={reset}
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
  onStart,
  onStop,
}: {
  state: VoiceState;
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
      aria-label={recording ? "Stop recording" : "Start recording"}
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative grid h-28 w-28 place-items-center rounded-full border-2 transition-colors disabled:opacity-60",
        recording
          ? "border-brand bg-brand text-ink-900"
          : "border-brand bg-ink-900 text-brand hover:bg-brand hover:text-ink-900",
      ].join(" ")}
    >
      {recording && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-brand animate-pulse-ring"
        />
      )}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-10 w-10"
        fill="currentColor"
      >
        {recording ? (
          <rect x="6" y="6" width="12" height="12" rx="1" />
        ) : (
          <>
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" />
            <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.08A7 7 0 0 0 19 11z" />
          </>
        )}
      </svg>
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

function appendAnswersToTranscript(
  base: string,
  questions: Clarification[],
  answers: ClarificationAnswer[],
): string {
  const lines: string[] = [];
  for (const a of answers) {
    if (a.answer === null) continue;
    const q = questions.find((qq) => qq.id === a.questionId);
    if (!q) continue;
    lines.push(`- ${q.question} → ${a.answer}`);
  }
  if (lines.length === 0) return base;
  return `${base}\n\n[Additional details confirmed by the tradie:]\n${lines.join("\n")}`;
}

function ContinueRow({ text, minLength }: { text: string; minLength: number }) {
  const ready = text.trim().length >= minLength;
  const formRef = useRef<HTMLFormElement | null>(null);
  const transcriptInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<ContinueStep>("idle");
  const [questions, setQuestions] = useState<Clarification[]>([]);

  function submitForm(enrichedTranscript: string) {
    if (!formRef.current || !transcriptInputRef.current) return;
    transcriptInputRef.current.value = enrichedTranscript;
    setStep("submitting");
    formRef.current.requestSubmit();
  }

  async function startContinue() {
    if (!ready || step !== "idle") return;
    setStep("cleaning");
    try {
      const res = await fetch("/api/quotes/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
        // Stalled cleanup must never strand the Continue button — a
        // timeout lands in the catch below, which submits directly.
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        // Cleanup endpoint refused (auth, validation, server) — fall
        // through to direct submission. Generation pipeline still has
        // its own cleanup inside.
        submitForm(text);
        return;
      }
      const data = (await res.json()) as { questions?: Clarification[] };
      const qs = Array.isArray(data.questions) ? data.questions : [];
      if (qs.length === 0) {
        submitForm(text);
        return;
      }
      setQuestions(qs);
      setStep("asking");
    } catch {
      // Network / parse error — same fallback.
      submitForm(text);
    }
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
