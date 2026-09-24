/**
 * Keep the tradie's words if saving the draft fails.
 *
 * When `createDraftQuote` can't save, it redirects back to this page with
 * `?error=draft-failed`, and Next remounts the page, so everything on
 * screen would be lost — a three-minute voice note included. Just before
 * submitting, the words are put in sessionStorage (this tab only); after a
 * failed save they are put back on screen and removed. Any other visit
 * clears them. Browser storage can be blocked or empty, so every access is
 * guarded and nothing depends on it.
 */

import type { Channel } from "./channels";

export const SAVED_JOB_KEY = "t2q-new-quote-words";
/** Older words than this are stale and never come back. */
export const SAVED_JOB_MAX_AGE_MS = 30 * 60 * 1000;

export interface SavedJob {
  channel: Channel;
  text: string;
  at: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const CHANNELS: ReadonlySet<string> = new Set(["talk", "type", "scan"]);

export function parseSavedJob(raw: string | null, now: number): SavedJob | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedJob> | null;
    if (!value || typeof value !== "object") return null;
    const { channel, text, at } = value;
    if (typeof channel !== "string" || !CHANNELS.has(channel)) return null;
    if (typeof text !== "string" || !text.trim()) return null;
    if (typeof at !== "number" || !Number.isFinite(at)) return null;
    if (now - at > SAVED_JOB_MAX_AGE_MS || at - now > 60_000) return null;
    return { channel: channel as Channel, text, at };
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

export function rememberWords(storage: StorageLike | null, job: SavedJob): void {
  try {
    storage?.setItem(SAVED_JOB_KEY, JSON.stringify(job));
  } catch {
    /* Full or blocked: the save still goes ahead. */
  }
}

export function forgetWords(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SAVED_JOB_KEY);
  } catch {
    /* Blocked. */
  }
}

/** The words kept for a failed save (at most once), clearing them either way. */
export function takeWords(storage: StorageLike | null, now: number): SavedJob | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(SAVED_JOB_KEY) ?? null;
  } catch {
    return null;
  }
  forgetWords(storage);
  return parseSavedJob(raw, now);
}
