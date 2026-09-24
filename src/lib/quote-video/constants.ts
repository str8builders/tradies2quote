/**
 * Quote video — values shared by the app, the Remotion composition
 * (src/remotion/quote-video) and the render worker
 * (scripts/quote-video-worker.mjs).
 *
 * The worker loads this file with Node's built-in TypeScript type stripping,
 * so it must stay free of runtime imports other than relative `.ts` paths: no
 * `@/` aliases, no `server-only`, no JSX.
 */

/** Private storage bucket (migration 20260925_quote_videos.sql). */
export const QUOTE_VIDEO_BUCKET = "quote-videos";

/** The Remotion composition registered in src/remotion/index.tsx. */
export const QUOTE_VIDEO_COMPOSITION = {
  id: "QuoteVideo",
  width: 720,
  height: 1280,
  fps: 30,
  durationInFrames: 450,
} as const;

/**
 * Scene timings in frames (30 fps):
 *   brand   0–2 s   logo and business name
 *   client  2–5 s   "Quote for {first name}" and the job in one line
 *   items   5–10 s  up to four key items, one by one
 *   total   10–13 s the total counts up and lands on the exact figure
 *   accept  13–15 s "Tap the link to accept" and the valid-until date
 * The total stays on screen from `countEnd` to the last frame.
 */
export const QUOTE_VIDEO_TIMELINE = {
  brand: { from: 0, to: 60 },
  client: { from: 60, to: 150 },
  items: { from: 150, to: 300 },
  total: { from: 300, to: 390 },
  accept: { from: 390, to: 450 },
  /** The count-up runs from `countStart` and shows the exact total from `countEnd` on. */
  countStart: 308,
  countEnd: 362,
} as const;

/** Poster frame: the exact total has landed, before the call to action slides in. */
export const QUOTE_VIDEO_POSTER_FRAME = 380;

/** Key items shown in the video; the rest are summed up as "+ N more". */
export const QUOTE_VIDEO_MAX_ITEMS = 4;

/** Render attempts per request: the worker re-queues a failed render until this many. */
export const QUOTE_VIDEO_MAX_ATTEMPTS = 3;

/** Lifetime of the signed video and poster URLs handed to a browser. */
export const QUOTE_VIDEO_SIGNED_URL_SECONDS = 60 * 60;

export type QuoteVideoRowStatus = "queued" | "rendering" | "ready" | "failed";

/**
 * Object paths for one rendered version. Every file sits under the owner's
 * user id, which the account purge removes as one prefix.
 */
export function quoteVideoPaths(userId: string, quoteId: string, version: number) {
  const folder = `${userId}/${quoteId}`;
  return {
    folder,
    video: `${folder}/v${version}.mp4`,
    poster: `${folder}/v${version}.jpg`,
  };
}

/** Version number of a file written by {@link quoteVideoPaths}, or null for any other name. */
export function quoteVideoFileVersion(fileName: string): number | null {
  const match = /^v(\d{1,9})\.(mp4|jpg)$/.exec(fileName);
  return match ? Number(match[1]) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
