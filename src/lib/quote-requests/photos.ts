import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { captureError } from "@/lib/observability";
import { MAX_PHOTO_BYTES, PHOTO_BUCKET, normaliseQuotePhoto } from "@/lib/quote-photos";
import { runPhotoPlanAgent, type PhotoPlanResult } from "@/lib/agents/photo-plan";

/**
 * Photos a client attaches to a public quote request.
 *
 * Stored in the same private bucket and attachments table as the tradie's
 * own photos (so the quote editor and the public quote page show them),
 * registered through `register_request_photo`, which applies the draft-only
 * rule and the 8-photo cap but no plan gate — the client is sending them in.
 */

export const MAX_REQUEST_PHOTOS = 3;
export { MAX_PHOTO_BYTES };

export type IncomingPhoto = { bytes: Uint8Array; name: string };
export type StoredPhoto = { id: string; name: string; jpeg: Buffer };

export async function storeRequestPhotos(opts: {
  admin: SupabaseClient<Database>;
  tradieUserId: string;
  quoteId: string;
  photos: IncomingPhoto[];
}): Promise<StoredPhoto[]> {
  const { admin, tradieUserId, quoteId } = opts;
  const stored: StoredPhoto[] = [];
  for (const photo of opts.photos.slice(0, MAX_REQUEST_PHOTOS)) {
    let jpeg: Buffer;
    try {
      jpeg = await normaliseQuotePhoto(photo.bytes);
    } catch {
      continue; // not a usable still image — skip, never fail the request
    }
    const path = `${tradieUserId}/${quoteId}/${randomUUID()}.jpg`;
    const name = photo.name.replace(/[\x00-\x1f]/g, "").slice(0, 150) || "Client photo";
    try {
      const upload = await admin.storage
        .from(PHOTO_BUCKET)
        .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
      if (upload.error) throw upload.error;
      const registered = await admin.rpc("register_request_photo" as never, {
        p_data: { quote_id: quoteId, user_id: tradieUserId, path, name },
      } as never);
      if (registered.error) {
        await admin.storage.from(PHOTO_BUCKET).remove([path]);
        throw registered.error;
      }
      const row = registered.data as { id?: string } | null;
      stored.push({ id: row?.id ?? path, name, jpeg });
    } catch (e) {
      captureError(e, { route: "quote-requests/photos" });
    }
  }
  return stored;
}

/** Plain-text notes the quote model can use; pure, testable. */
export function composePhotoNotes(
  results: Array<{ name: string; result: PhotoPlanResult | null }>,
): string {
  const lines: string[] = [];
  results.forEach(({ result }, i) => {
    if (!result) return;
    const items = result.items
      .slice(0, 8)
      .map((it) => it.label)
      .filter((n) => typeof n === "string" && n.trim().length > 0);
    const parts = [`Client photo ${i + 1}: ${result.description.trim()}`];
    if (items.length > 0) parts.push(`Items seen: ${items.join(", ")}.`);
    if (result.reviewFlags.length > 0) {
      parts.push(`Check on site: ${result.reviewFlags.slice(0, 4).join("; ")}.`);
    }
    lines.push(parts.join(" ").slice(0, 700));
  });
  return lines.join("\n");
}

/**
 * Describe each stored photo with the vision agent and append the notes to
 * the draft's transcript so the generated quote reflects what the client
 * showed. Best effort: no OpenAI key, or any failure, means no notes.
 */
export async function describePhotosIntoTranscript(opts: {
  admin: SupabaseClient<Database>;
  tradieUserId: string;
  quoteId: string;
  photos: StoredPhoto[];
  describe?: (photo: StoredPhoto) => Promise<PhotoPlanResult | null>;
}): Promise<string> {
  const { admin, tradieUserId, quoteId, photos } = opts;
  if (photos.length === 0) return "";
  if (!opts.describe && !process.env.OPENAI_API_KEY?.trim()) return "";
  const describe =
    opts.describe ??
    (async (photo: StoredPhoto) =>
      runPhotoPlanAgent({
        imageBase64: photo.jpeg.toString("base64"),
        mimeType: "image/jpeg",
        hint: "Photo sent by a client with a quote request. Describe what a NZ tradie needs to know to quote the job.",
      }));

  const results: Array<{ name: string; result: PhotoPlanResult | null }> = [];
  for (const photo of photos) {
    try {
      results.push({ name: photo.name, result: await describe(photo) });
    } catch (e) {
      captureError(e, { route: "quote-requests/photo-describe" });
      results.push({ name: photo.name, result: null });
    }
  }
  const notes = composePhotoNotes(results);
  if (!notes) return "";

  const { data: quote } = await admin
    .from("quotes")
    .select("voice_transcript")
    .eq("id", quoteId)
    .eq("user_id", tradieUserId)
    .maybeSingle();
  const transcript = (quote?.voice_transcript ?? "").trim();
  const { error } = await admin
    .from("quotes")
    .update({
      voice_transcript: `${transcript}\n\nWhat the client's photos show (AI-read from the photos — confirm on site before pricing):\n${notes}`,
    })
    .eq("id", quoteId)
    .eq("user_id", tradieUserId);
  if (error) captureError(error, { route: "quote-requests/photo-transcript" });
  return notes;
}
