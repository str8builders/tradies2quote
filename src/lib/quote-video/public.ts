import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { QUOTE_VIDEO_BUCKET, QUOTE_VIDEO_SIGNED_URL_SECONDS } from "./constants";
import { publicQuoteVideoFiles, type QuoteVideoRow } from "./status";

export type PublicQuoteVideo = { videoUrl: string; posterUrl: string };

/**
 * The video for the client's quote link: a ready render of the quote's
 * CURRENT version, as two 1-hour signed URLs (the bucket is private). Called
 * with the service-role client after get_quote_by_token resolved the token,
 * and only for a live (sent/viewed) quote. Returns null — never throws — for
 * no video, an older version, or any read/sign failure: the quote page must
 * render without it.
 */
export async function loadPublicQuoteVideo(
  admin: SupabaseClient<Database>,
  quote: { id: string; version: number },
): Promise<PublicQuoteVideo | null> {
  if (!Number.isInteger(quote.version)) return null;
  try {
    const { data, error } = await admin
      .from("quote_videos")
      .select("quote_version, status, storage_path, poster_path")
      .eq("quote_id", quote.id)
      .eq("quote_version", quote.version)
      .eq("status", "ready")
      .maybeSingle();
    if (error || !data) return null;
    const files = publicQuoteVideoFiles(data as QuoteVideoRow, quote.version);
    if (!files) return null;
    const signed = await admin.storage
      .from(QUOTE_VIDEO_BUCKET)
      .createSignedUrls([files.video, files.poster], QUOTE_VIDEO_SIGNED_URL_SECONDS);
    const videoUrl = signed.data?.[0]?.signedUrl;
    const posterUrl = signed.data?.[1]?.signedUrl;
    if (signed.error || !videoUrl || !posterUrl) return null;
    return { videoUrl, posterUrl };
  } catch {
    return null;
  }
}
