/**
 * Keep the tradie's new-quote words (and a recording not yet written down)
 * until the draft quote exists.
 *
 * The new-quote page can be reloaded under the tradie: the app loads an
 * update when they come back from another app, a failed save comes back to
 * this page, the error screen reloads, or the phone drops the page while
 * they're in Photos. Everything on screen would be lost, a three-minute
 * voice note included. So the words are put in sessionStorage (this tab
 * only) on every change, and put back on any load while under 30 minutes
 * old. They are cleared once the draft quote exists: `createDraftQuote`
 * marks them sent, and the quote page clears sent words when it loads
 * (forgetSentJob). Browser storage can be blocked, full or empty, so every
 * access is guarded and nothing depends on it.
 */

import type { Channel } from "./channels";

export const SAVED_JOB_KEY = "t2q-new-quote-words";
export const SAVED_RECORDING_KEY = "t2q-new-quote-recording";
/** Older words (or recordings) than this are stale and never come back. */
export const SAVED_JOB_MAX_AGE_MS = 30 * 60 * 1000;

export interface SavedJob {
  channel: Channel;
  text: string;
  at: number;
  /** The words went to createDraftQuote: the quote page clears them once it loads. */
  submitted?: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const CHANNELS: ReadonlySet<string> = new Set(["talk", "type", "scan"]);

function fresh(at: unknown, now: number): at is number {
  return typeof at === "number" && Number.isFinite(at) && now - at <= SAVED_JOB_MAX_AGE_MS && at - now <= 60_000;
}

export function parseSavedJob(raw: string | null, now: number): SavedJob | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedJob> | null;
    if (!value || typeof value !== "object") return null;
    const { channel, text, at, submitted } = value;
    if (typeof channel !== "string" || !CHANNELS.has(channel)) return null;
    if (typeof text !== "string" || !text.trim()) return null;
    if (!fresh(at, now)) return null;
    return { channel: channel as Channel, text, at, ...(submitted === true ? { submitted: true } : {}) };
  } catch {
    return null;
  }
}

/** sessionStorage, or null where the browser blocks it. */
export function sessionStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function remove(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* Blocked. */
  }
}

export function rememberWords(storage: StorageLike | null, job: SavedJob): void {
  try {
    storage?.setItem(SAVED_JOB_KEY, JSON.stringify(job));
  } catch {
    /* Full or blocked: the page carries on without the backup. */
  }
}

export function forgetWords(storage: StorageLike | null): void {
  remove(storage, SAVED_JOB_KEY);
}

/**
 * Keep these words (none: forget them). Called on every change; `submitted`
 * while createDraftQuote has them.
 */
export function keepWords(
  storage: StorageLike | null,
  words: { channel: Channel; text: string } | null,
  now: number,
  submitted = false,
): void {
  if (!words || !words.text.trim()) {
    forgetWords(storage);
    return;
  }
  rememberWords(storage, { channel: words.channel, text: words.text, at: now, ...(submitted ? { submitted: true } : {}) });
}

/** The words kept in this tab, while fresh. They stay kept (a later load puts them back too). */
export function readWords(storage: StorageLike | null, now: number): SavedJob | null {
  const raw = read(storage, SAVED_JOB_KEY);
  const job = parseSavedJob(raw, now);
  if (raw && !job) forgetWords(storage);
  return job;
}

// ── A recording not yet written down ─────────────────────────────────────────

export interface SavedRecording {
  /** The recording's own type ("audio/webm", "audio/mp4"…). */
  type: string;
  /** The audio, base64. */
  data: string;
  at: number;
}

export function parseSavedRecording(raw: string | null, now: number): SavedRecording | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedRecording> | null;
    if (!value || typeof value !== "object") return null;
    const { type, data, at } = value;
    if (typeof type !== "string" || !/^audio\//.test(type)) return null;
    if (typeof data !== "string" || !data) return null;
    if (!fresh(at, now)) return null;
    return { type, data, at };
  } catch {
    return null;
  }
}

/** Keep a recording. A long one may not fit (storage holds a few MB): then only the words are kept. */
export function rememberRecording(storage: StorageLike | null, recording: SavedRecording): void {
  try {
    storage?.setItem(SAVED_RECORDING_KEY, JSON.stringify(recording));
  } catch {
    remove(storage, SAVED_RECORDING_KEY);
  }
}

export function forgetRecording(storage: StorageLike | null): void {
  remove(storage, SAVED_RECORDING_KEY);
}

/** The kept recording, while fresh (it stays kept until it's written down or replaced). */
export function readRecording(storage: StorageLike | null, now: number): SavedRecording | null {
  const raw = read(storage, SAVED_RECORDING_KEY);
  const recording = parseSavedRecording(raw, now);
  if (raw && !recording) forgetRecording(storage);
  return recording;
}

/**
 * The quote page loaded: once the words were sent to createDraftQuote, the
 * draft exists, so nothing is kept any more. Words still being typed (in
 * this tab, before a visit to another job) stay. Returns whether it cleared.
 */
export function forgetSentJob(storage: StorageLike | null, now: number): boolean {
  const job = readWords(storage, now);
  if (!job?.submitted) return false;
  forgetWords(storage);
  forgetRecording(storage);
  return true;
}

// ── Audio as text, for storage ───────────────────────────────────────────────

/** A recording as base64 (browser storage holds text only). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** The kept recording back as audio; null when the text isn't base64. */
export function base64ToBlob(data: string, type: string): Blob | null {
  try {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}

/**
 * What the recorder calls with its kept recording (RecorderDeps.onKept):
 * copy it into this tab's storage, or forget the copy. The copy is made as
 * text in the background, so only the newest recording's copy is written.
 */
export function recordingBackup(
  storage: () => StorageLike | null,
  now: () => number,
): (audio: { blob: Blob; type: string } | null) => Promise<void> {
  let latest = 0;
  return async (audio) => {
    const mine = ++latest;
    if (!audio) {
      forgetRecording(storage());
      return;
    }
    let data: string;
    try {
      data = await blobToBase64(audio.blob);
    } catch {
      return;
    }
    if (mine === latest) rememberRecording(storage(), { type: audio.type || "audio/webm", data, at: now() });
  };
}
