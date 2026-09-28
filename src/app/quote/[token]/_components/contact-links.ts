/**
 * The tradie's phone and email on the client's quote page, as real links.
 *
 * iOS Safari turns plain-text phone numbers (and email addresses) into links
 * before React hydrates, which breaks hydration (React #418). Rendering them
 * as links ourselves leaves Safari nothing to rewrite, and the client can tap
 * to call or email. The number reads as the tradie typed it; the href is the
 * digits only (a leading + kept).
 */

/** "tel:" href for a phone number typed any way; null when it has too few digits to dial. */
export function telHref(phone: string | null | undefined): string | null {
  const typed = (phone ?? "").trim();
  const digits = typed.replace(/\D/g, "");
  if (digits.length < 3) return null;
  return `tel:${typed.startsWith("+") ? "+" : ""}${digits}`;
}

const EMAIL = /^[^\s@<>"',;:()[\]]+@[^\s@<>"',;:()[\]]+\.[^\s@<>"',;:()[\]]+$/;

/** "mailto:" href for an email address; null when it doesn't look like one. */
export function mailtoHref(email: string | null | undefined): string | null {
  const typed = (email ?? "").trim();
  return EMAIL.test(typed) ? `mailto:${typed}` : null;
}
