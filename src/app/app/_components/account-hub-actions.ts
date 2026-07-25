"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/observability";

/**
 * Wave 14.7 — avatar photo server actions for the account hub.
 *
 * Two actions:
 *   - uploadAvatarAction(formData)  → upload + persist public URL
 *   - removeAvatarAction()          → delete file + null the column
 *
 * Storage layout (matches the Wave 14.7 migration):
 *   bucket: profile-avatars (public read)
 *   path:   {auth.uid()}/{Date.now()}.{ext}
 *
 * Defense-in-depth:
 *   - File type allow-list (jpg/jpeg/png/webp) AND server-side
 *     enforcement of the same list via mime check. The storage bucket
 *     itself ALSO enforces the same mime allow-list, so a bad upload
 *     is rejected twice — once by us, once by Postgres-side storage.
 *   - Generous size backstop, server-checked. The client compresses every
 *     pick first (prepareAvatarImage), so the cap only catches a prep failure.
 *   - Path always prefixed with the authenticated user's uid; the
 *     storage RLS policies ("Avatars: insert own" etc.) reject anything
 *     outside `{auth.uid()}/...`, so the user cannot write to anyone
 *     else's folder even if a future caller forgets to prefix.
 *
 * Failure mode: any error returns `{ ok: false, error: string }` and
 * leaves the existing avatar untouched. The client surfaces the error
 * and the initials fallback continues to render.
 */

const BUCKET = "profile-avatars";
// Backstop only. The client compresses every pick to ~512 px before upload
// (see prepareAvatarImage), so a real photo lands in the tens of KB; this
// generous ceiling only catches a client-prep failure. (The old 2 MB cap was
// the "FILE IS OVER 2 MB" complaint — raised so normal phone photos pass.)
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME: ReadonlyArray<string> = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export type AvatarActionResult =
  | { ok: true; avatarUrl: string | null }
  | { ok: false; error: string };

/**
 * Resolve a (mime, extension) pair from a File. Mobile browsers
 * sometimes hand us `image/jpg` (instead of `image/jpeg`) or an empty
 * file.type — in those cases we fall back to the filename's
 * extension. iPhone HEIC pickups that didn't get auto-converted by
 * iOS get rejected with a clear, actionable error rather than
 * disappearing into a generic storage failure.
 */
function resolveImage(file: File): { mime: string; ext: string } | { error: string } {
  const name = file.name || "";
  const lower = (file.type || "").toLowerCase();
  if (lower === "image/jpeg" || lower === "image/jpg") return { mime: "image/jpeg", ext: "jpg" };
  if (lower === "image/png") return { mime: "image/png", ext: "png" };
  if (lower === "image/webp") return { mime: "image/webp", ext: "webp" };
  // Empty / unknown mime → trust the extension. iOS Safari sometimes
  // omits the mime for camera-roll picks.
  if (!lower) {
    if (/\.(jpe?g)$/i.test(name)) return { mime: "image/jpeg", ext: "jpg" };
    if (/\.png$/i.test(name)) return { mime: "image/png", ext: "png" };
    if (/\.webp$/i.test(name)) return { mime: "image/webp", ext: "webp" };
  }
  if (/^image\/hei[cf]$/i.test(lower) || /\.hei[cf]$/i.test(name)) {
    return {
      error:
        "iPhone HEIC photo — open it in Photos, share → save as JPEG, then pick that.",
    };
  }
  return { error: "Use a JPG, PNG, or WebP image." };
}

/**
 * Returns the storage object name (e.g. `abc.../1700000000000.jpg`)
 * encoded in a public URL. We persist the URL rather than the bare
 * path so `<img src>` works without any client-side compose step.
 */
async function uploadFileForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File,
): Promise<{ ok: true; url: string; path: string } | { ok: false; error: string }> {
  if (file.size === 0) {
    return { ok: false, error: "Empty file." };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: "Image is too large — try a smaller one." };
  }
  const resolved = resolveImage(file);
  if ("error" in resolved) {
    return { ok: false, error: resolved.error };
  }
  if (!ALLOWED_MIME.includes(resolved.mime)) {
    // Safety net — resolveImage shouldn't return a mime outside this
    // list, but if it ever does, the storage bucket's own allow-list
    // would reject anyway.
    return { ok: false, error: "Unsupported image format." };
  }

  const path = `${userId}/${Date.now()}.${resolved.ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      // Always send a normalised contentType. Some mobile browsers
      // pass file.type === "" which makes the storage bucket use a
      // generic application/octet-stream and may also block via the
      // bucket's allowed_mime_types policy.
      contentType: resolved.mime,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadErr) {
    return {
      ok: false,
      error: uploadErr.message || "Storage upload failed.",
    };
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) {
    return { ok: false, error: "Could not build public URL." };
  }
  return { ok: true, url: pub.publicUrl, path };
}

/**
 * Server action — handle a multipart FormData with `avatar` file.
 * Returns the new URL (or an error). The caller revalidates the app
 * tree via the `revalidatePath` calls below so every header / sheet
 * picks up the new avatar without a hard refresh.
 */
export async function uploadAvatarAction(
  formData: FormData,
): Promise<AvatarActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const raw = formData.get("avatar");
  if (!(raw instanceof File)) {
    return { ok: false, error: "No file." };
  }

  // Capture the existing URL so we can clean it up after the new
  // upload + DB update succeed. We never block the upload on the
  // delete — orphaned files don't break anything, they just waste
  // a tiny bit of bucket space until the next upload tidies.
  const { data: prior } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const priorUrl =
    prior && typeof (prior as { avatar_url?: unknown }).avatar_url === "string"
      ? (prior as { avatar_url: string }).avatar_url
      : null;

  const up = await uploadFileForUser(supabase, user.id, raw as File);
  if (!up.ok) return up;

  // Persist URL on the user's profile row. RLS already gates writes
  // to profiles by id = auth.uid().
  const { error: dbErr } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, avatar_url: up.url },
      { onConflict: "id" },
    );
  if (dbErr) {
    // Best-effort cleanup of the new object so we don't leave an
    // orphan in storage on a DB failure.
    await supabase.storage.from(BUCKET).remove([up.path]).catch((e) => captureError(e, { route: "account-hub/avatar-cleanup" }));
    return { ok: false, error: dbErr.message || "Could not save avatar." };
  }

  // Best-effort delete of the previous object. Ignore errors — the
  // new avatar is live regardless.
  if (priorUrl) {
    const priorPath = extractPathFromPublicUrl(priorUrl);
    if (priorPath) {
      await supabase.storage.from(BUCKET).remove([priorPath]).catch((e) => captureError(e, { route: "account-hub/avatar-cleanup" }));
    }
  }

  // Repaint every surface that shows the avatar.
  revalidatePath("/app", "layout");
  return { ok: true, avatarUrl: up.url };
}

/**
 * Server action — drop the user's avatar (storage file + profile column).
 */
export async function removeAvatarAction(): Promise<AvatarActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const { data: prior } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const priorUrl =
    prior && typeof (prior as { avatar_url?: unknown }).avatar_url === "string"
      ? (prior as { avatar_url: string }).avatar_url
      : null;

  // Null the column first so the UI flips to initials immediately on
  // refresh, regardless of storage cleanup.
  const { error: dbErr } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, avatar_url: null },
      { onConflict: "id" },
    );
  if (dbErr) {
    return { ok: false, error: dbErr.message || "Could not clear avatar." };
  }

  if (priorUrl) {
    const path = extractPathFromPublicUrl(priorUrl);
    if (path) {
      await supabase.storage.from(BUCKET).remove([path]).catch((e) => captureError(e, { route: "account-hub/avatar-cleanup" }));
    }
  }

  revalidatePath("/app", "layout");
  return { ok: true, avatarUrl: null };
}

/**
 * Given a Supabase public URL like
 *   https://xxx.supabase.co/storage/v1/object/public/profile-avatars/{uid}/{ts}.jpg
 * return the object path inside the bucket (`{uid}/{ts}.jpg`).
 *
 * Returns null if the URL doesn't look like one of ours — we never
 * want to accidentally delete an object from a different bucket.
 */
function extractPathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return url.slice(idx + marker.length);
}
