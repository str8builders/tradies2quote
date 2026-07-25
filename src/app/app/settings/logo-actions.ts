"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/observability";

/**
 * Business-logo server actions for Settings.
 *
 * Sibling of the avatar actions in `app/_components/account-hub-actions.ts` —
 * same three-layer defence, but for the tradie's BRANDING logo that renders on
 * the professional quote / invoice PDFs sent to their clients.
 *
 * Storage layout (see migration 20260718_business_logo_bucket):
 *   bucket: business-logos (public read)
 *   path:   {auth.uid()}/{Date.now()}.{ext}
 *
 * Deliberately narrower than the avatar allow-list: JPG/PNG only (NO webp).
 * pdf-lib can only embed PNG/JPEG, and the SAME stored asset must render both
 * as an <img> on the public quote page AND embedded in the PDF — so we never
 * store a format the PDF can't use. The client compresses to PNG (transparency
 * preserved) or JPEG before upload, so a normal phone photo already arrives in
 * an accepted format well under the size backstop.
 */

const BUCKET = "business-logos";
// Backstop only — the client downscales to ~1024 px first, so a real logo is
// tens-to-low-hundreds of KB. Generous ceiling catches a prep failure without
// bouncing legitimate uploads (the old avatar 2 MB cap was the exact complaint).
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME: ReadonlyArray<string> = ["image/jpeg", "image/png"];

export type LogoActionResult =
  | { ok: true; logoUrl: string | null }
  | { ok: false; error: string };

/** Resolve a (mime, extension) pair from a File — JPG/PNG only. */
function resolveImage(
  file: File,
): { mime: string; ext: string } | { error: string } {
  const name = file.name || "";
  const lower = (file.type || "").toLowerCase();
  if (lower === "image/jpeg" || lower === "image/jpg")
    return { mime: "image/jpeg", ext: "jpg" };
  if (lower === "image/png") return { mime: "image/png", ext: "png" };
  // Empty / unknown mime → trust the extension (iOS Safari sometimes omits it).
  if (!lower) {
    if (/\.(jpe?g)$/i.test(name)) return { mime: "image/jpeg", ext: "jpg" };
    if (/\.png$/i.test(name)) return { mime: "image/png", ext: "png" };
  }
  if (/^image\/hei[cf]$/i.test(lower) || /\.hei[cf]$/i.test(name)) {
    return {
      error:
        "That iPhone photo didn't convert — try again, or pick a PNG/JPG logo.",
    };
  }
  return { error: "Use a PNG or JPG logo." };
}

async function uploadFileForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File,
): Promise<
  { ok: true; url: string; path: string } | { ok: false; error: string }
> {
  if (file.size === 0) return { ok: false, error: "Empty file." };
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: "Logo is too large — try a smaller image." };
  }
  const resolved = resolveImage(file);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  if (!ALLOWED_MIME.includes(resolved.mime)) {
    return { ok: false, error: "Use a PNG or JPG logo." };
  }

  const path = `${userId}/${Date.now()}.${resolved.ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: resolved.mime,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadErr) {
    return { ok: false, error: uploadErr.message || "Storage upload failed." };
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) {
    return { ok: false, error: "Could not build public URL." };
  }
  return { ok: true, url: pub.publicUrl, path };
}

/** Handle a multipart FormData with a `logo` file → persist `logo_url`. */
export async function uploadBusinessLogoAction(
  formData: FormData,
): Promise<LogoActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const raw = formData.get("logo");
  if (!(raw instanceof File)) return { ok: false, error: "No file." };

  const { data: prior } = await supabase
    .from("profiles")
    .select("logo_url")
    .eq("id", user.id)
    .maybeSingle();
  const priorUrl =
    prior && typeof (prior as { logo_url?: unknown }).logo_url === "string"
      ? (prior as { logo_url: string }).logo_url
      : null;

  const up = await uploadFileForUser(supabase, user.id, raw as File);
  if (!up.ok) return up;

  const { error: dbErr } = await supabase
    .from("profiles")
    .upsert({ id: user.id, logo_url: up.url }, { onConflict: "id" });
  if (dbErr) {
    await supabase.storage
      .from(BUCKET)
      .remove([up.path])
      .catch((e) => captureError(e, { route: "settings/logo-cleanup" }));
    return { ok: false, error: dbErr.message || "Could not save logo." };
  }

  // Best-effort delete of the previous logo object.
  if (priorUrl) {
    const priorPath = extractPathFromPublicUrl(priorUrl);
    if (priorPath) {
      await supabase.storage
        .from(BUCKET)
        .remove([priorPath])
        .catch((e) => captureError(e, { route: "settings/logo-cleanup" }));
    }
  }

  // The logo shows on PDFs (regenerated on demand) and the settings card.
  revalidatePath("/app/settings");
  return { ok: true, logoUrl: up.url };
}

/** Drop the business logo (storage file + profile column). */
export async function removeBusinessLogoAction(): Promise<LogoActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: prior } = await supabase
    .from("profiles")
    .select("logo_url")
    .eq("id", user.id)
    .maybeSingle();
  const priorUrl =
    prior && typeof (prior as { logo_url?: unknown }).logo_url === "string"
      ? (prior as { logo_url: string }).logo_url
      : null;

  const { error: dbErr } = await supabase
    .from("profiles")
    .upsert({ id: user.id, logo_url: null }, { onConflict: "id" });
  if (dbErr) {
    return { ok: false, error: dbErr.message || "Could not clear logo." };
  }

  if (priorUrl) {
    const path = extractPathFromPublicUrl(priorUrl);
    if (path) {
      await supabase.storage
        .from(BUCKET)
        .remove([path])
        .catch((e) => captureError(e, { route: "settings/logo-cleanup" }));
    }
  }

  revalidatePath("/app/settings");
  return { ok: true, logoUrl: null };
}

/**
 * Given a Supabase public URL like
 *   https://xxx/storage/v1/object/public/business-logos/{uid}/{ts}.png
 * return the object path inside the bucket (`{uid}/{ts}.png`), or null if the
 * URL isn't one of ours (so we never delete from a different bucket).
 */
function extractPathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return url.slice(idx + marker.length);
}
