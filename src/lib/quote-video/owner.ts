import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { captureError } from "@/lib/observability";
import { quoteNumber } from "@/lib/quote-defaults";
import { QUOTE_VIDEO_BUCKET, QUOTE_VIDEO_SIGNED_URL_SECONDS } from "./constants";
import { describeQuoteVideo, quoteVideoFileName, type QuoteVideoRow, type QuoteVideoStatus } from "./status";

/**
 * Owner side of the quote video: request a render, read its status, and
 * fetch the finished file for sharing.
 *
 * `db` is the signed-in owner's client (RLS applies; every query also filters
 * by the owner's id from auth.getUser(), never an id from the browser).
 * `admin` is the service-role client, used only to sign URLs for, or read,
 * files in the private quote-videos bucket after the ownership check passed.
 */

type Db = SupabaseClient<Database>;

export type QuoteVideoResult = { ok: true; status: QuoteVideoStatus } | { ok: false; error: string };

export const QUOTE_VIDEO_MESSAGES = {
  signIn: "Please sign in again.",
  notFound: "We couldn't find that quote.",
  locked: "This quote has been accepted, so it doesn't need a video.",
  noItems: "Add at least one line to the quote first.",
  tooMany: "You've made a lot of videos in the last hour. Try again a bit later.",
  unavailable: "We couldn't check the video just now. Try again in a minute.",
  requestFailed: "We couldn't start the video. Try again in a minute.",
} as const;

/** request_quote_video's SQLSTATEs (migration 20260925_quote_videos.sql) in plain words. */
const REQUEST_ERRORS: Record<string, string> = {
  "28000": QUOTE_VIDEO_MESSAGES.signIn,
  P0002: QUOTE_VIDEO_MESSAGES.notFound,
  "42501": QUOTE_VIDEO_MESSAGES.notFound,
  "55000": QUOTE_VIDEO_MESSAGES.locked,
  "22023": QUOTE_VIDEO_MESSAGES.noItems,
  "54000": QUOTE_VIDEO_MESSAGES.tooMany,
};

type OwnerVideo =
  | { ok: true; quote: { id: string; version: number; created_at: string }; row: QuoteVideoRow | null }
  | { ok: false; error: "not_found" | "unavailable" };

async function readOwnerVideo(db: Db, userId: string, quoteId: string): Promise<OwnerVideo> {
  const quote = await db
    .from("quotes")
    .select("id, version, created_at")
    .eq("id", quoteId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (quote.error) return { ok: false, error: "unavailable" };
  if (!quote.data) return { ok: false, error: "not_found" };
  // Newest render first; the quote's current version decides whether it still counts.
  const video = await db
    .from("quote_videos")
    .select("quote_version, status, storage_path, poster_path")
    .eq("quote_id", quoteId)
    .eq("user_id", userId)
    .order("quote_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (video.error) return { ok: false, error: "unavailable" };
  return { ok: true, quote: quote.data, row: (video.data as QuoteVideoRow | null) ?? null };
}

/** The owner's card status, with 1-hour signed URLs for a ready video of the current version. */
export async function loadQuoteVideoStatus(db: Db, admin: Db, userId: string, quoteId: string): Promise<QuoteVideoResult> {
  const read = await readOwnerVideo(db, userId, quoteId);
  if (!read.ok) {
    return { ok: false, error: read.error === "not_found" ? QUOTE_VIDEO_MESSAGES.notFound : QUOTE_VIDEO_MESSAGES.unavailable };
  }
  const state = describeQuoteVideo(read.row, read.quote.version);
  if (state.kind !== "ready") return { ok: true, status: state };

  const signed = await admin.storage
    .from(QUOTE_VIDEO_BUCKET)
    .createSignedUrls([state.storagePath, state.posterPath], QUOTE_VIDEO_SIGNED_URL_SECONDS);
  const videoUrl = signed.data?.[0]?.signedUrl;
  const posterUrl = signed.data?.[1]?.signedUrl;
  if (signed.error || !videoUrl || !posterUrl) {
    captureError(signed.error ?? new Error("quote video signing returned no URL"), { route: "quote-video/status" });
    return { ok: false, error: QUOTE_VIDEO_MESSAGES.unavailable };
  }
  return {
    ok: true,
    status: {
      kind: "ready",
      videoUrl,
      posterUrl,
      fileName: quoteVideoFileName(quoteNumber(read.quote.id, read.quote.created_at)),
    },
  };
}

/** Queue a render of the quote's current version (request_quote_video checks ownership, lock, lines and the hourly limit). */
export async function requestQuoteVideo(db: Db, quoteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.rpc("request_quote_video", { p_quote_id: quoteId });
  if (!error) return { ok: true };
  const message = REQUEST_ERRORS[error.code ?? ""];
  if (!message) {
    // Unexpected (migration missing, database down): code only, no request data.
    captureError(new Error(`request_quote_video failed: ${error.code ?? "unknown"}`), { route: "quote-video/request" });
  }
  return { ok: false, error: message ?? QUOTE_VIDEO_MESSAGES.requestFailed };
}

/**
 * Message that travels with the shared MP4. The video says "Tap the link to
 * accept", so it carries the client's quote link — but only once the quote
 * has been sent (a draft's link shows "not found" by design).
 */
export function quoteVideoShareText({
  status,
  publicToken,
  appUrl,
}: {
  status: string | null;
  publicToken: string | null;
  appUrl: string;
}): string | undefined {
  if (!publicToken || (status !== "sent" && status !== "viewed")) return undefined;
  return `Here's a quick video of your quote. View and accept it here: ${appUrl.replace(/\/+$/, "")}/quote/${publicToken}`;
}

export type QuoteVideoFile =
  | { ok: true; bytes: ArrayBuffer; fileName: string }
  | { ok: false; status: 404 | 503 };

/** The ready MP4 of the quote's current version, for the owner's Share / Download buttons. */
export async function loadQuoteVideoFile(db: Db, admin: Db, userId: string, quoteId: string): Promise<QuoteVideoFile> {
  const read = await readOwnerVideo(db, userId, quoteId);
  if (!read.ok) return { ok: false, status: read.error === "not_found" ? 404 : 503 };
  const state = describeQuoteVideo(read.row, read.quote.version);
  if (state.kind !== "ready") return { ok: false, status: 404 };
  const file = await admin.storage.from(QUOTE_VIDEO_BUCKET).download(state.storagePath);
  if (file.error || !file.data) {
    captureError(file.error ?? new Error("quote video download returned no data"), { route: "quote-video/file" });
    return { ok: false, status: 503 };
  }
  return {
    ok: true,
    bytes: await file.data.arrayBuffer(),
    fileName: quoteVideoFileName(quoteNumber(read.quote.id, read.quote.created_at)),
  };
}
