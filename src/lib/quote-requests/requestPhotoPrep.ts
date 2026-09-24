// Client-safe rules for the photos a client attaches to a public quote
// request (RequestForm). The photos are compressed on the device first
// (imagePrep.prepareRequestPhoto); these checks decide what can be sent so
// the request body stays under the proxy's cut-off — a body over it was
// truncated, and the lead was lost behind a misleading "fill in the form"
// 400. Limits mirror src/lib/quote-requests/photos.ts on the server.

export const MAX_REQUEST_PHOTOS = 3;
/** Per photo AFTER compression — the server skips anything larger. */
export const MAX_PREPARED_PHOTO_BYTES = 10 * 1024 * 1024;
/** Before compression — refuse absurd files before decoding them. */
export const MAX_SOURCE_PHOTO_BYTES = 30 * 1024 * 1024;
/** All photos together: leaves room for the text fields under a 10 MB body limit. */
export const MAX_TOTAL_PHOTO_BYTES = 8 * 1024 * 1024;

export const REQUEST_PHOTO_AI_NOTICE =
  "Photos help the tradie understand the job. They're described by an AI service (OpenAI) and stored privately for this quote.";

export const REQUEST_PHOTO_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const SENDABLE = /^image\/(jpeg|png|webp)$/i;

/** Types the device can send, or convert first (iPhone HEIC → JPEG). */
export function isAcceptedRequestPhoto(file: Pick<File, "type" | "name">): boolean {
  if (SENDABLE.test(file.type) || /^image\/hei[cf]$/i.test(file.type)) return true;
  // Some browsers hand over HEIC with an empty type.
  return !file.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const totalBytes = (files: Array<Pick<File, "size">>) => files.reduce((n, f) => n + f.size, 0);

/**
 * Compress and add newly picked photos. Returns the new list plus a plain
 * message for anything that couldn't be added (empty when all went in).
 */
export async function addRequestPhotos(
  existing: File[],
  picked: File[],
  prepare: (file: File) => Promise<File>,
): Promise<{ photos: File[]; note: string }> {
  const photos = [...existing];
  const notes: string[] = [];
  for (const file of picked) {
    if (photos.length >= MAX_REQUEST_PHOTOS) {
      notes.push(`Up to ${MAX_REQUEST_PHOTOS} photos.`);
      break;
    }
    if (!isAcceptedRequestPhoto(file)) {
      notes.push(`${file.name}: use a JPEG, PNG, WebP or iPhone photo.`);
      continue;
    }
    if (file.size > MAX_SOURCE_PHOTO_BYTES) {
      notes.push(`${file.name} is ${mb(file.size)} — too large to send. Try a smaller photo.`);
      continue;
    }
    let prepared: File;
    try {
      prepared = await prepare(file);
    } catch {
      notes.push(`${file.name} couldn't be read. Try a JPEG, or take the photo again.`);
      continue;
    }
    if (!SENDABLE.test(prepared.type)) {
      notes.push(`${file.name} couldn't be converted on this device. Try a JPEG or PNG.`);
      continue;
    }
    if (prepared.size > MAX_PREPARED_PHOTO_BYTES) {
      notes.push(`${file.name} is still ${mb(prepared.size)} after compressing — too large to send. Try a smaller photo.`);
      continue;
    }
    if (totalBytes([...photos, prepared]) > MAX_TOTAL_PHOTO_BYTES) {
      notes.push(`${file.name} would make the photos too large to send together. Remove a photo first.`);
      continue;
    }
    photos.push(prepared);
  }
  return { photos, note: notes.join(" ") };
}

/** Last check before sending: a clear message instead of a truncated upload. */
export function requestPhotosTooLarge(photos: Array<Pick<File, "size">>): string | null {
  const total = totalBytes(photos);
  if (total <= MAX_TOTAL_PHOTO_BYTES) return null;
  return `Your photos add up to ${mb(total)}, which is too large to send. Remove a photo (or send without photos) and try again — your details are still here.`;
}

/** Shown when the server refuses the upload as too large (HTTP 413). */
export const REQUEST_TOO_LARGE_MESSAGE =
  "Your photos were too large to send. Remove a photo (or send without photos) and try again — your details are still here.";
