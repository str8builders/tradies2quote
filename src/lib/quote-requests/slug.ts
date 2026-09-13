/**
 * Public request-link slugs: `tradies2quote.com/r/<slug>`.
 *
 * Mirrors the database check constraint `profiles_request_slug_shape` —
 * lowercase letters, digits and single hyphens, 2–48 characters, never
 * starting or ending with a hyphen. Keep the two in sync.
 */
export const REQUEST_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/;

export function isValidRequestSlug(value: string): boolean {
  return REQUEST_SLUG_RE.test(value);
}

/** Derive a slug from a business name; "" when nothing usable remains. */
export function slugifyBusinessName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length >= 2 ? base : "";
}

const SUFFIX_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** `base-x7k2` — used when the plain slug is already taken. */
export function withRandomSuffix(base: string, random: () => number = Math.random): string {
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += SUFFIX_ALPHABET[Math.floor(random() * SUFFIX_ALPHABET.length)];
  }
  const trimmed = base.slice(0, 43).replace(/-+$/g, "");
  return `${trimmed || "tradie"}-${suffix}`;
}

export function requestLinkFor(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, "")}/r/${slug}`;
}
