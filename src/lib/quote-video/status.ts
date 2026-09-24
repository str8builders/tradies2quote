/**
 * Quote video status rules shared by the owner's quote page, its server
 * actions and the client's public quote page. Pure: no Supabase, no React.
 *
 * The one rule that matters for clients: a video is only ever shown while it
 * was rendered from the quote's CURRENT `quotes.version` (the column moves
 * whenever customer-visible content changes), so a client never sees a video
 * of figures that are no longer on the quote.
 */
import type { QuoteVideoRowStatus } from "./constants.ts";

/** The quote_videos columns these rules read. */
export type QuoteVideoRow = {
  quote_version: number;
  status: QuoteVideoRowStatus | string;
  storage_path: string | null;
  poster_path: string | null;
};

/** What the owner's card shows. Paths never leave the server; the card gets signed URLs. */
export type QuoteVideoStatus =
  | { kind: "none" }
  | { kind: "working"; phase: "queued" | "rendering" }
  | { kind: "ready"; videoUrl: string; posterUrl: string; fileName: string }
  | { kind: "failed" }
  /** The newest video (or request) is for an older version of the quote. */
  | { kind: "stale"; hadVideo: boolean };

export type QuoteVideoState =
  | Exclude<QuoteVideoStatus, { kind: "ready" }>
  | { kind: "ready"; storagePath: string; posterPath: string };

/** The owner's view of their newest video row against the quote's current version. */
export function describeQuoteVideo(row: QuoteVideoRow | null, currentVersion: number): QuoteVideoState {
  if (!row) return { kind: "none" };
  if (row.quote_version < currentVersion) return { kind: "stale", hadVideo: row.status === "ready" };
  if (row.quote_version > currentVersion) return { kind: "none" };
  switch (row.status) {
    case "queued":
    case "rendering":
      return { kind: "working", phase: row.status };
    case "ready":
      return row.storage_path && row.poster_path
        ? { kind: "ready", storagePath: row.storage_path, posterPath: row.poster_path }
        : { kind: "failed" };
    case "failed":
      return { kind: "failed" };
    default:
      return { kind: "none" };
  }
}

/**
 * The files the client's quote page may play: only a ready render of the
 * quote's current version. Anything else — an older version, a render still
 * running, a failure, a row without files — shows no video.
 */
export function publicQuoteVideoFiles(row: QuoteVideoRow | null, currentVersion: number): { video: string; poster: string } | null {
  if (!row || row.status !== "ready" || !Number.isInteger(currentVersion) || row.quote_version !== currentVersion) return null;
  if (!row.storage_path || !row.poster_path) return null;
  return { video: row.storage_path, poster: row.poster_path };
}

/** The owner's card polls every 5 s while a video is being made, for at most 5 minutes. */
export const QUOTE_VIDEO_POLL = { intervalMs: 5_000, limitMs: 5 * 60_000 } as const;

export function shouldKeepPolling(startedAt: number, now: number): boolean {
  return now - startedAt < QUOTE_VIDEO_POLL.limitMs;
}

/** File name offered when sharing or saving, e.g. "Q-2026-5D0A-video.mp4". */
export function quoteVideoFileName(quoteNumber: string): string {
  const safe = quoteNumber.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
  return `${safe || "quote"}-video.mp4`;
}
