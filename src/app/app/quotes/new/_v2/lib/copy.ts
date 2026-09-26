/**
 * Plain words for everything that can go wrong in the new-look new-quote
 * flow, and the recorder's status lines. Pure, so every message is tested.
 */

import { inIPhoneApp, trialEndedMessage } from "@/lib/trial-ended";
import { MAX_RECORDING_SECONDS } from "../../_lib/quote-input";

// ── Errors the page is sent back with (?error=) ─────────────────────────────

/**
 * `createDraftQuote` redirects back with these keys. The current look words
 * them for its tabs and "Continue"; these match the new screens.
 */
const PAGE_ERRORS: Record<string, string> = {
  "missing-transcript": "Tell us about the job first, then tap Write my quote.",
  "draft-failed": "We couldn't start that quote. Check your internet connection and try again.",
};

/** The message for an `?error=` key, or undefined for none or an unknown key. */
export function pageErrorMessage(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  return Object.prototype.hasOwnProperty.call(PAGE_ERRORS, key) ? PAGE_ERRORS[key] : undefined;
}

/** Added after a failed save when the words were put back on screen. */
export const RESTORED_NOTE = "Your words are still here.";

// ── Microphone and recording ────────────────────────────────────────────────

export const MIC_UNSUPPORTED = "This browser can't use the microphone. Type the job instead.";
export const RECORDING_UNSUPPORTED = "This phone can't record here. Type the job instead.";
export const RECORDING_FAILED = "Recording couldn't start. Try again, or type the job instead.";
export const NO_AUDIO =
  "I didn't catch any sound. Check nothing's covering the microphone and try again.";

/** Why the microphone could not be opened, from getUserMedia's error name. */
export function micErrorMessage(error: unknown): string {
  const name =
    error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "The microphone is blocked. Allow it in your phone's settings, then try again. Or type the job instead.";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "I couldn't find a microphone on this device. Type the job instead.";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "The microphone is busy, maybe with a call or another app. Close it and try again.";
    default:
      return "I couldn't start the microphone. Try again, or type the job instead.";
  }
}

// ── Turning the recording into words (/api/quotes/transcribe) ──────────────

export interface TranscribeFailure {
  error: string;
  /** Worth sending the same recording again (the connection or the service hiccuped). */
  retryable: boolean;
}

export const NO_WORDS =
  "I couldn't hear any words in that. Try again a bit closer to the phone, or type the job.";
export const TRANSCRIBE_OFFLINE =
  "No internet connection. Check your signal and try again. Your recording is kept.";
export const TRANSCRIBE_TOO_SLOW =
  "Writing down what you said is taking too long. Check your signal and try again. Your recording is kept.";
export const TRANSCRIBE_HICCUP =
  "I couldn't write down what you said just then. Try again. Your recording is kept.";

function codeOf(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" ? error.trim() : "";
}

/** A reply the route meant for people: a sentence, not a code like "rate_limited". */
function sentenceOf(body: unknown): string {
  const code = codeOf(body);
  return /\s/.test(code) && !/[_{}<>]/.test(code) ? code : "";
}

/**
 * Plain words for a failed transcription reply, and whether re-sending could
 * work. `inApp`: inside the iPhone app a finished trial is only "paused",
 * never "subscribe" (App Store 3.1.3(f)).
 */
export function transcribeFailure(status: number, body: unknown, inApp: boolean = inIPhoneApp()): TranscribeFailure {
  const code = codeOf(body);
  if (status === 402 || code === "trial_expired") {
    return {
      error: trialEndedMessage("Your free trial has ended. Subscribe to keep making quotes.", inApp),
      retryable: false,
    };
  }
  if (code === "ai_consent_required") {
    return {
      error: "Voice notes need your OK to use AI. Open a new quote again and tap I agree.",
      retryable: false,
    };
  }
  if (status === 401) {
    return { error: "You've been signed out. Sign in again, then record the job.", retryable: false };
  }
  if (status === 429 || code === "rate_limited") {
    return {
      error: "You've used today's voice notes. Type the job instead, or try again tomorrow.",
      retryable: false,
    };
  }
  if (status === 413) {
    return {
      error: `That recording is too big to send. Keep it under ${MAX_RECORDING_SECONDS / 60} minutes.`,
      retryable: false,
    };
  }
  if (status === 422) return { error: NO_WORDS, retryable: false };
  if (status === 503) {
    return { error: "Voice notes aren't working right now. Type the job instead.", retryable: false };
  }
  if (status >= 500) return { error: TRANSCRIBE_HICCUP, retryable: true };
  return {
    error: sentenceOf(body) || `Something went wrong sending your recording (error ${status}). Record it again.`,
    retryable: false,
  };
}

// ── What the talk screen says ───────────────────────────────────────────────

export type TalkPhase = "idle" | "starting" | "recording" | "paused" | "transcribing" | "review" | "error";

/** 42 → "0:42". */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The big status line and the smaller line under it. */
export function talkStatus(
  phase: TalkPhase,
  seconds: number,
  maxSeconds: number = MAX_RECORDING_SECONDS,
): { status: string; detail: string } {
  switch (phase) {
    case "starting":
      return { status: "Getting the mic ready…", detail: "If your phone asks, allow the microphone." };
    case "recording": {
      const left = maxSeconds - seconds;
      return {
        status: "I'm listening",
        detail: left <= 30 ? `${Math.max(0, left)} seconds left` : "Tap Done when you've finished.",
      };
    }
    case "paused":
      return { status: "Paused", detail: "Tap the mic to carry on." };
    case "transcribing":
    case "review":
      return { status: "Writing down what you said…", detail: "This usually takes a few seconds." };
    case "error":
      return { status: "That didn't work", detail: "" };
    default:
      return {
        status: "Tap the mic to start.",
        detail: `Sizes, materials, how long it'll take. Up to ${maxSeconds / 60} minutes.`,
      };
  }
}

/** The mic button's name for screen readers: what a tap will do. */
export function micButtonLabel(phase: TalkPhase, canPause: boolean): string {
  switch (phase) {
    case "starting":
      return "Getting the microphone ready";
    case "recording":
      return canPause ? "Pause recording" : "Stop recording";
    case "paused":
      return "Carry on recording";
    case "transcribing":
    case "review":
      return "Writing down what you said";
    default:
      return "Start recording";
  }
}

// ── Writing the quote ───────────────────────────────────────────────────────

export type WritingStep = "idle" | "checking" | "asking" | "saving";

/** The label on the big button while the quote is being started. */
export function writeButtonLabel(step: WritingStep): string {
  if (step === "checking") return "Checking the details…";
  if (step === "saving") return "Starting your quote…";
  return "Write my quote";
}

/** The honest line above the button while it waits (the check can take up to 30 s). */
export function writeHint(step: WritingStep, seconds: number): string | undefined {
  if (step === "checking") {
    return seconds >= 10
      ? "Still checking. This can take up to 30 seconds."
      : "Looking for anything I should ask you first.";
  }
  if (step === "saving") return "Saving your job details.";
  return undefined;
}
