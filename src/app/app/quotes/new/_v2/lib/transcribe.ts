/**
 * Send a voice note to /api/quotes/transcribe exactly as the current flow
 * does (multipart "audio" file named recording.webm / .m4a / .ogg, 90 s
 * limit) and turn the reply into words for the tradie: the transcript, or a
 * plain problem and whether sending the same recording again could work.
 */

import {
  NO_WORDS,
  TRANSCRIBE_HICCUP,
  TRANSCRIBE_OFFLINE,
  TRANSCRIBE_TOO_SLOW,
  transcribeFailure,
} from "./copy";

export const TRANSCRIBE_TIMEOUT_MS = 90_000;

export type TranscribeResult =
  | { ok: true; transcript: string }
  | { ok: false; error: string; retryable: boolean; aborted?: boolean };

/** The file name the route and the model expect for a recording type. */
export function audioFileName(type: string): string {
  const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
  return `recording.${ext}`;
}

/** AbortSignal.any where the browser has it (Safari 17.4+), otherwise by hand. */
export function anySignal(signals: AbortSignal[]): AbortSignal {
  const native = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof native === "function") return native.call(AbortSignal, signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

function timeoutSignal(ms: number): AbortSignal {
  const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  if (typeof timeout === "function") return timeout.call(AbortSignal, ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
  return controller.signal;
}

export async function transcribeRecording(
  blob: Blob,
  type: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = TRANSCRIBE_TIMEOUT_MS,
): Promise<TranscribeResult> {
  const timeout = timeoutSignal(timeoutMs);
  let res: Response;
  try {
    const form = new FormData();
    form.append("audio", new File([blob], audioFileName(type), { type }));
    res = await fetchImpl("/api/quotes/transcribe", {
      method: "POST",
      body: form,
      signal: anySignal([signal, timeout]),
    });
  } catch {
    if (signal.aborted) return { ok: false, error: "", retryable: false, aborted: true };
    if (timeout.aborted) return { ok: false, error: TRANSCRIBE_TOO_SLOW, retryable: true };
    return { ok: false, error: TRANSCRIBE_OFFLINE, retryable: true };
  }

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    return { ok: false, ...transcribeFailure(res.status, body) };
  }

  let transcript = "";
  try {
    const data = (await res.json()) as { transcript?: unknown };
    transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
  } catch {
    if (signal.aborted) return { ok: false, error: "", retryable: false, aborted: true };
    return { ok: false, error: TRANSCRIBE_HICCUP, retryable: true };
  }
  if (!transcript) return { ok: false, error: NO_WORDS, retryable: false };
  return { ok: true, transcript };
}
