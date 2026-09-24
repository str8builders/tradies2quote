/**
 * Rules and requests shared by both looks of the new-quote flow (the current
 * tabs in QuoteInputTabs and the redesign's screens in ../_v2), so the two
 * cannot drift apart: the same recording limit and audio formats, the same
 * minimum for a typed job, the same clean-up check before a quote is
 * written, and the same way answers to its questions join the job text that
 * `createDraftQuote` saves. Moved here unchanged from QuoteInputTabs.
 *
 * Pure and isomorphic apart from the fetch in `requestClarifications`.
 */

import type { Clarification } from "@/lib/clarifications";
import type { ClarificationAnswer } from "../_components/ClarificationModal";

/** A voice note stops by itself after three minutes. */
export const MAX_RECORDING_SECONDS = 180;

/**
 * A typed job needs this many characters (after trimming) before it can be
 * quoted, so a single word never starts a quote. Voice and plan-photo text
 * is complete when it arrives, so those only need to be non-empty.
 */
export const MIN_TYPED_LENGTH = 20;

/** Recording formats in order of preference. */
export const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

interface MimeSupport {
  isTypeSupported(type: string): boolean;
}

/** The first recording format this browser supports; undefined means its default. */
export function pickMimeType(
  recorder: MimeSupport | undefined = typeof MediaRecorder === "undefined"
    ? undefined
    : MediaRecorder,
): string | undefined {
  if (!recorder) return undefined;
  return RECORDING_MIME_TYPES.find((t) => recorder.isTypeSupported(t));
}

/**
 * Add the tradie's answers to the job text as a clearly labelled block.
 * Skipped questions (null) are left out; with no answers the text is
 * returned unchanged.
 */
export function appendAnswersToTranscript(
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

/** A stalled clean-up must never strand the button that starts a quote. */
export const CLEANUP_TIMEOUT_MS = 30_000;

/**
 * Ask the clean-up pass (POST /api/quotes/cleanup) whether anything about
 * the job needs confirming before the quote is written. Any failure — a
 * refusal, a timeout, a network error, a malformed reply — means "no
 * questions": the caller carries on and saves the job as it is, because
 * /api/quotes/generate runs its own clean-up as a safety net. An LLM hiccup
 * must never block a quote.
 */
export async function requestClarifications(
  transcript: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Clarification[]> {
  try {
    const res = await fetchImpl("/api/quotes/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
      signal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { questions?: Clarification[] };
    return Array.isArray(data.questions) ? data.questions : [];
  } catch {
    return [];
  }
}
